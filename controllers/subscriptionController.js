const crypto = require("crypto");
const razorpay = require("../config/razorpay");
const supabase = require("../config/supabase");
const { sendMail } = require("../config/mailer");
const { subscriptionWelcomeEmail, adminNotificationEmail } = require("../emails/templates");

// ─── Frequency → Razorpay period mapping ─────────────────────────────────────
const FREQUENCY_MAP = {
  monthly:     { period: "monthly",  interval: 1 },
  quarterly:   { period: "monthly",  interval: 3 },
  half_yearly: { period: "monthly",  interval: 6 },
  yearly:      { period: "yearly",   interval: 1 },
};

// ─── Ensure plan exists or reuse existing ────────────────────────────────────
async function getOrCreatePlan(frequency, amountInPaise) {
  const { period, interval } = FREQUENCY_MAP[frequency];

  // Check if plan already exists in Supabase
  const { data: existing, error: findErr } = await supabase
    .from("subscription_plans")
    .select("razorpay_plan_id")
    .eq("frequency", frequency)
    .eq("amount", amountInPaise / 100)
    .maybeSingle();

  if (findErr) {
    console.warn("[DB] Error finding existing plan:", findErr);
  }

  // Debug: trace plan reuse
  console.log(`[SUBSCRIPTION] Plan search: Amount=${amountInPaise / 100}, Frequency=${frequency}`);
  if (existing?.razorpay_plan_id) {
    console.log(`[SUBSCRIPTION] Cached plan found: ${existing.razorpay_plan_id}. Verifying with Razorpay...`);
    try {
      // Verify the plan actually exists in Razorpay
      await razorpay.plans.fetch(existing.razorpay_plan_id);
      console.log(`[SUBSCRIPTION] Plan verified. Reusing ${existing.razorpay_plan_id}`);
      return existing.razorpay_plan_id;
    } catch (err) {
      console.warn(`[SUBSCRIPTION] Cached plan ${existing.razorpay_plan_id} is invalid or expired. Creating fresh one...`);
      // Optional: Delete the bad entry from DB so we don't try it again
      await supabase.from("subscription_plans").delete().eq("razorpay_plan_id", existing.razorpay_plan_id);
    }
  }

  console.log(`[SUBSCRIPTION] Creating NEW Razorpay plan for ${amountInPaise / 100} ${frequency}`);
  // Create new plan in Razorpay
  const plan = await razorpay.plans.create({
    period,
    interval,
    item: {
      name: `${process.env.NGO_NAME || "NGO"} — ${frequency} donation`,
      amount: amountInPaise,
      currency: "INR",
      description: `Auto-pay ${frequency} donation`,
    },
  });

  // Store plan in Supabase
  const { error: insErr } = await supabase.from("subscription_plans").insert({
    razorpay_plan_id: plan.id,
    frequency,
    amount: amountInPaise / 100,
  });

  if (insErr) {
    console.error("[DB] Error storing new plan:", insErr);
  }

  return plan.id;
}

// ─── Create Subscription ─────────────────────────────────────────────────────
async function createSubscription(req, res) {
  try {
    const { name, email, phone, amount, frequency, message, pan } = req.body;

    if (!name || !email || !amount || !frequency) {
      return res.status(400).json({ error: "name, email, amount and frequency are required" });
    }

    if (!FREQUENCY_MAP[frequency]) {
      return res.status(400).json({ error: "frequency must be monthly | quarterly | half_yearly | yearly" });
    }

    const amountInPaise = Math.round(parseFloat(amount) * 100);
    if (amountInPaise < 100) {
      return res.status(400).json({ error: "Minimum donation is ₹1" });
    }

    // ─── Get or Create Razorpay Customer ──────────────────────────────────────
    const customerList = await razorpay.customers.all({ count: 100 });
    const existingCustomer = customerList.items.find((c) => c.email === email);

    let customer;
    const customerName = name;

    if (existingCustomer) {
      customer = await razorpay.customers.edit(existingCustomer.id, {
        name: customerName,
        contact: phone || "",
        notes: { pan: pan || "N/A" },
      });
    } else {
      customer = await razorpay.customers.create({
        name: customerName,
        email,
        contact: phone || "",
        notes: { pan: pan || "N/A" },
      });
    }

    const planId = await getOrCreatePlan(frequency, amountInPaise);

    // Razorpay enforces end_time <= year 2120. 
    // We set total_count to a high value to simulate "ongoing" until user cancels.
    // Monthly (10 years) = 120, Quarterly = 40, etc.
    const TOTAL_COUNT_BY_FREQUENCY = {
      monthly: 12,
      quarterly: 4,
      half_yearly: 2,
      yearly: 1,
    };
    const total_count = TOTAL_COUNT_BY_FREQUENCY[frequency] || 12;

    const subscription = await razorpay.subscriptions.create({
      plan_id: planId,
      customer_id: customer.id,
      total_count,
      quantity: 1,
      customer_notify: 1,
      notes: { name, email, phone: phone || "", message: message || "", pan: pan || "" },
    });

    // Persist to Supabase
    const { error: dbErr } = await supabase.from("subscriptions").insert({
      razorpay_subscription_id: subscription.id,
      razorpay_plan_id: planId,
      name,
      email,
      phone: phone || null,
      amount: parseFloat(amount),
      frequency,
      message: message || null,
      status: "created",
    });

    if (dbErr) {
      console.error("[DB] Subscription registration error:", JSON.stringify(dbErr, null, 2));
      return res.status(500).json({ error: "Database registration failed", details: dbErr.message || dbErr });
    }

    return res.json({
      subscriptionId: subscription.id,
      keyId: process.env.RAZORPAY_KEY_ID,
      customerId: customer.id,
      name,
      email,
      phone: phone || "",
      amount: amountInPaise,
      frequency,
    });
  } catch (err) {
    console.error("[CREATE_SUBSCRIPTION_ERROR]", {
      message: err.message,
      code: err.code,
      description: err.description,
      metadata: err.metadata,
      stack: err.stack,
    });
    
    return res.status(500).json({ 
      error: "Failed to create subscription",
      details: err.description || err.message || "Unknown Razorpay error"
    });
  }
}

