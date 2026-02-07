// backend/routes/chat.js
const express = require("express");
const { randomUUID } = require("crypto");
const Session = require("../models/Session");
const Message = require("../models/Message");
const Client = require("../models/Clients");

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

    const getCurrentDateTime = () => {
      const now = new Date();
      const options = {
        timeZone: "Asia/Karachi",
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      };
      return now.toLocaleString("en-US", options);
    };

const finalSystemPrompt = `
${clientData?.systemPrompt || "You are a helpful assistant."}

=== CURRENT CONTEXT ===
Today's Date & Time: ${getCurrentDateTime()}

=== BUSINESS KNOWLEDGE ===
${clientData?.siteContext || "No specific business data available.".slice(0, 5000)}

=== UI INSTRUCTIONS ===
- Always use a double newline (\n\n) between different thoughts.
- Use **Bold** for emphasis on doctors, times, and locations.
- Use Bullet points for lists.
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

    // ✨ 7.5️⃣ AGGRESSIVE POST-PROCESSING FOR MISTRAL
if (aiReplyText) {
  // 1. Remove internal thoughts in parentheses
  aiReplyText = aiReplyText.replace(/\(If user.*?\)/gi, "");
  aiReplyText = aiReplyText.replace(/\(Note:.*?\)/gi, "");
  aiReplyText = aiReplyText.replace(/\(If you'd like to book.*?\)/gi, "");
  aiReplyText = aiReplyText.replace(/\(If yes.*?\)/gi, "");
  aiReplyText = aiReplyText.replace(/\(If no.*?\)/gi, "");

  // 2. Remove booking spam phrases
  aiReplyText = aiReplyText.replace(
    /Would you like to book (a time|a slot|it)\?/gi,
    "",
  );
  aiReplyText = aiReplyText.replace(/Should I book it\?/gi, "");
  aiReplyText = aiReplyText.replace(/Want me to check availability\?/gi, "");

  // 3. Fix "How else can I help" at conversation start
  aiReplyText = aiReplyText.replace(
    /^(Hey!|Hi!) How else can I help you.*?\?/i,
    "How can I help you today?",
  );

  // 4. Scrub robotic starts
  aiReplyText = aiReplyText.replace(/^(Got it!|Certainly!)\s*/i, "");

  // 5. Fix "visit us near Lucky One Mall" to proper address
  aiReplyText = aiReplyText.replace(
    /visit us (near|in|at) Lucky One Mall/gi,
    "visit us at Gulshan-e-Iqbal, Block 10 (near Lucky One Mall)",
  );

  // 6. Replace "confirm your visit" with "for more assistance"
  aiReplyText = aiReplyText.replace(
    /To confirm your (visit|visits)/gi,
    "For more assistance",
  );

  // 7. EMOJI CONTROL - Keep only in goodbye messages
  const emojiRegex = /😊|😔|👍|✨|🦷|💙/g;
  const isClosingMessage =
    /see you|have a (great|wonderful) day|goodbye|take care|you're welcome|thank you/i.test(
      aiReplyText,
    );

  if (!isClosingMessage) {
    // Remove ALL emojis if not a goodbye message
    aiReplyText = aiReplyText.replace(emojiRegex, "");
  } else {
    // If goodbye, keep only ONE emoji at the end
    aiReplyText = aiReplyText.replace(emojiRegex, "");
    aiReplyText = aiReplyText.trim() + " 😊";
  }

  // 8. Add line breaks between sentences (WhatsApp style)
  aiReplyText = aiReplyText.replace(/\.\s+/g, ".\n\n");
  aiReplyText = aiReplyText.replace(/!\s+/g, "!\n\n");
  aiReplyText = aiReplyText.replace(/\?\s+/g, "?\n\n");

  // 9. Clean up excessive newlines (max 2 in a row)
  aiReplyText = aiReplyText.replace(/\n{3,}/g, "\n\n");

  // 10. Clean up extra spaces
  aiReplyText = aiReplyText.replace(/[ \t]+/g, " ").trim();

  // 11. Final cleanup - remove trailing newlines before emoji
  aiReplyText = aiReplyText.replace(/\n+😊/g, " 😊");

  // 12. DYNAMIC LINK CONVERSION: Turns [Any Text](any-url) into a Blue Clickable Link
  aiReplyText = aiReplyText.replace(
    /\[(.*?)\]\((.*?)\)/g,
    '<a href="$2" target="_blank" style="color: #007bff !important; text-decoration: underline; font-weight: bold;">$1</a>',
  );

  // 13. IMPROVED BOLDING: Fix broken bold stars (handles cases where stars are on new lines)
  aiReplyText = aiReplyText.replace(/\*\*\s*(.*?)\s*\*\*/g, "<b>$1</b>");

  // 14. SMARTER SPACING: Only add breaks if there isn't already a break there.
  // This prevents that "unusual" massive gap you see in Image 3.
  aiReplyText = aiReplyText.replace(
    /([.!?])\s*(Dr\.\s[A-Z])/g,
    "$1<br/><br/><b>$2</b>",
  );

  // 15. CLEANUP: If the AI left dangling stars like **Dr. or Shah**, remove them
  aiReplyText = aiReplyText.replace(/\*\*/g, "");
}

    // 8️⃣ Save & Respond (Using the now cleaned aiReplyText)
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