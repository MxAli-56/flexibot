const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS, // Your existing 16-letter code
  },
  family: 4, // 🚨 The fix for ENETUNREACH
  connectionTimeout: 20000,
  socketTimeout: 20000,
});

/**
 * Send an email with exponential backoff retries (max 3 attempts)
 * @param {string} to - recipient email address
 * @param {string} subject - email subject
 * @param {string} text - plain text body
 * @param {number} retries - number of retries left (default 3)
 * @param {number} attempt - current attempt number (internal)
 * @returns {Promise<boolean>} - true if sent successfully, false otherwise
 */
async function sendEmailWithRetry(to, subject, text, retries = 3, attempt = 1) {
  try {
    console.log(`📧 Sending email to ${to} (attempt ${attempt})...`);
    await transporter.sendMail({
      from: `"FlexiBot" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text,
    });
    console.log(`✅ Email sent successfully to ${to}`);
    return true;
  } catch (error) {
    console.error(`❌ Email attempt ${attempt} failed:`, error.message);

    if (retries > 0) {
      // Exponential backoff: 2s, 4s, 8s
      const wait = Math.pow(2, attempt) * 1000;
      console.log(
        `⏳ Retrying in ${wait / 1000}s... (${retries} retries left)`,
      );
      await new Promise((resolve) => setTimeout(resolve, wait));
      return sendEmailWithRetry(to, subject, text, retries - 1, attempt + 1);
    } else {
      // All attempts failed – send admin alert
      const adminSubject = `[FlexiBot] Email Failure for ${to}`;
      const adminText = `Failed to send lead email to ${to} after multiple attempts.\n\nSubject: ${subject}\nBody:\n${text}`;
      try {
        await transporter.sendMail({
          from: `"FlexiBot" <${process.env.SMTP_USER}>`,
          to: process.env.ADMIN_EMAIL,
          subject: adminSubject,
          text: adminText,
        });
        console.log(`⚠️ Admin alerted about email failure.`);
      } catch (adminError) {
        console.error(`❌ Failed to send admin alert:`, adminError.message);
      }
      return false;
    }
  }
}

module.exports = { sendEmailWithRetry };
