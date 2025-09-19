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
    .sort({ createdAt: -1 }) // newest first
    .limit(limit)
    .lean();

  // reverse so oldest → newest
  return docs.reverse().map((d) => ({
    role: d.role,
    content: d.text,
  }));
}

// 🟢 Helper: timeout wrapper for AI call
function timeout(ms, promise) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), ms)
    ),
  ]);
}

// 🟢 POST /api/message (main chat endpoint)
router.post("/message", async (req, res) => {
  try {
    const { sessionId, clientId = "default", text } = req.body;

    // ✅ Validate input
    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Message text is required" });
    }
    if (text.length > 1000) {
      return res
        .status(400)
        .json({ error: "Message too long. Max 1000 characters allowed." });
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

    // 4️⃣ Generate AI reply safely with timeout, retries handled in gemini.js
    let aiReplyText =
      "⚠️ The assistant is temporarily unavailable. Please try again later.";

    try {
      const prompt =
        history.map((m) => `${m.role}: ${m.content}`).join("\n") +
        `\nuser: ${text}\nassistant:`;

      const aiResponse = await timeout(20000, chatWithGemini(prompt));
      // Ensure reply is a string
      if (aiResponse && typeof aiResponse.reply === "string") {
        aiReplyText = aiResponse.reply;
      } else {
        console.warn("Gemini returned invalid response, using fallback.");
      }
    } catch (gemError) {
      console.error("Gemini API failed or timeout:", gemError.message);
    }

    // 5️⃣ Save bot reply safely
    await Message.create({
      sessionId: session.sessionId,
      clientId,
      role: "bot",
      text: aiReplyText,
    });

    // 6️⃣ Return reply and sessionId
    res.json({ reply: aiReplyText, sessionId: session.sessionId });
  } catch (error) {
    console.error("Error in /api/message:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;