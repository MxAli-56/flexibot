// backend/providers/gemini.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "models/gemini-1.5-flash" });

async function chatWithGemini(message, retries = 3, attempt = 1) {
  try {
    const controller = new AbortController();

    // ⏳ Timeout logic (20 sec max wait)
    const timeout = setTimeout(() => controller.abort(), 20000);

    const result = await model.generateContent(
      { contents: [{ role: "user", parts: [{ text: message }] }] },
      { signal: controller.signal }
    );

    clearTimeout(timeout);

    return {
      reply: result.response.text(),
      attempt,
      status: "success",
    };
  } catch (error) {
    console.error(`Gemini API error (attempt ${attempt}):`, error.message);

    // Retry if overloaded / timeout
    if (
      retries > 0 &&
      (error.message.includes("503") ||
        error.message.includes("overloaded") ||
        error.message.includes("Timeout"))
    ) {
      const wait = Math.pow(2, attempt) * 1000; // exponential: 2s → 4s → 8s
      console.warn(
        `⚠️ Retrying in ${wait / 1000}s... (attempt ${attempt + 1})`
      );
      await new Promise((res) => setTimeout(res, wait));

      return chatWithGemini(message, retries - 1, attempt + 1);
    }

    // API key issue
    if (
      error.message.includes("API key") ||
      error.message.includes("API_KEY_INVALID")
    ) {
      return {
        reply: "❌ Gemini API key issue. Please check your key.",
        attempt,
        status: "error",
      };
    }

    // Generic fallback
    return {
      reply: "⚠️ Gemini is not available right now. Please try again later.",
      attempt,
      status: "error",
    };
  }
}

module.exports = { chatWithGemini };