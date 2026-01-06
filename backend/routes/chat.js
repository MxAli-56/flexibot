// backend/routes/chat.js
const express = require("express");
const { randomUUID } = require("crypto");
const Session = require("../models/Session");
const Message = require("../models/Message");

const { chatWithBytez } = require("../providers/bytez");

const { crawlWebsite } = require("../utils/crawler");
const { getSystemPrompt } = require("../utils/systemPromptManager");

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

const crawlCache = new Map();

router.post("/message", async (req, res) => {
  try {
    const { sessionId, clientId = "default", text, websiteUrl } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Message text is required" });
    }
    if (text.length > 1000) {
      return res
        .status(400)
        .json({ error: "Message too long. Max 1000 characters allowed." });
    }

    // 1️⃣ Create or find session
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

    // 3️⃣ History
    const history = await fetchConversation(session.sessionId, 12);

    // 4️⃣ Crawl website if needed
    let siteContext = "";
    if (websiteUrl) {
      const cached = crawlCache.get(websiteUrl);
      const now = Date.now();

      if (cached && now - cached.lastFetched < 1000 * 60 * 60 * 6) {
        siteContext = cached.content;
        console.log(`♻️ Using cached crawl for ${websiteUrl}`);
      } else {
        console.log(`🕷️ Crawling: ${websiteUrl}`);
        siteContext = await crawlWebsite(websiteUrl, 3);
        crawlCache.set(websiteUrl, { content: siteContext, lastFetched: now });
      }
    }

    // 5️⃣ System prompt
    let systemPrompt = await getSystemPrompt(clientId);

    if (!systemPrompt) {
      systemPrompt = `
You are FlexiBot — a friendly AI assistant for website visitors.
Respond clearly, politely, and naturally.
Follow formatting rules, spacing, and tone guidelines.
      `;
    }

    systemPrompt += `

Website Context:
${siteContext ? siteContext.slice(0, 1000) : "No website data available."}
`;

    // 6️⃣ Full prompt
    const prompt = `${systemPrompt}\n\n${history
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n")}\nassistant:`;

    // ---------------------------------------------------
    // 7️⃣ AI Handling: BYTEZ ONLY (Phi-3)
    // ---------------------------------------------------
    let aiReplyText = "⚠️ AI is not available right now.";

    try {
      const aiResponse = await (chatWithBytez(prompt));

      if (
        aiResponse &&
        aiResponse.status === "success" &&
        typeof aiResponse.reply === "string" &&
        aiResponse.reply.trim()
      ) {
        aiReplyText = aiResponse.reply;
      }
    } catch (error) {
      console.error("Bytez AI failed:", error.message);
    }

    // 8️⃣ Save bot reply
    await Message.create({
      sessionId: session.sessionId,
      clientId,
      role: "bot",
      text: aiReplyText,
    });

    // 9️⃣ Send response
    res.json({ reply: aiReplyText, sessionId: session.sessionId });
  } catch (error) {
    console.error("Error in /api/message:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;