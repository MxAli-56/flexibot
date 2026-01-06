// backend/providers/mistral.js
const { Mistral } = require("@mistralai/mistralai");

const apiKey = process.env.MISTRAL_API_KEY;
const client = new Mistral({ apiKey: apiKey });

async function chatWithMistral(prompt) {
  try {
    console.log("🚀 Mistral Request starting...");

    const chatResponse = await client.chat.complete({
      model: "mistral-small-latest", // This is their fast, reliable free model
      messages: [{ role: "user", content: prompt }],
    });

    return {
      status: "success",
      reply: chatResponse.choices[0].message.content.trim(),
    };
  } catch (err) {
    console.error("❌ Mistral Error:", err.message);
    return {
      status: "error",
      reply: "⚠️ AI is temporarily busy. Please try again.",
    };
  }
}

module.exports = { chatWithMistral };