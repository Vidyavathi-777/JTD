const crypto = require("crypto");

/**
 * Validates incoming Razorpay webhook signature.
 * Must be registered BEFORE express.json() for this route so we get raw body.
 */
function validateWebhook(req, res, next) {
  const signature = req.headers["x-razorpay-signature"];
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!signature || !secret) {
    return res.status(400).json({ error: "Missing webhook signature or secret" });
  }

  // Raw body is attached by the rawBodyMiddleware used in api/index.js
  const rawBody = req.rawBody;
  if (!rawBody) {
    return res.status(400).json({ error: "No raw body available for validation" });
  }

  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  if (expectedSig !== signature) {
    return res.status(400).json({ error: "Invalid webhook signature" });
  }

  next();
}

module.exports = { validateWebhook };
