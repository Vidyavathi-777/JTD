const crypto = require("crypto");
const razorpay = require("../config/razorpay");
const supabase = require("../config/supabase");
const { sendMail } = require("../config/mailer");
const { oneTimeDonationEmail, adminNotificationEmail } = require("../emails/templates");

// ─── Create Razorpay Order ────────────────────────────────────────────────────
async function createOrder(req, res) {
  try {
    const { name, email, phone, amount, message, pan } = req.body;

    if (!name || !email || !amount) {
      return res.status(400).json({ error: "name, email and amount are required" });
    }

    const amountInPaise = Math.round(parseFloat(amount) * 100);
    if (amountInPaise < 100) {
      return res.status(400).json({ error: "Minimum donation is ₹1" });
    }

    // ─── Get or Create Razorpay Customer ──────────────────────────────────────
    // Manual search by email to ensure we don't create duplicates and can update existing ones.
    const customerList = await razorpay.customers.all({ count: 100 });
    const existingCustomer = customerList.items.find((c) => c.email === email);

    let customer;
    const customerName = name;

    if (existingCustomer) {
      // Update existing customer details
      customer = await razorpay.customers.edit(existingCustomer.id, {
        name: customerName,
        contact: phone || "",
        notes: { pan: pan || "N/A" },
      });
    } else {
      // Create new customer
      customer = await razorpay.customers.create({
        name: customerName,
        email,
        contact: phone || "",
        notes: { pan: pan || "N/A" },
      });
    }

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `don_${Date.now()}`,
      notes: { name, email, phone: phone || "", message: message || "", pan: pan || "" },
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
      customerId: customer.id,
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

    // Admin notification
    if (process.env.ADMIN_EMAIL) {
      try {
        await sendMail(
          process.env.ADMIN_EMAIL,
          `🔔 New Donation: ₹${donation.amount} from ${donation.name}`,
          adminNotificationEmail({
            donorName: donation.name,
            donorEmail: donation.email,
            donorPhone: donation.phone,
            donorPan: donation.pan || "N/A",
            amount: donation.amount,
            paymentId: razorpay_payment_id,
            type: "One-time Donation",
          })
        );
      } catch (adminEmailErr) {
        console.error("Admin notification failed:", adminEmailErr);
      }
    }

    return res.json({ success: true, donationId: donation.id, paymentId: razorpay_payment_id });
  } catch (err) {
    console.error("verifyPayment error:", err);
    return res.status(500).json({ error: "Verification failed" });
  }
}

module.exports = { createOrder, verifyPayment };