// ─── Verify subscription first payment & send welcome email ──────────────────
async function verifySubscription(req, res) {
  try {
    const {
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_signature,
    } = req.body;

    if (!razorpay_payment_id || !razorpay_subscription_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing subscription verification fields" });
    }

    // Signature check
    const expectedSig = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_payment_id}|${razorpay_subscription_id}`)
      .digest("hex");

    if (expectedSig !== razorpay_signature) {
      return res.status(400).json({ error: "Subscription signature mismatch" });
    }

    // Update DB
    const { data: subs, error: dbErr } = await supabase
      .from("subscriptions")
      .update({
        status: "active",
        razorpay_payment_id,
        razorpay_signature,
        activated_at: new Date().toISOString(),
      })
      .eq("razorpay_subscription_id", razorpay_subscription_id)
      .select();

    if (dbErr || !subs?.length) {
      console.error("Subscription DB update error:", dbErr?.message);
      return res.status(500).json({ error: "DB update failed" });
    }

    const sub = subs[0];

    // Calculate next charge date
    const nextCharge = getNextChargeDate(sub.frequency);

    // Send welcome email
    try {
      await sendMail(
        sub.email,
        `♻️ Your Recurring Donation is Active — ${process.env.NGO_NAME}`,
        subscriptionWelcomeEmail({
          name: sub.name,
          email: sub.email,
          amount: sub.amount,
          frequency: sub.frequency,
          subscriptionId: razorpay_subscription_id,
          nextChargeDate: nextCharge,
        })
      );
    } catch (emailErr) {
      console.error("Subscription welcome email failed:", emailErr);
    }

    // Admin notification
    if (process.env.ADMIN_EMAIL) {
      try {
        await sendMail(
          process.env.ADMIN_EMAIL,
          `🔔 New Subscription: ₹${sub.amount} from ${sub.name}`,
          adminNotificationEmail({
            donorName: sub.name,
            donorEmail: sub.email,
            donorPhone: sub.phone,
            donorPan: sub.pan || "N/A",
            amount: sub.amount,
            paymentId: razorpay_subscription_id,
            type: "Recurring Subscription",
            details: `Frequency: ${sub.frequency}`,
          })
        );
      } catch (adminEmailErr) {
        console.error("Admin notification failed:", adminEmailErr);
      }
    }

    return res.json({ success: true, subscriptionId: razorpay_subscription_id });
  } catch (err) {
    console.error("verifySubscription error:", err);
    return res.status(500).json({ error: "Verification failed" });
  }
}

// ─── Cancel Subscription ─────────────────────────────────────────────────────
async function cancelSubscription(req, res) {
  try {
    const { subscriptionId } = req.params;
    if (!subscriptionId) return res.status(400).json({ error: "subscriptionId is required" });

    await razorpay.subscriptions.cancel(subscriptionId, true); // cancel at end of billing cycle

    await supabase
      .from("subscriptions")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("razorpay_subscription_id", subscriptionId);

    return res.json({ success: true, message: "Subscription cancelled" });
  } catch (err) {
    console.error("cancelSubscription error:", err);
    return res.status(500).json({ error: "Cancellation failed" });
  }
}

// ─── Helper: Next charge date ─────────────────────────────────────────────────
function getNextChargeDate(frequency) {
  const d = new Date();
  if (frequency === "monthly")     d.setMonth(d.getMonth() + 1);
  if (frequency === "quarterly")   d.setMonth(d.getMonth() + 3);
  if (frequency === "half_yearly") d.setMonth(d.getMonth() + 6);
  if (frequency === "yearly")      d.setFullYear(d.getFullYear() + 1);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
}

module.exports = { createSubscription, verifySubscription, cancelSubscription };
