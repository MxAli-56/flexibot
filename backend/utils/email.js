const BrevoApi = require("@getbrevo/brevo");

// Initialize the API client
const apiInstance = new BrevoApi.TransactionalEmailsApi();
apiInstance.setApiKey(
  BrevoApi.TransactionalEmailsApiApiKeys.apiKey,
  process.env.BREVO_API_KEY,
);

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
    console.log(`📧 Sending email via Brevo to ${to} (attempt ${attempt})...`);

    const sendSmtpEmail = new BrevoApi.SendSmtpEmail();
    sendSmtpEmail.sender = { email: process.env.FROM_EMAIL };
    sendSmtpEmail.to = [{ email: to }];
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.textContent = text;

    await apiInstance.sendTransacEmail(sendSmtpEmail);

    console.log(`✅ Email sent successfully to ${to}`);
    return true;
  } catch (error) {
    console.error(`❌ Brevo attempt ${attempt} failed:`, error.message);

    if (retries > 0) {
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
        const adminEmail = new BrevoApi.SendSmtpEmail();
        adminEmail.sender = { email: process.env.FROM_EMAIL };
        adminEmail.to = [{ email: process.env.ADMIN_EMAIL }];
        adminEmail.subject = adminSubject;
        adminEmail.textContent = adminText;
        await apiInstance.sendTransacEmail(adminEmail);
        console.log(`⚠️ Admin alerted about email failure.`);
      } catch (adminError) {
        console.error(`❌ Failed to send admin alert:`, adminError.message);
      }
      return false;
    }
  }
}

module.exports = { sendEmailWithRetry };