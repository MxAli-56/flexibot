// backend/routes/chat.js
const express = require("express");
const { randomUUID } = require("crypto");
const Session = require("../models/Session");
const Message = require("../models/Message");
const Client = require("../models/Client"); // Added this to fetch MongoDB clinic data

const { chatWithMistral } = require("../providers/mistral");
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

    // 1️⃣ Fetch Client Data (Knowledge Base) from MongoDB
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

    // 4️⃣ History
    const history = await fetchConversation(session.sessionId, 12);

    // 5️⃣ Crawl logic (Secondary Fallback)
    let siteContext = "";
    if (websiteUrl && !clientData?.siteContext) { 
      // Only crawl if we DON'T have manual data in MongoDB
      const cached = crawlCache.get(websiteUrl);
      const now = Date.now();

      if (cached && now - cached.lastFetched < 1000 * 60 * 60 * 6) {
        siteContext = cached.content;
      } else {
        siteContext = await crawlWebsite(websiteUrl, 3);
        crawlCache.set(websiteUrl, { content: siteContext, lastFetched: now });
      }
    }

    // 6️⃣ System Prompt Construction
    // Prioritize manual System Prompt from DB, then manager, then default
    let basePrompt = clientData?.systemPrompt || await getSystemPrompt(clientId);
    
    if (!basePrompt) {
      basePrompt = "You are FlexiBot, a helpful and professional AI assistant.";
    }

    // Final Knowledge Source: Manual siteContext > Crawled context > Default
    const knowledgeBase = clientData?.siteContext || siteContext || "No specific clinic data provided.";

    const finalSystemPrompt = `
${basePrompt}

CRITICAL KNOWLEDGE BASE:
${knowledgeBase.slice(0, 2000)}

INSTRUCTIONS:
- Only answer based on the knowledge provided above.
- If the answer isn't there, politely ask for their name/phone so a human can help.
- Be concise and professional.
`;

    // 7️⃣ Full prompt assembly
    const prompt = `${finalSystemPrompt}\n\n${history
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n")}\nassistant:`;

    // ---------------------------------------------------
    // 8️⃣ AI Handling: DUAL PROVIDER (Mistral -> Bytez)
    // ---------------------------------------------------
    let aiReplyText = "";

    try {
      console.log("💎 Attempting Mistral (Primary)...");
      const mistralRes = await chatWithMistral(prompt);

      if (mistralRes.status === "success") {
        aiReplyText = mistralRes.reply;
      } else {
        throw new Error("Mistral failed");
      }
    } catch (error) {
      console.warn("⚠️ Mistral fallback triggered. Trying Bytez...");
      try {
        const bytezRes = await chatWithBytez(prompt);
        if (bytezRes.status === "success") {
          aiReplyText = bytezRes.reply;
        } else {
          aiReplyText = "⚠️ Service temporarily busy. Please try again.";
        }
      } catch (bytezError) {
        aiReplyText = "⚠️ Connection error. Please refresh!";
      }
    }

    // 9️⃣ Save bot reply
    await Message.create({
      sessionId: session.sessionId,
      clientId,
      role: "bot",
      text: aiReplyText,
    });

    // 🔟 Send response
    res.json({ reply: aiReplyText, sessionId: session.sessionId });
  } catch (error) {
    console.error("Error in /api/message:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;