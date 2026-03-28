const express = require("express");
const router = express.Router();
const {
  createSubscription,
  verifySubscription,
  cancelSubscription,
} = require("../controllers/subscriptionController");

// POST /api/subscription/create   — create Razorpay subscription
// POST /api/subscription/verify   — verify first payment + send welcome email
// POST /api/subscription/cancel/:subscriptionId — cancel subscription
router.post("/create", createSubscription);
router.post("/verify", verifySubscription);
router.post("/cancel/:subscriptionId", cancelSubscription);

module.exports = router;
