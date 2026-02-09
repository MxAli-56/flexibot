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
      // 1-6: YOUR ORIGINAL LOGIC (Thoughts, Spam, Address, robotic starts) - UNTOUCHED
      aiReplyText = aiReplyText.replace(/\(If user.*?\)/gi, "");
      aiReplyText = aiReplyText.replace(/\(Note:.*?\)/gi, "");
      aiReplyText = aiReplyText.replace(/\(If you'd like to book.*?\)/gi, "");
      aiReplyText = aiReplyText.replace(/\(If yes.*?\)/gi, "");
      aiReplyText = aiReplyText.replace(/\(If no.*?\)/gi, "");
      aiReplyText = aiReplyText.replace(
        /Would you like to book (a time|a slot|it)\?/gi,
        "",
      );
      aiReplyText = aiReplyText.replace(/Should I book it\?/gi, "");
      aiReplyText = aiReplyText.replace(
        /Want me to check availability\?/gi,
        "",
      );
      aiReplyText = aiReplyText.replace(
        /^(Hey!|Hi!) How else can I help you.*?\?/i,
        "How can I help you today?",
      );
      aiReplyText = aiReplyText.replace(/^(Got it!|Certainly!)\s*/i, "");
      aiReplyText = aiReplyText.replace(
        /visit us (near|in|at) Lucky One Mall/gi,
        "visit us at Gulshan-e-Iqbal, Block 10 (near Lucky One Mall)",
      );
      aiReplyText = aiReplyText.replace(
        /To confirm your (visit|visits)/gi,
        "For more assistance",
      );

      // 7. FIX DOCTOR NAMES - Bold the name only
      aiReplyText = aiReplyText.replace(
        /Dr\.?\s*(Sameer Ahmed|Alizeh Shah|Faraz Khan|Sarah Mansoor)/gi,
        "<b>Dr. $1</b>",
      );

      // This captures ANY word followed by a colon at the start of a line/break and bolds it.
      // Example: "- Immediate Actions:" becomes "<b>- Immediate Actions:</b>"
      aiReplyText = aiReplyText.replace(
        /(?:^|<br\s*\/?>)\s*[-•*]\s*(.*?):/gi,
        (match, p1) => `<br/><b>- ${p1}:</b>`,
      );

      // 9. CONVERT MARKDOWN BOLD TO HTML
      // Justification: Your old code was deleting the bolding. This keeps the bolding
      // by converting **text** into <b>text</b>.
      aiReplyText = aiReplyText.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>");

      // 10. Fix spacing after "from" and "to" (Keep your working code)
      aiReplyText = aiReplyText.replace(/from(\d)/gi, "from $1");
      aiReplyText = aiReplyText.replace(/to(\d)/gi, "to $1");

      // 11. EMOJI CONTROL - YOUR ORIGINAL LOGIC - UNTOUCHED
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

      // 12. DYNAMIC LINK CONVERSION - YOUR ORIGINAL LOGIC - UNTOUCHED
      aiReplyText = aiReplyText.replace(
        /\[(.*?)\]\((.*?)\)/g,
        '<a href="$2" target="_blank" style="color: #007bff; text-decoration: underline; font-weight: bold;">$1</a>',
      );

      // 13. PARAGRAPH SPACING - Add breaks ONLY at sentence ends (but NOT after "Dr.")
      // This prevents "Dr.<br/><br/>Name" issue
      aiReplyText = aiReplyText.replace(
        /([.!?])\s+(?![A-Z][a-z]+\s+(?:Ahmed|Shah|Khan|Mansoor))/g,
        "$1<br/><br/>",
      );

      // 14. BLANK LINE BEFORE FIRST BULLET
      // Justification: Standardizes spacing before a list starts.
      aiReplyText = aiReplyText.replace(
        /([.:])\s*([-•*]\s)/gi,
        "$1<br/><br/>$2",
      );

      // 15. BLANK LINE BETWEEN BULLETS
      // Justification: Ensures list items aren't cramped together.
      aiReplyText = aiReplyText.replace(
        /([-•*]\s[^\n<]+)\n([-•*]\s)/g,
        "$1<br/><br/>$2",
      );

      // 16. PREVENT TRIPLE BREAKS & CLEAN INNER BREAKS
      // Justification: Cleans up any accidental "gap stacking".
      aiReplyText = aiReplyText.replace(/(<br\s*\/?>){3,}/gi, "<br/><br/>");

      // 17. THE ULTIMATE GAP TERMINATOR
      // Justification: We are stripping every possible variation of a
      // trailing break so the HTML ends exactly at the last character.
      aiReplyText = aiReplyText.trim().replace(/(<br\s*\/?>|\n|\s)+$/gi, "");
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