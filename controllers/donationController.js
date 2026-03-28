const crypto = require("crypto");
const razorpay = require("../config/razorpay");
const supabase = require("../config/supabase");
const { sendMail } = require("../config/mailer");
const { oneTimeDonationEmail } = require("../emails/templates");

// ─── Create Razorpay Order ────────────────────────────────────────────────────
async function createOrder(req, res) {
  try {
    const { name, email, phone, amount, message } = req.body;

    if (!name || !email || !amount) {
      return res.status(400).json({ error: "name, email and amount are required" });
    }

    const amountInPaise = Math.round(parseFloat(amount) * 100);
    if (amountInPaise < 100) {
      return res.status(400).json({ error: "Minimum donation is ₹1" });
    }

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `don_${Date.now()}`,
      notes: { name, email, phone: phone || "", message: message || "" },
    });

    // Persist to Supabase (status: pending until verified)
    const { error: dbErr } = await supabase.from("donations").insert({
      razorpay_order_id: order.id,
      name,
      email,
      phone: phone || null,
      amount: parseFloat(amount),
      message: message || null,
      status: "pending",
    });

    if (dbErr) {
      console.error("Supabase insert error:", JSON.stringify(dbErr, null, 2));
      return res.status(500).json({ error: "DB insert failed", details: dbErr });
    }

    return res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      name,
      email,
      phone: phone || "",
    });
  } catch (err) {
    console.error("createOrder error:", err);
    return res.status(500).json({ error: "Failed to create order" });
  }
}

// ─── Verify Payment & Send Email ──────────────────────────────────────────────
async function verifyPayment(req, res) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing payment fields" });
    }

    // Signature check
    const expectedSig = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSig !== razorpay_signature) {
      await supabase
        .from("donations")
        .update({ status: "failed" })
        .eq("razorpay_order_id", razorpay_order_id);
      return res.status(400).json({ error: "Payment signature mismatch" });
    }

    // Update DB
    const { data: donations, error: fetchErr } = await supabase
      .from("donations")
      .update({
        status: "completed",
        razorpay_payment_id,
        razorpay_signature,
        paid_at: new Date().toISOString(),
      })
      .eq("razorpay_order_id", razorpay_order_id)
      .select();

    if (fetchErr || !donations?.length) {
      console.error("DB update error:", fetchErr?.message);
      return res.status(500).json({ error: "DB update failed" });
    }

    const donation = donations[0];

    // Send confirmation email
    const date = new Date(donation.paid_at).toLocaleDateString("en-IN", {
      day: "2-digit", month: "long", year: "numeric",
    });

    try {
      await sendMail(
        donation.email,
        `🌿 Thank You for Your Donation — ${process.env.NGO_NAME}`,
        oneTimeDonationEmail({
          name: donation.name,
          email: donation.email,
          amount: donation.amount,
          donationId: razorpay_payment_id,
          date,
        })
      );
    } catch (emailErr) {
      console.error("Donation email failed:", emailErr);
    }

    return res.json({ success: true, donationId: donation.id, paymentId: razorpay_payment_id });
  } catch (err) {
    console.error("verifyPayment error:", err);
    return res.status(500).json({ error: "Verification failed" });
  }
}

module.exports = { createOrder, verifyPayment };
