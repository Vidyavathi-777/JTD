const express = require("express");
const router = express.Router();
const { createOrder, verifyPayment } = require("../controllers/donationController");

// POST /api/donation/order       — create Razorpay order
// POST /api/donation/verify      — verify payment signature + send email
router.post("/order", createOrder);
router.post("/verify", verifyPayment);

module.exports = router;
