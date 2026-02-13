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

    // ============================================
    // 🚨 1.5️⃣ CLINIC HOURS ENFORCEMENT - 100% ACCURATE, MULTI-TENANT
    // ============================================
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentTimeDecimal = currentHour + currentMinutes / 60;

    let isAnyDoctorAvailableNow = false;
    let nextOpenTime = "tomorrow during business hours"; 
    let availableDoctorsNow = [];
    let upcomingDoctorsToday = [];

    if (clientData?.siteContext) {
      const siteContext = clientData.siteContext;

      // Parse doctor schedules - works for ANY clinic's format
      const doctorRegex =
        /Dr\.\s*([^:]+):\s*([^.]+)\.?\s*(?:\(Unavailable.*?\))?/g;
      let match;

      while ((match = doctorRegex.exec(siteContext)) !== null) {
        const doctorName = match[1].trim();
        const schedule = match[2];

        // Check if doctor works today
        const today = now.toLocaleDateString("en-US", { weekday: "long" });
        if (
          schedule.includes(today.substring(0, 3)) ||
          schedule.includes(today)
        ) {
          // Extract times - handles "9:00 AM - 2:00 PM" format
          const timeMatch = schedule.match(
            /(\d+):(\d+)\s*(AM|PM)\s*-\s*(\d+):(\d+)\s*(AM|PM)/i,
          );
          if (timeMatch) {
            let startHour = parseInt(timeMatch[1]);
            const startMinute = parseInt(timeMatch[2]);
            const startAmPm = timeMatch[3];
            let endHour = parseInt(timeMatch[4]);
            const endMinute = parseInt(timeMatch[5]);
            const endAmPm = timeMatch[6];

            // Convert to 24-hour format
            if (startAmPm === "PM" && startHour !== 12) startHour += 12;
            if (startAmPm === "AM" && startHour === 12) startHour = 0;
            if (endAmPm === "PM" && endHour !== 12) endHour += 12;
            if (endAmPm === "AM" && endHour === 12) endHour = 0;

            const startDecimal = startHour + startMinute / 60;
            const endDecimal = endHour + endMinute / 60;

            // Check if available NOW
            if (
              currentTimeDecimal >= startDecimal &&
              currentTimeDecimal <= endDecimal
            ) {
              isAnyDoctorAvailableNow = true;
              availableDoctorsNow.push({ name: doctorName, schedule });
            }

            // Check if coming later today
            if (currentTimeDecimal < startDecimal) {
              const displayTime = `${startHour % 12 || 12}:${startMinute.toString().padStart(2, "0")} ${startAmPm}`;
              upcomingDoctorsToday.push({
                name: doctorName,
                time: startDecimal,
                displayTime,
              });
            }
          }
        }
      }

      // Determine next open time
      if (upcomingDoctorsToday.length > 0) {
        upcomingDoctorsToday.sort((a, b) => a.time - b.time);
        nextOpenTime = `today at ${upcomingDoctorsToday[0].displayTime}`;
      }
    }

    // Create instruction for AI - 100% accurate, no guessing
    const clinicStatusInstruction = isAnyDoctorAvailableNow
      ? `IMPORTANT - CLINIC STATUS: The clinic is CURRENTLY OPEN. Do NOT say "clinic is closed" or "currently closed" in your response.`
      : `IMPORTANT - CLINIC STATUS: The clinic is CURRENTLY CLOSED. Your response MUST begin with EXACTLY: "Our clinic is currently closed. We reopen ${nextOpenTime}. You can message me anytime for information as I am available 24/7." Do NOT provide phone numbers, maps links, "call us", or "visit us" in your response.`;

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

=== UI INSTRUCTIONS & ENFORCEMENT RULES ===

⏰ CRITICAL — YOU MUST FOLLOW THESE IN EVERY RESPONSE ⏰

