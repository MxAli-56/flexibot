// backend/providers/bytez.js
const Bytez = require("bytez.js");

const sdk = new Bytez(process.env.BYTEZ_API_KEY);
// Using Phi-3 as your primary model
const model = sdk.model("microsoft/Phi-3-mini-128k-instruct");

/**
 * 🚦 GLOBAL QUEUE LOGIC
 * This ensures that even if multiple users message the bot at once,
 * we only send ONE request to Bytez at a time to respect the "1 concurrency" limit.
 */
let queue = Promise.resolve();

async function chatWithBytez(prompt, retries = 3, attempt = 1) {
  // Chain this request to the end of the previous one
  return (queue = queue.then(async () => {
    try {
      // ⏳ Timeout Protection: 30 seconds (increased for production stability)
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), 30000)
      );

      const requestPromise = model.run([
        {
          role: "user",
          content: prompt,
        },
      ]);

      console.log(`🚀 Bytez Request: Attempt ${attempt} starting...`);

      // Race the API request against our timeout
      const result = await Promise.race([requestPromise, timeoutPromise]);

      // Check if Bytez returned an error object inside the result
      if (result && result.error) throw new Error(result.error);

      // 📝 Format Output reliably
      const output = result?.output;
      const text =
        typeof output === "string"
          ? output
          : Array.isArray(output)
          ? output.map((o) => o.content || "").join("\n")
          : output?.content || "";

      return {
        status: "success",
        reply: text.trim() || "I'm sorry, I couldn't generate a response.",
        attempt,
      };
    } catch (err) {
      console.error(`❌ Bytez error (attempt ${attempt}):`, err.message);

      // 🔄 Production-Grade Retry Logic
      // We look for concurrency limits or overloaded servers
      const retryableErrors = [
        "503",
        "overloaded",
        "timeout",
        "rate limit",
        "concurrency",
      ];
      const isRetryable = retryableErrors.some((msg) =>
        err.message.toLowerCase().includes(msg)
      );

      if (retries > 0 && isRetryable) {
        // Exponential backoff: Wait 3s, then 9s, then 27s
        const wait = Math.pow(3, attempt) * 1000;
        console.warn(
          `⏳ Server busy or limit hit. Retrying in ${wait / 1000}s...`
        );

        await new Promise((res) => setTimeout(res, wait));
        return chatWithBytez(prompt, retries - 1, attempt + 1);
      }

      // ❌ Final Error Fallback for the User
      return {
        status: "error",
        reply:
          "⚠️ The chatbot is currently very busy. Please try again in a few seconds.",
        attempt,
      };
    }
  }));
}

module.exports = { chatWithBytez };