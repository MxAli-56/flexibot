const Bytez = require("bytez.js");

const sdk = new Bytez(process.env.BYTEZ_API_KEY);
// Using Phi-3-mini
const model = sdk.model("microsoft/Phi-3-mini-128k-instruct");

/**
 * 🚦 GLOBAL QUEUE
 * This ensures your app only sends ONE request at a time to stay within free tier limits.
 */
let queue = Promise.resolve();

async function chatWithBytez(prompt, retries = 3, attempt = 1) {
  // We wrap everything in this queue.then block
  return (queue = queue.then(async () => {
    try {
      console.log(`🚀 Bytez Request: Attempt ${attempt} starting...`);

      // ⏳ Timeout Protection: 30 seconds (GPUs can be slow when busy)
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), 30000)
      );

      const requestPromise = model.run([
        {
          role: "user",
          content: prompt,
        },
      ]);

      const result = await Promise.race([requestPromise, timeoutPromise]);

      // Check if Bytez returned an error inside the response object
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

      // 🔄 Retrying on: 503, Overloaded, Timeout, Rate Limit, AND CUDA/Inference errors
      const retryableErrors = [
        "503",
        "overloaded",
        "timeout",
        "rate limit",
        "inference failed",
        "cuda",
      ];
      const isRetryable = retryableErrors.some((msg) =>
        err.message.toLowerCase().includes(msg)
      );

      if (retries > 0 && isRetryable) {
        // Wait longer each time: 3s, 9s, 27s
        const wait = Math.pow(3, attempt) * 1000;
        console.warn(`⏳ Server busy/OOM. Retrying in ${wait / 1000}s...`);

        await new Promise((res) => setTimeout(res, wait));
        return chatWithBytez(prompt, retries - 1, attempt + 1);
      }

      return {
        status: "error",
        reply:
          "⚠️ The AI is currently overloaded. Please try again in a few seconds.",
        attempt,
      };
    }
  }));
}

module.exports = { chatWithBytez };