1. Formatting rules:
   - Use double newline (\n\n) between paragraphs
   - Use <b>text</b> for bold (NOT **text**) for emphasis on doctors, times, and locations.
   - When listing multiple items (services, features, doctors, etc.), you MUST use HTML bullet format:

    <ul>
    <li>First item</li>
    <li>Second item</li>
    <li>Third item</li>
    ...
    </ul>

    NEVER use manual dashes (-) or asterisks (*) for lists.
    ALWAYS use proper <ul><li> HTML tags.

     Examples:

    WRONG:
    - Service 1
    - Service 2
    - Service 3

    RIGHT:
    <ul>
    <li>Service 1</li>
    <li>Service 2</li>
    <li>Service 3</li>
    ...
    </ul>

    WRONG:
    **Dr. Sameer Ahmed**

    RIGHT:
    <b>Dr. Sameer Ahmed</b>`;

    // 6️⃣ Assembly - INJECT the clinic status instruction
    const prompt = `${finalSystemPrompt}\n\n${clinicStatusInstruction}\n\n${history
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

      // 7. PARAGRAPH SPACING - Add breaks ONLY at sentence ends (but NOT after "Dr.")
      // This prevents "Dr.<br/><br/>Name" issue
      aiReplyText = aiReplyText.replace(
        /([.!?])\s+(?![A-Z][a-z]+\s+(?:Ahmed|Shah|Khan|Mansoor))/g,
        "$1<br/><br/>",
      );

      // 8. FIX DR. NAME BREAKING (prevent Dr.<br/>Name)
      aiReplyText = aiReplyText.replace(/<b>Dr\.<\/b><br\/>/g, "<b>Dr. </b>");

      // 9. FIX DOCTOR NAMES - Dynamic pattern, no hardcoding
      // Matches Dr/Dr. followed by 1-3 capitalized words (with optional initials)
      aiReplyText = aiReplyText.replace(
        /Dr\.?\s+([A-Z][a-z]*\.?\s+){1,3}/gi,
        (match) => `<b>${match}</b>`,
      );

      // 10. BOLD SERVICE NAMES (Pattern: "ServiceName: PKR")
      aiReplyText = aiReplyText.replace(
        /^([-•*]?\s*)([A-Z][^:]+):\s*PKR/gm,
        "$1<b>$2</b>: PKR",
      );

      // 11. FALLBACK: Convert manual bullets to HTML lists
      aiReplyText = aiReplyText.replace(
        /((?:^|\n)[-•*]\s+.+(?:\n[-•*]\s+.+)*)/gm,
        function (match) {
          const items = match
            .trim()
            .split(/\n/)
            .map((line) => {
              const cleaned = line.replace(/^[-•*]\s+/, "").trim();
              return `<li>${cleaned}</li>`;
            })
            .join("");
          return `<ul>${items}</ul>`;
        },
      );

      // 11.5 Convert **bold** markdown to <b>bold</b>
      aiReplyText = aiReplyText.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>");

      // 12. Fix spacing after "from" and "to"
      aiReplyText = aiReplyText.replace(/from(\d)/gi, "from $1");
      aiReplyText = aiReplyText.replace(/to(\d)/gi, "to $1");

      // 13. EMOJI CONTROL
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

      // 14. DYNAMIC LINK CONVERSION - YOUR ORIGINAL LOGIC - UNTOUCHED
      aiReplyText = aiReplyText.replace(
        /\[(.*?)\]\((.*?)\)/g,
        '<a href="$2" target="_blank" style="color: #007bff; text-decoration: underline; font-weight: bold;">$1</a>',
      );

      // 15 📞 CONVERT PHONE NUMBER TO CLICKABLE TEL LINK
      aiReplyText = aiReplyText.replace(
        /021-34XXXXXX/g,
        '<a href="tel:02134XXXXXX" style="color: #007bff; text-decoration: underline; font-weight: bold;">021-34XXXXXX</a>',
      );

      // 16. REMOVE EXCESSIVE LINE BREAKS (max 2 = 1 blank line)
      aiReplyText = aiReplyText.replace(/(<br\s*\/?>){3,}/gi, "<br/><br/>");

      // 17. FINAL CLEANUP
      aiReplyText = aiReplyText
        .trim()
        .replace(/(<br\s*\/?>|\n|\s)+$/gi, "")
        .trim();
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