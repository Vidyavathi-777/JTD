const crypto = require("crypto");
const razorpay = require("../config/razorpay");
const supabase = require("../config/supabase");
const { sendMail } = require("../config/mailer");
const { subscriptionWelcomeEmail } = require("../emails/templates");

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
  const { data: existing } = await supabase
    .from("subscription_plans")
    .select("razorpay_plan_id")
    .eq("frequency", frequency)
    .eq("amount", amountInPaise / 100)
    .maybeSingle();

  if (existing?.razorpay_plan_id) return existing.razorpay_plan_id;

  // Create new plan in Razorpay
  const plan = await razorpay.plans.create({
    period,
    interval,
    item: {
      name: `${process.env.NGO_NAME} — ${frequency} donation`,
      amount: amountInPaise,
      currency: "INR",
      description: `Auto-pay ${frequency} donation`,
    },
  });

  // Store plan in Supabase
  await supabase.from("subscription_plans").insert({
    razorpay_plan_id: plan.id,
    frequency,
    amount: amountInPaise / 100,
  });

  return plan.id;
}

// ─── Create Subscription ─────────────────────────────────────────────────────
async function createSubscription(req, res) {
  try {
    const { name, email, phone, amount, frequency, message } = req.body;

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

    const planId = await getOrCreatePlan(frequency, amountInPaise);

    // Razorpay enforces end_time <= year 2120. Calculate safe total_count based on chosen frequency.
    // The Razorpay absolute max total_count is 1200, but higher frequencies with interval>1 can overflow end_time.
    const TOTAL_COUNT_BY_FREQUENCY = {
      monthly: 12,    // 12 months = 1 year
      quarterly: 4,   // 4 quarters = 1 year
      half_yearly: 2, // 2 half-years = 1 year
      yearly: 1,      // 1 year = 1 year
    };
    const total_count = TOTAL_COUNT_BY_FREQUENCY[frequency];

    const subscription = await razorpay.subscriptions.create({
      plan_id: planId,
      total_count,
      quantity: 1,
      customer_notify: 1,
      notes: { name, email, phone: phone || "", message: message || "" },
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
      console.error("Supabase subscription insert error:", JSON.stringify(dbErr, null, 2));
      return res.status(500).json({ error: "Database registration failed", details: dbErr.message || dbErr });
    }

    return res.json({
      subscriptionId: subscription.id,
      keyId: process.env.RAZORPAY_KEY_ID,
      name,
      email,
      phone: phone || "",
      amount: amountInPaise,
      frequency,
    });
  } catch (err) {
    console.error("createSubscription error:", err);
    return res.status(500).json({ error: "Failed to create subscription" });
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
