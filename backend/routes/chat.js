// backend/routes/chat.js
const express = require("express");
const { randomUUID } = require("crypto");
const Session = require("../models/Session");
const Message = require("../models/Message");
const { chatWithGemini } = require("../providers/gemini");

const router = express.Router();

// 🟢 Helper: fetch last N messages for context
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

// 🟢 POST /api/message (main chat endpoint)
router.post("/message", async (req, res) => {
  try {
    const { sessionId, clientId = "default", text } = req.body;

    if (!text) {
      return res.status(400).json({ error: "Message text is required" });
    }

    // 1️⃣ Find or create session
    let session = await Session.findOne({ sessionId });
    if (!session) {
      session = await Session.create({
        sessionId: sessionId || randomUUID(),
        clientId,
      });
    }

    // 2️⃣ Save user message
    await Message.create({
      sessionId: session.sessionId,
      clientId,
      role: "user",
      text,
    });

    // 3️⃣ Fetch last 12 messages for context
    const history = await fetchConversation(session.sessionId, 12);

    // 4️⃣ Generate AI reply
    const prompt =
      history.map((m) => `${m.role}: ${m.content}`).join("\n") +
      `\nuser: ${text}\nassistant:`;

    const reply = await chatWithGemini(prompt);

    // 5️⃣ Save bot reply
    await Message.create({
      sessionId: session.sessionId,
      clientId,
      role: "bot",
      text: reply,
    });

    // 6️⃣ Return reply
    res.json({ reply, sessionId: session.sessionId });
  } catch (error) {
    console.error("Error in /api/message:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;