require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const bodyParser = require("body-parser");

const donationRoutes = require("../routes/donation");
const subscriptionRoutes = require("../routes/subscription");
const adminRoutes = require("../routes/admin");
const { validateWebhook } = require("../middleware/validateWebhook");
const { handleWebhook } = require("../webhooks/razorpayWebhook");

const app = express();

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors());

// ─── Raw body capture for webhook signature validation ────────────────────────
app.use((req, res, next) => {
  if (req.path === "/webhook/razorpay") {
    bodyParser.raw({ type: "application/json" })(req, res, (err) => {
      if (err) return next(err);
      req.rawBody = req.body;
      try {
        req.body = JSON.parse(req.body.toString("utf8"));
      } catch (_) {}
      next();
    });
  } else {
    next();
  }
});

// ─── JSON body parser for all other routes ────────────────────────────────────
app.use((req, res, next) => {
  if (req.path !== "/webhook/razorpay") {
    express.json()(req, res, (err) => {
      if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
        console.error("JSON Syntax Error:", err.message);
        return res.status(400).json({ error: "Invalid JSON payload" });
      }
      next(err);
    });
  } else {
    next();
  }
});

app.use(express.urlencoded({ extended: true }));

// ─── Serve static frontend ───────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "../public")));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "ok", ngo: process.env.NGO_NAME }));

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use("/api/donation", donationRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/admin", adminRoutes);

// ─── Razorpay Webhook ─────────────────────────────────────────────────────────
app.post("/webhook/razorpay", validateWebhook, handleWebhook);

// ─── Catch-all: serve frontend for any non-API route ─────────────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// ─── Start (local dev) ────────────────────────────────────────────────────────
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 NGO Donation Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
