// backend/providers/bytez.js
const Bytez = require("bytez.js");

const sdk = new Bytez(process.env.BYTEZ_API_KEY);
const model = sdk.model("microsoft/Phi-3-mini-128k-instruct");

/**
 * 🚦 GLOBAL QUEUE
 * This ensures your app only sends ONE request at a time.
 */
let queue = Promise.resolve();

async function chatWithBytez(prompt, retries = 3, attempt = 1) {
  // 关键 (Critical): We must chain the queue correctly so it never "locks"
  return (queue = queue
    .catch(() => {})
    .then(async () => {
      try {
        console.log(`🚀 Bytez Request: Attempt ${attempt} starting...`);

        // ⏳ Timeout reduced to 20s to prevent Render from cutting the connection
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), 20000)
        );

        const requestPromise = model.run([
          {
            role: "user",
            content: prompt,
          },
        ]);

        const result = await Promise.race([requestPromise, timeoutPromise]);

        if (result && result.error) throw new Error(result.error);

        // 📝 Your original robust formatting logic
        const output = result?.output;
        let text = "";

        if (typeof output === "string") {
          text = output;
        } else if (Array.isArray(output)) {
          text = output.map((o) => o.content || "").join("\n");
        } else {
          text = output?.content || "";
        }

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
          "inference failed",
          "cuda",
        ];

        const isRetryable = retryableErrors.some((msg) =>
          err.message.toLowerCase().includes(msg)
        );

        if (retries > 0 && isRetryable) {
          // Wait 3s, 9s...
          const wait = Math.pow(3, attempt) * 1000;
          console.warn(`⏳ Server issues. Retrying in ${wait / 1000}s...`);

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