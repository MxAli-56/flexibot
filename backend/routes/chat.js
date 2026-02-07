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
- For bullet lists, use simple dashes (-) with single line breaks between items.
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
      aiReplyText = aiReplyText.replace(
        /Want me to check availability\?/gi,
        "",
      );

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

      // 7. FIX DOCTOR NAME FORMATTING - Do this BEFORE bold conversion
      // Handles: "Dr. Alizeh Shah" or "Dr Alizeh Shah" or "Dr.Alizeh Shah"
      aiReplyText = aiReplyText.replace(
        /Dr\.?\s*(Sameer Ahmed|Alizeh Shah|Faraz Khan|Sarah Mansoor)/gi,
        "<b>Dr. $1</b>",
      );

      // 8. Fix spacing issues - Add space after "from" if missing
      aiReplyText = aiReplyText.replace(/from(\d)/gi, "from $1");

      // 9. Fix spacing issues - Add space after "to" if missing
      aiReplyText = aiReplyText.replace(/to(\d)/gi, "to $1");

      // 10. IMPROVED BOLDING for other text (but skip if already bolded from step 7)
      aiReplyText = aiReplyText.replace(/\*\*(?!<b>)(.*?)\*\*/g, "<b>$1</b>");

      // 11. CLEANUP: Remove any remaining double stars
      aiReplyText = aiReplyText.replace(/\*\*/g, "");

      // 12. EMOJI CONTROL - Keep only in goodbye messages
      const emojiRegex = /😊|😔|👍|✨|🦷|💙/g;
      const isClosingMessage =
        /see you|have a (great|wonderful) day|goodbye|take care|you're welcome|thank you/i.test(
          aiReplyText,
        );

      if (!isClosingMessage) {
        aiReplyText = aiReplyText.replace(emojiRegex, "");
      } else {
        aiReplyText = aiReplyText.replace(emojiRegex, "");
        aiReplyText = aiReplyText.trim() + " 😊";
      }

      // 13. DYNAMIC LINK CONVERSION
      aiReplyText = aiReplyText.replace(
        /\[(.*?)\]\((.*?)\)/g,
        '<a href="$2" target="_blank" style="color: #007bff; text-decoration: underline; font-weight: bold;">$1</a>',
      );

      // 14. CONSISTENT SPACING - Single line break between sentences
      aiReplyText = aiReplyText.replace(/\.\s+/g, ".<br/>");
      aiReplyText = aiReplyText.replace(/!\s+/g, "!<br/>");
      aiReplyText = aiReplyText.replace(/\?\s+/g, "?<br/>");

      // 15. BULLET POINT SPACING - Ensure consistent spacing around bullets
      // Detect bullet patterns: "- Text" or "• Text" or "* Text"
      aiReplyText = aiReplyText.replace(/(<br\/>){2,}([-•*]\s)/g, "<br/>$2"); // Single break before bullet
      aiReplyText = aiReplyText.replace(/([-•*]\s.*?)(<br\/>){2,}/g, "$1<br/>"); // Single break after bullet

      // 16. Clean up excessive line breaks (max 2 <br/> in a row = 1 blank line)
      aiReplyText = aiReplyText.replace(/(<br\/>){3,}/g, "<br/><br/>");

      // 17. Clean up extra spaces
      aiReplyText = aiReplyText.replace(/[ \t]+/g, " ").trim();

      // 18. Final cleanup - remove trailing line breaks before emoji
      aiReplyText = aiReplyText.replace(/(<br\/>)+😊/g, " 😊");
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