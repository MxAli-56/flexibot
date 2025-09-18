// backend/providers/gemini.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

// 🟢 Setup Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// 🟢 Chat function with retries & better error handling
async function chatWithGemini(message, retries = 3) {
  try {
    const result = await model.generateContent(message);
    return result.response.text();
  } catch (error) {
    console.error("Gemini API error:", error.message);

    // 🟡 Retry if Gemini is overloaded (503)
    if (
      retries > 0 &&
      (error.message.includes("503") || error.message.includes("overloaded"))
    ) {
      console.warn(
        `⚠️ Gemini overloaded. Retrying... (${4 - retries} attempt)`
      );
      await new Promise((res) => setTimeout(res, 2000)); // wait 2 sec
      return chatWithGemini(message, retries - 1);
    }

    // 🟡 API key issue
    if (
      error.message.includes("API key") ||
      error.message.includes("API_KEY_INVALID")
    ) {
      return "❌ Gemini API key issue. Please check your API key.";
    }

    // 🟡 Generic fallback
    return "⚠️ Sorry, Gemini is not available right now. Please try again later.";
  }
}

module.exports = { chatWithGemini };