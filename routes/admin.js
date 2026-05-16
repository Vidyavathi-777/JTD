const express = require("express");
const router = express.Router();
const razorpay = require("../config/razorpay");

// GET /api/admin/customers - List all customers from Razorpay
router.get("/customers", async (req, res) => {
  try {
    const { count = 100, skip = 0 } = req.query;
    
    // Fetch customers from Razorpay
    const response = await razorpay.customers.all({
      count: parseInt(count),
      skip: parseInt(skip),
    });

    console.log(`[ADMIN] Razorpay returned ${response.items.length} customers out of ${response.count} total.`);
    response.items.forEach((c, i) => console.log(`  [${i}] ID: ${c.id}, Name: ${c.name}, Email: ${c.email}`));

    // We can map them to a cleaner format for the dashboard if needed
    const customers = response.items.map(c => ({
      id: c.id,
      name: c.name,
      email: c.email,
      contact: c.contact,
      pan: c.notes?.pan || "N/A",
      created_at: new Date(c.created_at * 1000).toISOString(),
    }));

    return res.json({
      success: true,
      count: response.count,
      items: customers,
    });
  } catch (err) {
    console.error("Admin Fetch Customers Error:", err);
    return res.status(500).json({ error: "Failed to fetch customers from Razorpay" });
  }
});

module.exports = router;
