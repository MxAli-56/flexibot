// backend/providers/qwen.js
const OpenAI = require("openai");

const deepinfra = new OpenAI({
  apiKey: process.env.DEEPINFRA_API_KEY,
  baseURL: "https://api.deepinfra.com/v1/openai",
});

/**
 * 🚦 GLOBAL QUEUE
 * Ensures only ONE request at a time
 */
let queue = Promise.resolve();

async function chatWithQwen(prompt, retries = 2, attempt = 1) {
  return (queue = queue
    .catch(() => {})
    .then(async () => {
      try {
        console.log(`🤖 Qwen Request: Attempt ${attempt} starting...`);

        // ⏳ Timeout for Qwen (slightly longer for 72B model)
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), 20000),
        );

        const requestPromise = deepinfra.chat.completions.create({
          model: "Qwen/Qwen2.5-72B-Instruct",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
          max_tokens: 2048,
        });

        const completion = await Promise.race([requestPromise, timeoutPromise]);

        console.log(`✅ Qwen success (attempt ${attempt})`);

        return {
          status: "success",
          reply: completion.choices[0].message.content,
          usage: completion.usage, // Track costs
          attempt,
        };
      } catch (error) {
        console.error(`❌ Qwen error (attempt ${attempt}):`, error.message);

        // Retryable error patterns for DeepInfra
        const retryableErrors = [
          "503",
          "overloaded",
          "timeout",
          "rate limit",
          "too many requests",
          "5xx",
          "network",
          "econnreset",
          "econnrefused",
        ];

        const isRetryable = retryableErrors.some((msg) =>
          error.message.toLowerCase().includes(msg.toLowerCase()),
        );

        if (retries > 0 && isRetryable) {
          // Exponential backoff: 2s, 4s, 8s...
          const wait = Math.pow(2, attempt) * 1000;
          console.warn(`⏳ Retrying in ${wait / 1000}s...`);

          await new Promise((res) => setTimeout(res, wait));
          return chatWithQwen(prompt, retries - 1, attempt + 1);
        }

        return {
          status: "error",
          reply: "⚠️ AI service is temporarily busy. Please try again.",
          attempt,
        };
      }
    }));
}

module.exports = { chatWithQwen };