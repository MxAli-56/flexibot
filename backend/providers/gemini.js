const { GoogleGenerativeAI } = require("@google/generative-ai");

// Setup Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

async function chatWithGemini(message) {
  try {
    const result = await model.generateContent(message);
    const responseText = result.response.text();
    return responseText;
  } catch (error) {
    console.error("Gemini API error: ", error.message);
    return "Sorry, something went wrong with Gemini."; // 👈 fallback
  }
}

module.exports = {chatWithGemini}