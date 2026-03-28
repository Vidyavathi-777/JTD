const supabase = require("../config/supabase");
const { sendMail } = require("../config/mailer");
const { recurringChargeEmail } = require("../emails/templates");

function getNextChargeDate(frequency) {
  const d = new Date();
  if (frequency === "monthly")     d.setMonth(d.getMonth() + 1);
  if (frequency === "quarterly")   d.setMonth(d.getMonth() + 3);
  if (frequency === "half_yearly") d.setMonth(d.getMonth() + 6);
  if (frequency === "yearly")      d.setFullYear(d.getFullYear() + 1);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
}

async function handleWebhook(req, res) {
  const event = req.body;
  const eventType = event.event;

  console.log("Razorpay Webhook:", eventType);

  try {
    // ── subscription.charged: auto-pay successful ──────────────────────────
    if (eventType === "subscription.charged") {
      const payload = event.payload?.subscription?.entity;
      const payment = event.payload?.payment?.entity;

      if (!payload || !payment) {
        return res.status(200).json({ received: true });
      }

      const subscriptionId = payload.id;

      // Fetch subscription from DB
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("razorpay_subscription_id", subscriptionId)
        .maybeSingle();

      if (!sub) {
        console.warn("Subscription not found in DB:", subscriptionId);
        return res.status(200).json({ received: true });
      }

      // Log this charge in subscription_charges table
      await supabase.from("subscription_charges").insert({
        subscription_id: sub.id,
        razorpay_payment_id: payment.id,
        amount: payment.amount / 100,
        status: "captured",
        charged_at: new Date(payment.created_at * 1000).toISOString(),
      });

      // Update subscription charge count
      await supabase
        .from("subscriptions")
        .update({ total_charges: (sub.total_charges || 0) + 1, last_charged_at: new Date().toISOString() })
        .eq("razorpay_subscription_id", subscriptionId);

      // Send recurring charge email
      const chargeDate = new Date(payment.created_at * 1000).toLocaleDateString("en-IN", {
        day: "2-digit", month: "long", year: "numeric",
      });

      try {
        await sendMail(
          sub.email,
          `💚 Recurring Donation Processed — ${process.env.NGO_NAME}`,
          recurringChargeEmail({
            name: sub.name,
            email: sub.email,
            amount: sub.amount,
            frequency: sub.frequency,
            subscriptionId,
            chargeDate,
            nextChargeDate: getNextChargeDate(sub.frequency),
          })
        );
      } catch (emailErr) {
        console.error("Recurring charge email failed:", emailErr);
      }
    }

    // ── subscription.cancelled ─────────────────────────────────────────────
    if (eventType === "subscription.cancelled") {
      const subscriptionId = event.payload?.subscription?.entity?.id;
      if (subscriptionId) {
        await supabase
          .from("subscriptions")
          .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
          .eq("razorpay_subscription_id", subscriptionId);
      }
    }

    // ── subscription.paused / resumed ─────────────────────────────────────
    if (eventType === "subscription.paused") {
      const id = event.payload?.subscription?.entity?.id;
      if (id) await supabase.from("subscriptions").update({ status: "paused" }).eq("razorpay_subscription_id", id);
    }

    if (eventType === "subscription.resumed") {
      const id = event.payload?.subscription?.entity?.id;
      if (id) await supabase.from("subscriptions").update({ status: "active" }).eq("razorpay_subscription_id", id);
    }

    // ── payment.failed ─────────────────────────────────────────────────────
    if (eventType === "payment.failed") {
      const orderId = event.payload?.payment?.entity?.order_id;
      if (orderId) {
        await supabase
          .from("donations")
          .update({ status: "failed" })
          .eq("razorpay_order_id", orderId);
      }
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("Webhook handler error:", {
      message: err.message,
      stack: err.stack,
      eventType,
      payload: event.payload
    });
    // Still return 200 so Razorpay doesn't retry endlessly
    return res.status(200).json({ received: true, warning: "Internal handler error" });
  }
}

module.exports = { handleWebhook };
