// backend/providers/bytez.js
const Bytez = require("bytez.js");

const sdk = new Bytez(process.env.BYTEZ_API_KEY);
// Using Phi-3 as your primary model
const model = sdk.model("microsoft/Phi-3-mini-128k-instruct");

async function chatWithBytez(prompt, retries = 3, attempt = 1) {
  try {
    // ⏳ Timeout Protection: 20 seconds
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), 20000)
    );

    const requestPromise = model.run([
      {
        role: "user",
        content: prompt,
      },
    ]);

    // Race the API request against our timeout
    const { error, output } = await Promise.race([
      requestPromise,
      timeoutPromise,
    ]);

    if (error) throw new Error(error);

    // 📝 Format Output reliably
    const text =
      typeof output === "string"
        ? output
        : Array.isArray(output)
        ? output.map((o) => o.content || "").join("\n")
        : output?.content || "";

    return {
      status: "success",
      reply: text || "I'm sorry, I couldn't generate a response.",
      attempt,
    };
  } catch (err) {
    console.error(`Bytez error (attempt ${attempt}):`, err.message);

    // 🔄 Retry Logic for temporary issues (503, Overloaded, Timeout)
    const retryableErrors = ["503", "overloaded", "Timeout", "rate limit"];
    const isRetryable = retryableErrors.some((msg) =>
      err.message.toLowerCase().includes(msg)
    );

    if (retries > 0 && isRetryable) {
      const wait = Math.pow(2, attempt) * 1000; // 2s -> 4s -> 8s
      console.warn(`⚠️ Temporary issue. Retrying in ${wait / 1000}s...`);

      await new Promise((res) => setTimeout(res, wait));
      return chatWithBytez(prompt, retries - 1, attempt + 1);
    }

    // ❌ Final Error Fallback
    return {
      status: "error",
      reply:
        "⚠️ The chatbot is currently unavailable. Please try again in a moment.",
      attempt,
    };
  }
}

module.exports = { chatWithBytez };