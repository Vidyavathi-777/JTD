const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

transporter.verify().then(() => {
  console.log("SMTP transporter verified");
}).catch((err) => {
  console.error("SMTP transporter verification failed:", err);
});

/**
 * Send an email
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} html - HTML body
 */
async function sendMail(to, subject, html) {
  try {
    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to,
      subject,
      html,
    });
    console.log("Email sent successfully to:", to, "Message ID:", info.messageId);
    return info;
  } catch (err) {
    console.error("Nodemailer Error Details:", {
      message: err.message,
      code: err.code,
      command: err.command,
      response: err.response,
      recipient: to,
    });
    throw err;
  }
}

module.exports = { sendMail };
