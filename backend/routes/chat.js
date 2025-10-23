// backend/routes/chat.js
const express = require("express");
const { randomUUID } = require("crypto");
const Session = require("../models/Session");
const Message = require("../models/Message");
const { chatWithGroq } = require("../providers/groq");
const { chatWithGemini } = require("../providers/gemini");
const { crawlWebsite } = require("../utils/crawler");
const { getSystemPrompt } = require("../utils/systemPromptManager");

const router = express.Router();

// 🟢 Helper: fetch last N messages for context
async function fetchConversation(sessionId, limit = 12) {
  const docs = await Message.find({ sessionId })
    .sort({ createdAt: -1 }) // newest first
    .limit(limit)
    .lean();

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

// 🧩 Optional cache for crawled sites (so we don’t crawl every message)
const crawlCache = new Map(); // { websiteUrl: { content, lastFetched } }

// 🟢 POST /api/message (main chat endpoint)
router.post("/message", async (req, res) => {
  try {
    const {
      sessionId,
      clientId = "default",
      text,
      websiteUrl,
      forceGemini,
    } = req.body;

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

    // 3️⃣ Fetch last messages for context
    const history = await fetchConversation(session.sessionId, 12);

    // 🕷️ 4️⃣ Crawl website (if provided and not recently cached)
    let siteContext = "";
    if (websiteUrl) {
      const cached = crawlCache.get(websiteUrl);
      const now = Date.now();
      if (cached && now - cached.lastFetched < 1000 * 60 * 60 * 6) {
        // reuse if less than 6 hours old
        siteContext = cached.content;
        console.log(`♻️ Using cached crawl for ${websiteUrl}`);
      } else {
        console.log(`🕷️ Crawling: ${websiteUrl}`);
        siteContext = await crawlWebsite(websiteUrl, 2);
        crawlCache.set(websiteUrl, { content: siteContext, lastFetched: now });
      }
    }

    // 5️⃣ Build full system prompt (fetch from DB dynamically)
    let systemPrompt = await getSystemPrompt(clientId);

    if (!systemPrompt) {
      // fallback if no custom one yet
      systemPrompt = `
    You are FlexiBot — a friendly, respectful, and professional AI assistant designed to help website visitors.
    Respond naturally, clearly, and according to the question (no extra or less details).
    If the user asks general questions, reply helpfully.
    If the user greets you, greet them back and reply politely.
    If the user asks inappropriate questions, tell them no politely.
    If the user repeats a question, answer politely and naturally, without unnecessary disclaimers. Keep the conversation flowing.
    Always format multi-paragraph answers with clear line breaks between headings, paragraphs, and bullet points.
    When providing lists, use proper bullets (- or •) with a new line for each item.
    Use headings for main sections, subheadings for subsections if needed.
    Keep spacing consistent so the text is readable for website visitors.
  `;
    }

    // Add optional site content context
    systemPrompt += `

Website Context (use it to make answers site-specific):
${siteContext ? siteContext.slice(0, 3000) : "No website data available."}
`;

    // 6️⃣ Combine history + user text
    const prompt = `${systemPrompt}\n\n${history
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n")}\nuser: ${text}\nassistant:`;

    // 7️⃣ Generate AI reply (Groq → fallback Gemini)
    let aiReplyText = "Hello! How can I assist you today?";
    let aiResponse;

    try {
      if (forceGemini) {
        aiResponse = await timeout(20000, chatWithGemini(prompt));
      } else {
        try {
          aiResponse = await timeout(20000, chatWithGroq(prompt));
          if (!aiResponse || aiResponse.status === "error") {
            console.warn("⚠️ Groq failed, switching to Gemini...");
            aiResponse = await timeout(20000, chatWithGemini(prompt));
          }
        } catch (err) {
          console.warn("⚠️ Groq call threw error, trying Gemini:", err.message);
          aiResponse = await timeout(20000, chatWithGemini(prompt));
        }
      }

      if (
        aiResponse &&
        typeof aiResponse.reply === "string" &&
        aiResponse.reply.trim()
      ) {
        aiReplyText = aiResponse.reply;
      }
    } catch (error) {
      console.error("AI call failed or timed out:", error.message);
    }

    // 8️⃣ Save bot reply
    await Message.create({
      sessionId: session.sessionId,
      clientId,
      role: "bot",
      text: aiReplyText,
    });

    // 9️⃣ Return final response
    res.json({ reply: aiReplyText, sessionId: session.sessionId });
  } catch (error) {
    console.error("Error in /api/message:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;