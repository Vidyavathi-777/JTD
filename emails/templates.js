const NGO_NAME = process.env.NGO_NAME || "Joining The Dots Foundation";
const APP_URL = process.env.APP_URL || "";

// ─── Refined Shared Styles (JTD Brand) ───────────────────────────────────────
const baseStyle = `
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700&family=Inter:wght@400;500&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background:#f8f9fa; font-family:'Inter', Helvetica, sans-serif; color:#212529; }
    .wrapper { max-width:600px; margin:40px auto; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 4px 20px rgba(0,0,0,0.05); }
    .header { background:#3B719F; padding:40px; text-align:center; color:#ffffff; }
    .header h1 { font-family:'Montserrat', sans-serif; font-size:24px; font-weight:700; margin-bottom:8px; }
    .header p { color:rgba(255,255,255,0.8); font-size:14px; letter-spacing:1px; }
    .body { padding:40px; }
    .greeting { font-size:18px; font-weight:600; margin-bottom:20px; }
    .card { background:#f1f5f9; border-radius:8px; padding:24px; margin:24px 0; border-left:4px solid #E8745C; }
    .card-row { display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid #e2e8f0; }
    .card-row:last-child { border-bottom:none; }
    .card-label { color:#64748b; font-size:13px; font-weight:500; }
    .card-value { font-weight:600; font-size:15px; color:#3B719F; }
    .amount-highlight { text-align:center; margin:30px 0; }
    .amount-val { font-size:42px; font-weight:700; color:#E8745C; }
    .status-badge { display:inline-block; background:#dcfce7; color:#166534; font-size:12px; font-weight:600; padding:4px 12px; border-radius:20px; margin-top:10px; }
    .message { font-size:15px; line-height:1.7; color:#475569; }
    .divider { border:none; border-top:1px solid #e2e8f0; margin:30px 0; }
    .cta { text-align:center; margin:30px 0; }
    .cta a { background:#E8745C; color:#ffffff; text-decoration:none; padding:16px 40px; border-radius:50px; font-size:15px; font-weight:700; display:inline-block; }
    .footer { background:#f8f9fa; padding:30px 40px; text-align:center; font-size:12px; color:#94a3b8; }
    .footer strong { color:#475569; }
  </style>
`;

// ─── 1. One-time donation confirmation ────────────────────────────────────────
function oneTimeDonationEmail({ name, email, amount, donationId, date }) {
  return `
<!DOCTYPE html><html><head><meta charset="UTF-8">${baseStyle}</head><body>
<div class="wrapper">
  <div class="header">
    <h1>Thank You, ${name.split(' ')[0]}!</h1>
    <p>${NGO_NAME.toUpperCase()}</p>
  </div>
  <div class="body">
    <p class="greeting">Dear ${name},</p>
    <p class="message">
      We are deeply grateful for your donation. Your support directly helps us transform lives through education, sports, and community programs.
    </p>
    <div class="amount-highlight">
      <div class="amount-val">₹${Number(amount).toLocaleString("en-IN")}</div>
      <div class="status-badge">Payment Successful</div>
    </div>
    <div class="card">
      <div class="card-row"><span class="card-label">Donation ID</span><span class="card-value">${donationId}</span></div>
      <div class="card-row"><span class="card-label">Donor Name</span><span class="card-value">${name}</span></div>
      <div class="card-row"><span class="card-label">Email</span><span class="card-value">${email}</span></div>
      <div class="card-row"><span class="card-label">Date</span><span class="card-value">${date}</span></div>
    </div>
    <div class="divider"></div>
    <p class="message" style="text-align:center">This receipt is valid for tax exemption under 80G.</p>
    <div class="cta"><a href="${APP_URL}">Support Us Again</a></div>
  </div>
  <div class="footer">
    <strong>${NGO_NAME}</strong><br>
    Questions? Contact us at ${process.env.SMTP_USER}<br><br>
    © ${new Date().getFullYear()} ${NGO_NAME}.
  </div>
</div>
</body></html>`;
}

// ─── 2. Subscription / auto-pay welcome ───────────────────────────────────────
function subscriptionWelcomeEmail({ name, email, amount, frequency, subscriptionId, nextChargeDate }) {
  const freqLabel = { monthly: "every month", quarterly: "every 3 months", half_yearly: "every 6 months", yearly: "every year" }[frequency] || frequency;

  return `
<!DOCTYPE html><html><head><meta charset="UTF-8">${baseStyle}</head><body>
<div class="wrapper">
  <div class="header">
    <h1>Welcome, ${name.split(' ')[0]}!</h1>
    <p>${NGO_NAME.toUpperCase()}</p>
  </div>
  <div class="body">
    <p class="greeting">You're making a lasting difference.</p>
    <p class="message">
      Thank you for setting up a recurring contribution. This sustained support allows us to plan impactful projects for children and youth.
    </p>
    <div class="amount-highlight">
      <div class="amount-val">₹${Number(amount).toLocaleString("en-IN")}</div>
      <div class="status-badge">🔄 Regular support active</div>
    </div>
    <div class="card">
      <div class="card-row"><span class="card-label">ID</span><span class="card-value">${subscriptionId}</span></div>
      <div class="card-row"><span class="card-label">Cycle</span><span class="card-value">Charged ${freqLabel}</span></div>
      <div class="card-row"><span class="card-label">Next Date</span><span class="card-value">${nextChargeDate}</span></div>
    </div>
    <div class="divider"></div>
    <p class="message" style="font-size: 13px;">To cancel or manage your recurring gift, please email us at ${process.env.SMTP_USER} with your ID <strong>${subscriptionId}</strong>.</p>
    <div class="cta"><a href="${APP_URL}">Go to Foundation Site</a></div>
  </div>
  <div class="footer">
    <strong>${NGO_NAME}</strong><br>
    © ${new Date().getFullYear()} ${NGO_NAME}. All rights reserved.
  </div>
</div>
</body></html>`;
}

// ─── 3. Recurring charge success notification ─────────────────────────────────
function recurringChargeEmail({ name, email, amount, frequency, subscriptionId, chargeDate, nextChargeDate }) {
  return `
<!DOCTYPE html><html><head><meta charset="UTF-8">${baseStyle}</head><body>
<div class="wrapper">
  <div class="header">
    <h1>Another Life Impacted!</h1>
    <p>${NGO_NAME.toUpperCase()}</p>
  </div>
  <div class="body">
    <p class="greeting">Hi ${name},</p>
    <p class="message">Your recurring support has been successfully processed for this cycle. Thank you for staying with us!</p>
    <div class="amount-highlight">
      <div class="amount-val">₹${Number(amount).toLocaleString("en-IN")}</div>
      <div class="status-badge">✓ Auto-Pay Processed</div>
    </div>
    <div class="card">
      <div class="card-row"><span class="card-label">Charge Date</span><span class="card-value">${chargeDate}</span></div>
      <div class="card-row"><span class="card-label">Next Charge</span><span class="card-value">${nextChargeDate || "—"}</span></div>
    </div>
    <div class="cta"><a href="${APP_URL}">View Donation History</a></div>
  </div>
  <div class="footer">
    <strong>${NGO_NAME}</strong><br>
    Contact: ${process.env.SMTP_USER}<br>
    © ${new Date().getFullYear()} ${NGO_NAME}.
  </div>
</div>
</body></html>`;
}

module.exports = { oneTimeDonationEmail, subscriptionWelcomeEmail, recurringChargeEmail };
