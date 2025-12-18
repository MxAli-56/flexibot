const Bytez = require("bytez.js");

const sdk = new Bytez(process.env.BYTEZ_API_KEY);
const model = sdk.model("microsoft/Phi-3-mini-128k-instruct");

/**
 * 🚦 GLOBAL QUEUE LOGIC
 * This ensures we only send ONE request to Bytez at a time.
 */
let queue = Promise.resolve();

async function chatWithBytez(prompt, retries = 3, attempt = 1) {
  // Chain this request to the end of the previous one
  return (queue = queue.then(async () => {
    try {
      // ⏳ Timeout Protection: 30 seconds
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

      const result = await Promise.race([requestPromise, timeoutPromise]);

      if (result && result.error) throw new Error(result.error);

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
        const wait = Math.pow(3, attempt) * 1000;
        console.warn(`⏳ Server busy. Retrying in ${wait / 1000}s...`);

        await new Promise((res) => setTimeout(res, wait));
        return chatWithBytez(prompt, retries - 1, attempt + 1);
      }

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