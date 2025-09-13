const { GoogleGenerativeAI } = require("@google/generative-ai");

// Setup Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

async function chatWithGemini(message){
    try {
        const result = await model.generateContent(message)
        return result.response.text()
    } catch (error) {
        console.error("Error: ", error.message)
    }
}

module.exports = {chatWithGemini}