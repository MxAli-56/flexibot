// backend/providers/bytez.js
const Bytez = require("bytez.js");

const sdk = new Bytez(process.env.BYTEZ_API_KEY);

// ONE model only
const model = sdk.model("microsoft/Phi-3-mini-128k-instruct");

async function chatWithBytez(prompt) {
  try {
    const { error, output } = await model.run([
      {
        role: "user",
        content: prompt,
      },
    ]);

    if (error) {
      console.error("Bytez error:", error);
      return {
        status: "error",
        reply: "Sorry, Chatbot is not available right now.",
      };
    }

    return {
      status: "success",
      reply: output,
    };
  } catch (err) {
    console.error("Bytez crash:", err.message);
    return {
      status: "error",
      reply: "Sorry, Chatbot is not available right now.",
    };
  }
}

module.exports = { chatWithBytez };