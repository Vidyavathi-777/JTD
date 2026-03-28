require("dotenv").config();
const { sendMail } = require("./config/mailer");

async function testEmail() {
  const testRecipient = process.env.SMTP_USER; // Send to self
  console.log(`Attempting to send a test email to: ${testRecipient}...`);

  try {
    await sendMail(
      testRecipient,
      "🧪 Test Email from NGO Donation Platform",
      "<h1>Success!</h1><p>If you are reading this, your Nodemailer configuration is working correctly.</p>"
    );
    console.log("✅ Test email sent successfully! Check your inbox.");
  } catch (err) {
    console.error("❌ Test email failed.");
    console.error("Error Message:", err.message);
    console.info("\n💡 Troubleshooting Tips:");
    console.info("1. Ensure SMTP_USER is your full Gmail address.");
    console.info("2. Ensure SMTP_PASS is a 16-character App Password (not your regular password).");
    console.info("3. Ensure 2FA is enabled on your Gmail account.");
  }
}

testEmail();
