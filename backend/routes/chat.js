// backend/routes/chat.js
const express = require("express");
const { randomUUID } = require("crypto");
const Session = require("../models/Session");
const Message = require("../models/Message");
const Client = require("../models/Client");

const { chatWithMistral } = require("../providers/mistral");
const { chatWithBytez } = require("../providers/bytez");

const router = express.Router();

async function fetchConversation(sessionId, limit = 12) {
  const docs = await Message.find({ sessionId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return docs.reverse().map((d) => ({
    role: d.role,
    content: d.text,
  }));
}

router.post("/message", async (req, res) => {
  try {
    const { sessionId, clientId = "default", text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Message text is required" });
    }
    if (text.length > 1000) {
      return res.status(400).json({ error: "Message too long." });
    }

    // 1️⃣ Fetch Client Knowledge Base
    const clientData = await Client.findOne({ clientId });

    // 2️⃣ Create or find session
    let session = await Session.findOne({ sessionId });
    if (!session) {
      session = await Session.create({
        sessionId: sessionId || randomUUID(),
        clientId,
      });
    }

    // 3️⃣ Save user message
    await Message.create({
      sessionId: session.sessionId,
      clientId,
      role: "user",
      text,
    });

    // 4️⃣ Get Chat History
    const history = await fetchConversation(session.sessionId, 12);

    // 5️⃣ Construct Specialized System Prompt
    let basePrompt =
      clientData?.systemPrompt ||
      "You are FlexiBot, a professional AI assistant.";
    const knowledge =
      clientData?.siteContext || "No specific business data available.";

    const finalSystemPrompt = `
${basePrompt}

CRITICAL KNOWLEDGE BASE:
${knowledge.slice(0, 2000)}

INSTRUCTIONS:
- Only answer based on the knowledge provided above.
- If the answer isn't there, ask for their name and phone so we can contact them.
- Be concise and polite.
`;

    // 6️⃣ Assembly
    const prompt = `${finalSystemPrompt}\n\n${history
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n")}\nassistant:`;

    // 7️⃣ Dual AI Provider Handling
    let aiReplyText = "";
    try {
      console.log(`💎 Mistral calling for: ${clientData?.name || clientId}`);
      const mistralRes = await chatWithMistral(prompt);
      if (mistralRes.status === "success") {
        aiReplyText = mistralRes.reply;
      } else {
        throw new Error("Mistral failed");
      }
    } catch (error) {
      console.warn("⚠️ Fallback to Bytez...");
      try {
        const bytezRes = await chatWithBytez(prompt);
        aiReplyText =
          bytezRes.status === "success"
            ? bytezRes.reply
            : "Service temporarily busy.";
      } catch (e) {
        aiReplyText = "Connection error. Please refresh.";
      }
    }

    // 8️⃣ Save & Respond
    await Message.create({
      sessionId: session.sessionId,
      clientId,
      role: "bot",
      text: aiReplyText,
    });

    res.json({ reply: aiReplyText, sessionId: session.sessionId });
  } catch (error) {
    console.error("Critical Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;