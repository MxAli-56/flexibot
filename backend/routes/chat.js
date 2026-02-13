// backend/routes/chat.js
const express = require("express");
const { randomUUID } = require("crypto");
const Session = require("../models/Session");
const Message = require("../models/Message");
const Client = require("../models/Clients");

const { chatWithMistral } = require("../providers/mistral");
const { chatWithQwen } = require("../providers/qwen");

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

    // ============================================
    // 🚨 1.5️⃣ CLINIC HOURS ENFORCEMENT - MULTI-TENANT PARSER
    // ============================================
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentTimeDecimal = currentHour + currentMinutes / 60;

    let isAnyDoctorAvailableNow = false;
    let isClinicOpen = false;
    let nextOpenTime = "tomorrow during business hours";
    let upcomingDoctorsToday = []; // ✅ FIXED: was missing

    if (clientData?.siteContext) {
      const siteContext = clientData.siteContext;

      // STEP 1: Parse Clinic Hours
      const clinicHoursMatch = siteContext.match(
        /Clinic Hours:?\s*([^-]+)-?\s*(\d+):(\d+)\s*(AM|PM)?\s*(?:-|to)\s*(\d+):(\d+)\s*(AM|PM)/i,
      );

      if (clinicHoursMatch) {
        let openHour = parseInt(clinicHoursMatch[2]);
        const openMinute = parseInt(clinicHoursMatch[3]) || 0;
        const openAmPm = clinicHoursMatch[4];
        let closeHour = parseInt(clinicHoursMatch[5]);
        const closeMinute = parseInt(clinicHoursMatch[6]) || 0;
        const closeAmPm = clinicHoursMatch[7];

        if (openAmPm?.toLowerCase() === "pm" && openHour !== 12) openHour += 12;
        if (openAmPm?.toLowerCase() === "am" && openHour === 12) openHour = 0;
        if (closeAmPm?.toLowerCase() === "pm" && closeHour !== 12)
          closeHour += 12;
        if (closeAmPm?.toLowerCase() === "am" && closeHour === 12)
          closeHour = 0;

        const openDecimal = openHour + openMinute / 60;
        const closeDecimal = closeHour + closeMinute / 60;

        isClinicOpen =
          currentTimeDecimal >= openDecimal &&
          currentTimeDecimal <= closeDecimal;
      }

      // STEP 2: Parse doctor blocks
      const doctorBlocks = siteContext.split(
        /\n(?=(?:Dr\.?|Doctor)\s+[A-Z]|[A-Z][a-z]+ [A-Z][a-z]+:)/g,
      );

      for (const block of doctorBlocks) {
        if (!block.includes(":")) continue;

        // Extract doctor name
        const nameMatch = block.match(
          /^(?:Dr\.?|Doctor)?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*:/,
        );
        if (!nameMatch) continue;
        const doctorName = nameMatch[1].trim();

        // Extract schedule part (after colon, before Unavailable)
        const schedulePart = block
          .split(":")[1]
          .split(/\(Unavailable|Off|Closed|Not available/i)[0]
          .trim();

        // Check if doctor works today
        const today = now
          .toLocaleDateString("en-US", { weekday: "long" })
          .toLowerCase();
        const todayAbbr = today.substring(0, 3);
        const todayShort = today.substring(0, 3).replace(".", "");

        const dayPatterns = [
          today,
          todayAbbr,
          todayShort,
          today.replace("wed", "weds?"),
          `\\b${todayAbbr}\\b`,
          `\\b${todayShort}\\b`,
        ];

        const dayRegex = new RegExp(dayPatterns.join("|"), "i");
        const worksToday =
          dayRegex.test(schedulePart) && !/sun|sat/i.test(schedulePart);

        if (!worksToday) continue;

        // Extract time range
        const timeRegex =
          /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;
        const timeMatch = schedulePart.match(timeRegex);

        if (timeMatch) {
          let startHour = parseInt(timeMatch[1]);
          const startMinute = parseInt(timeMatch[2]) || 0;
          const startAmPm = timeMatch[3] ? timeMatch[3].toLowerCase() : null;

          let endHour = parseInt(timeMatch[4]);
          const endMinute = parseInt(timeMatch[5]) || 0;
          const endAmPm = timeMatch[6] ? timeMatch[6].toLowerCase() : null;

          const convertTo24Hour = (hour, ampm) => {
            if (ampm) {
              if (ampm === "pm" && hour !== 12) return hour + 12;
              if (ampm === "am" && hour === 12) return 0;
              return hour;
            } else {
              return hour;
            }
          };

          startHour = convertTo24Hour(startHour, startAmPm);
          endHour = convertTo24Hour(endHour, endAmPm);

          const startDecimal = startHour + startMinute / 60;
          const endDecimal = endHour + endMinute / 60;

          if (
            currentTimeDecimal >= startDecimal &&
            currentTimeDecimal <= endDecimal
          ) {
            isAnyDoctorAvailableNow = true;
          }

          if (currentTimeDecimal < startDecimal) {
            const displayHour = startHour % 12 || 12;
            const displayMinute = startMinute.toString().padStart(2, "0");
            const displayAmPm = startHour >= 12 ? "PM" : "AM";
            const displayTime = `${displayHour}:${displayMinute} ${displayAmPm}`;

            upcomingDoctorsToday.push({
              name: doctorName,
              time: startDecimal,
              displayTime,
            });
          }
        }
      }

      // Determine next open time
      if (upcomingDoctorsToday.length > 0) {
        upcomingDoctorsToday.sort((a, b) => a.time - b.time);
        nextOpenTime = `today at ${upcomingDoctorsToday[0].displayTime}`;
      }
    }

    // ============================================
    // ✅ INJECT CLINIC FACTS - WITH CONVERSATION STATE
    // ============================================
    let clinicFacts = "";

    if (history.length === 0) {
      // First message - give full context
      clinicFacts = `
=== CURRENT CLINIC CONTEXT ===
Current time: ${currentHour}:${currentMinutes.toString().padStart(2, "0")}
Clinic is ${isClinicOpen ? "OPEN" : "CLOSED"} based on operating hours
${isAnyDoctorAvailableNow ? "Doctors are available now" : "No doctors are available at this moment"}
Next doctor available: ${nextOpenTime}
`;
    } else {
      // Check if doctor list was already provided in last 2 bot messages
      const botMessages = history
        .filter((msg) => msg.role === "assistant")
        .slice(-2);
      const doctorListAlreadyProvided = botMessages.some(
        (msg) =>
          msg.content.includes("available dentists are:") ||
          msg.content.includes("Dr. Sameer") ||
          msg.content.includes("Dr. Faraz"),
      );

      let reminders = [];

      if (doctorListAlreadyProvided) {
        reminders.push(
          "REMINDER: You have already provided the doctor list. Do NOT repeat the full list. Only answer the current question.",
        );
      }

      if (!isClinicOpen) {
        reminders.push(
          "REMINDER: Clinic is CLOSED. If user asks about today's availability, start with 'Our clinic is currently closed.'",
        );
      }

      if (reminders.length > 0) {
        clinicFacts = `
=== CONVERSATION REMINDERS ===
${reminders.join("\n")}
`;
      }
    }

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

    // 6️⃣ Assembly - Inject clinic facts ONCE
    const prompt = `${finalSystemPrompt}\n\n${clinicFacts}\n\nPrevious conversation:\n${history
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n")}\n\nUser: ${text}\nassistant:`;

    // 7️⃣ Primary: Qwen 2.5-72B (with Mistral fallback)
    let aiReplyText = "";

    try {
      console.log(`🤖 Qwen primary for: ${clientData?.name || clientId}`);
      const qwenRes = await chatWithQwen(prompt);

      if (qwenRes.status === "success" && qwenRes.reply) {
        aiReplyText = qwenRes.reply;
        console.log("✅ Qwen successful");
      } else {
        throw new Error("Qwen failed");
      }
    } catch (error) {
      console.warn("⚠️ Qwen failed, falling back to Mistral...");

      try {
        console.log(`💎 Mistral fallback for: ${clientData?.name || clientId}`);
        const mistralRes = await chatWithMistral(prompt);

        if (mistralRes.status === "success" && mistralRes.reply) {
          aiReplyText = mistralRes.reply;
          console.log("✅ Mistral fallback successful");
        } else {
          throw new Error("Mistral also failed");
        }
      } catch (e) {
        aiReplyText = "Service temporarily busy. Please try again.";
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

      // 15 📞 CONVERT ANY PHONE NUMBER TO CLICKABLE TEL LINK
      aiReplyText = aiReplyText.replace(
        /(?:0\d{2,3}[-\s]?\d{5,7}|\+92[-\s]?\d{10})/g,
        (match) => {
          // Remove all non-digit characters for the tel: link
          const cleanNumber = match.replace(/[-\s]/g, "");
          return `<a href="tel:${cleanNumber}" style="color: #007bff; text-decoration: underline; font-weight: bold;">${match}</a>`;
        },
      );

      // 16. FINAL CLEANUP
      aiReplyText = aiReplyText
        .trim()
        .replace(/(<br\s*\/?>|\n|\s)+$/gi, "")
        .trim();

      // 17. REMOVE EXCESSIVE LINE BREAKS (max 2 = 1 blank line) - MOVED FROM 16
      aiReplyText = aiReplyText.replace(/(<br\s*\/?>){3,}/gi, "<br/><br/>");

      // 18. 🚨 REMOVE REPEATED CONTENT - MOVED TO END
      if (history.length > 0) {
        const lastBotMessage = history
          .filter((m) => m.role === "assistant")
          .pop();

        if (lastBotMessage) {
          const lastText = lastBotMessage.content;
          const currentText = aiReplyText;

          // Simple approach: if current response starts with the exact same sentence as last response
          const firstSentenceLast = lastText.split(".")[0];
          const firstSentenceCurrent = currentText.split(".")[0];

          if (
            firstSentenceLast === firstSentenceCurrent &&
            firstSentenceLast.length > 20
          ) {
            aiReplyText = currentText
              .replace(firstSentenceCurrent + ".", "")
              .trim();
          }

          // If the full doctor list appears in both, remove it from current
          const doctorListPattern =
            /(?:Dr\.\s*[A-Za-z]+\s+[A-Za-z]+:\s*\d[^n]+)/g;
          const lastMatches = lastText.match(doctorListPattern) || [];
          const currentMatches = currentText.match(doctorListPattern) || [];

          if (lastMatches.length > 0 && currentMatches.length > 0) {
            currentMatches.forEach((match) => {
              aiReplyText = aiReplyText.replace(match, "");
            });
          }

          // Final cleanup of any formatting broken by removal
          aiReplyText = aiReplyText
            .replace(/\n{3,}/g, "\n\n")
            .replace(/Dr\.\s+<br\/?>/g, "Dr. ")
            .replace(/Dr\.<br\/?>/g, "Dr. ")
            .trim();
        }
      }
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