// backend/providers/mistral.js
const { Mistral } = require("@mistralai/mistralai");

const apiKey = process.env.MISTRAL_API_KEY;
const client = new Mistral({ apiKey: apiKey });

/**
 * 🚦 GLOBAL QUEUE
 * Ensures only ONE request at a time to prevent rate limits
 */
let queue = Promise.resolve();

async function chatWithMistral(prompt, retries = 2, attempt = 1) {
  return (queue = queue
    .catch(() => {})
    .then(async () => {
      try {
        console.log(`🚀 Mistral Request: Attempt ${attempt} starting...`);

        // ⏳ Timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), 15000),
        );

        const requestPromise = client.chat.complete({
          model: "mistral-small-latest",
          messages: [{ role: "user", content: prompt }],
        });

        const chatResponse = await Promise.race([
          requestPromise,
          timeoutPromise,
        ]);

        return {
          status: "success",
          reply: chatResponse.choices[0].message.content.trim(),
          attempt,
        };
      } catch (err) {
        console.error(`❌ Mistral error (attempt ${attempt}):`, err.message);

        // Retryable error patterns
        const retryableErrors = [
          "503",
          "overloaded",
          "timeout",
          "rate limit",
          "too many requests",
          "5xx",
          "network",
        ];

        const isRetryable = retryableErrors.some((msg) =>
          err.message.toLowerCase().includes(msg.toLowerCase()),
        );

        if (retries > 0 && isRetryable) {
          // Exponential backoff: 2s, 4s, 8s...
          const wait = Math.pow(2, attempt) * 1000;
          console.warn(`⏳ Retrying in ${wait / 1000}s...`);

          await new Promise((res) => setTimeout(res, wait));
          return chatWithMistral(prompt, retries - 1, attempt + 1);
        }

        return {
          status: "error",
          reply: "⚠️ AI service is temporarily busy. Please try again.",
          attempt,
        };
      }
    }));
}

module.exports = { chatWithMistral };