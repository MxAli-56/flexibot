// backend/routes/chat.js
const express = require("express");
const { randomUUID } = require("crypto");
const Session = require("../models/Session");
const Message = require("../models/Message");
const Client = require("../models/Clients");
const Lead = require("../models/Lead");
const { sendEmailWithRetry } = require("../utils/email");

const { chatWithMistral } = require("../providers/mistral");
const { chatWithQwen } = require("../providers/qwen");

const router = express.Router();

async function createLeadAndNotify(session, clientData, leadData) {
  if (!clientData) {
    console.warn(`⚠️ No client data found for session ${session.sessionId}, lead stored without email.`);
    
    // Still save the lead (no email possible)
    await Lead.create({
      sessionId: session.sessionId,
      clientId: session.clientId,
      name: leadData.name,
      phone: leadData.phone,
      issue: leadData.issue,
      doctor: leadData.doctor || "",
      time: leadData.time || "",
    });
    return; // exit early – no email to send
  }

  try {
    // Save lead to database (await this – we want it saved)
    await Lead.create({
      sessionId: session.sessionId,
      clientId: session.clientId,
      name: leadData.name,
      phone: leadData.phone,
      issue: leadData.issue,
      doctor: leadData.doctor || "",
      time: leadData.time || "",
    });

    // If clinic has an email, send notification in the background (don't await)
    if (clientData.email) {
      const subject = `New Lead from FlexiBot - ${clientData.name || "Clinic"}`;
      const body = `
A potential patient is interested:

Name: ${leadData.name}
Phone: ${leadData.phone}
Issue: ${leadData.issue}
Doctor preference: ${leadData.doctor || "Any"}
Preferred time: ${leadData.time || "Not specified"}

Please contact them soon.
      `;
      // Fire and forget – errors will be logged but not block the response
      sendEmailWithRetry(clientData.email, subject, body).catch((e) =>
        console.error("Background email error:", e),
      );
    } else {
      console.warn(
        `⚠️ No email set for client ${session.clientId}, lead stored but not sent.`,
      );
    }
  } catch (error) {
    console.error("❌ Error creating lead:", error);
    // Do not throw – we don't want to break the conversation
  }
}

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

// ============================================
// ✅ AI Validation Helper (used in confirmation step)
// ============================================
async function quickValidateWithAI(prompt) {
  try {
    // Reuse your Qwen provider with low token limit
    // If chatWithQwen accepts options, pass max_tokens
    const response = await chatWithQwen(prompt, { max_tokens: 50 });
    return response.reply.trim();
  } catch (error) {
    console.error("Validation AI failed:", error);
    return "VALID"; // fallback – assume valid if AI fails
  }
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

    // --- ABANDONED LEAD CHECK ---
    if (
      session.leadState &&
      Date.now() - new Date(session.createdAt).getTime() > 30 * 60 * 1000
    ) {
      // Reset lead state for abandoned sessions
      session.leadState = null;
      session.tempLead = null;
      await session.save();
    }

    // 3️⃣ Save user message
    await Message.create({
      sessionId: session.sessionId,
      clientId,
      role: "user",
      text,
    });

    // --- LEAD COLLECTION LOGIC STARTS HERE ---
    // If lead already captured, skip
    if (!session.leadCaptured) {
      const bookingIntent =
        /book|appointment|schedule|visit|come in|see a doctor|consult|checkup|treatment|procedure|i'?d like to come|i want to come|i'?ll visit|i'?ll come|can i see dr\.?|make an appointment|fix an appointment|set up a visit/i.test(
          text,
        );

      // If no current lead state but we detect intent, start the flow
      if (bookingIntent && !session.leadState) {
        session.leadState = "awaiting_name";
        session.tempLead = {
          name: "",
          phone: "",
          issue: "",
          doctor: "",
          time: "",
        };
        await session.save();
        return res.json({
          reply:
            "Sure, I can help you schedule that. Please provide your name. (You can type 'cancel' anytime to stop or 'restart' to start over the booking process.)",
          sessionId: session.sessionId,
        });
      }

      // If we are in the middle of lead collection (session.leadState is set)
      if (session.leadState) {
        let reply = "";

        if (/go back|restart|start over/i.test(text)) {
          session.leadState = null;
          session.tempLead = null;
          await session.save();
          return res.json({
            reply: "Okay, let's start fresh. How can I help you?",
            sessionId: session.sessionId,
          });
        }

        // Allow user to cancel lead collection
        if (/cancel|never mind|forget it|stop/i.test(text)) {
          session.leadState = null;
          session.tempLead = null;
          await session.save();
          return res.json({
            reply: "Okay, let me know if you need any help!",
            sessionId: session.sessionId,
          });
        }

        switch (session.leadState) {
          case "awaiting_name":
            session.tempLead.name = text;
            session.leadState = "awaiting_phone";
            reply = "Thanks! Now please provide your phone number.";
            break;

          case "awaiting_phone":
            // Remove all non-digit characters except leading plus
            const cleaned = text.replace(/[^\d+]/g, "");
            // Allow optional leading plus, then 8-15 digits
            const isValidPhone = /^\+?\d{8,15}$/.test(cleaned);
            if (!isValidPhone) {
              reply = "Please enter a valid phone number.";
              // Stay in awaiting_phone state
              break;
            }
            session.tempLead.phone = text; // store original input
            session.leadState = "awaiting_issue";
            reply =
              "Please briefly describe the issue you're facing (e.g., wisdom tooth pain, general checkup).";
            break;

          case "awaiting_issue":
            session.tempLead.issue = text;
            session.leadState = "awaiting_doctor";
            reply =
              "Is there a specific doctor you'd prefer? (If you're not sure, just say 'any' for our team to assign best doctor for your issue)";
            break;

          case "awaiting_doctor":
            session.tempLead.doctor = text.toLowerCase() === "any" ? "" : text;
            session.leadState = "awaiting_time";
            reply =
              "What time would you prefer? (e.g., 'around 6 PM' or 'anytime')";
            break;

          case "awaiting_time":
            // Check if user is trying to change doctor instead of providing time
            const doctorChangeRegex = /dr\.?\s*[a-z]+(?:\s+[a-z]+)?/i; // basic doctor mention
            if (doctorChangeRegex.test(text) && !text.match(/\d/)) {
              // contains doctor keyword but no digits
              session.leadState = "awaiting_doctor";
              reply =
                "Sure, which doctor would you prefer? (If you're not sure, just say 'any' for our team to assign best doctor for your issue)";
              break;
            }
            // Normal time handling
            session.tempLead.time =
              text.toLowerCase() === "anytime" ? "" : text;
            session.leadState = "awaiting_confirmation";
            reply = `Great! Let me confirm the details:\n\nName: ${session.tempLead.name}\nPhone: ${session.tempLead.phone}\nIssue: ${session.tempLead.issue}\nDoctor: ${session.tempLead.doctor || "Any"}\nTime: ${session.tempLead.time || "Anytime"}\n\nIs this correct? (yes/no)`;
            break;

          case "awaiting_confirmation":
            if (/yes|correct|right|ok|yep|yeah/i.test(text)) {
              // AI validation
              const validationPrompt = `
Based on the BUSINESS KNOWLEDGE below, check if this appointment request is valid:
- Doctor: ${session.tempLead.doctor || "Any"}
- Time: ${session.tempLead.time || "Anytime"}
- Issue: ${session.tempLead.issue}

BUSINESS KNOWLEDGE:
${clientData.siteContext || "No data"}

If the doctor is available at that time (or if "Any" is chosen), respond with "VALID".
If the doctor is not available at that time, respond with "INVALID: [reason]".
If the time is outside clinic hours, respond with "INVALID: Clinic closed at that time".
    `;
              const validation = await quickValidateWithAI(validationPrompt);

              if (validation.startsWith("VALID")) {
                await createLeadAndNotify(
                  session,
                  clientData,
                  session.tempLead,
                );
                session.leadCaptured = true;
                session.leadState = null;
                session.tempLead = null;
                reply =
                  "Thank you! Your appointment request has been sent. Our team will call you shortly to confirm.";
              } else {
                reply = `I notice an issue: ${validation.replace("INVALID: ", "")}. Would you like to restart? (type 'restart' to begin again)`;
                // Optionally, you could set a state to handle restart, but simplest is to let them restart manually
                session.leadState = null; // reset state so next message is fresh
                session.tempLead = null;
              }
            } else {
              // User said no – restart
              session.leadState = null;
              session.tempLead = null;
              reply =
                "No problem! Let's start over. What would you like to book?";
            }
            break;
        }

        await session.save();
        return res.json({ reply, sessionId: session.sessionId });
      }
    }
    // --- LEAD COLLECTION LOGIC ENDS HERE ---

    // --- POST‑LEAD CHANGE HANDLER ---
    if (
      session.leadCaptured &&
      /change|modify|update|reschedule|cancel|wrong|mistake/i.test(text)
    ) {
      return res.json({
        reply:
          "If you need to change or cancel your appointment, please let our receptionist know when they call to confirm. They'll be happy to assist you.",
        sessionId: session.sessionId,
      });
    }

    // 4️⃣ Get Chat History
    const history = await fetchConversation(session.sessionId, 12);

    // ============================================
    // 🚨 1.5️⃣ CLINIC HOURS ENFORCEMENT - MULTI-TENANT PARSER
    // ============================================
    const now = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Karachi" }),
    );
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentTimeDecimal = currentHour + currentMinutes / 60;

    let isClinicOpen = false;
    let openDisplayHour, openDisplayMinute, openDisplayAmPm;
    let closeDisplayHour, closeDisplayMinute, closeDisplayAmPm;
    let clinicHoursExist = false;

    if (clientData?.siteContext) {
      const siteContext = clientData.siteContext;

      // STEP 1: Parse Clinic Hours (keep this)
      const clinicHoursMatch = siteContext.match(
        /Clinic Hours:?\s*([A-Za-z, -]+?)\s*(\d+):(\d+)\s*(AM|PM)?\s*(?:-|to)\s*(\d+):(\d+)\s*(AM|PM)/i,
      );
      console.log("🔍 Clinic hours match:", clinicHoursMatch);

      if (clinicHoursMatch) {
        clinicHoursExist = true;
        let openHour = parseInt(clinicHoursMatch[2]);
        const openMinute = parseInt(clinicHoursMatch[3]) || 0;
        const openAmPm = clinicHoursMatch[4];
        let closeHour = parseInt(clinicHoursMatch[5]);
        const closeMinute = parseInt(clinicHoursMatch[6]) || 0;
        const closeAmPm = clinicHoursMatch[7];

        openDisplayHour = openHour;
        openDisplayMinute = openMinute;
        openDisplayAmPm = openAmPm;
        closeDisplayHour = closeHour;
        closeDisplayMinute = closeMinute;
        closeDisplayAmPm = closeAmPm;

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
          currentTimeDecimal < closeDecimal;

        console.log("📅 Parsed hours:", {
          openHour,
          openMinute,
          openAmPm,
          closeHour,
          closeMinute,
          closeAmPm,
        });
        console.log("⏰ 24h conversion:", {
          openDecimal,
          closeDecimal,
          currentTimeDecimal,
        });
        console.log("🏥 isClinicOpen:", isClinicOpen);
      }
    }

    // ============================================
    // ✅ CLINIC FACTS INJECTION
    // ============================================
    let clinicFacts = "";

    // A short, persistent reminder about listing ALL doctors – included in every response
    const doctorListReminder =
      "\n📌 REMINDER: When asked about today's doctors, you MUST list EVERY doctor working today (including evening shifts) from BUSINESS KNOWLEDGE. Do NOT omit any.";

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

    // 1. ALWAYS generate the Metadata (This fixes the "Open" logic amnesia)
    const contextMetadata = `[CONTEXT: Today=${getCurrentDateTime().split(",")[0]} | Time=${currentHour}:${currentMinutes.toString().padStart(2, "0")} | Clinic_Status=${isClinicOpen ? "OPEN" : "CLOSED"}]`;

    if (!isClinicOpen) {
      // --- START: YOUR SAVED CLOSED LOGIC (UNTOUCHED) ---
      let closedMsg = "IMPORTANT CONTEXT: The clinic is CURRENTLY CLOSED.";
      if (clinicHoursExist) {
        const openTime = `${openDisplayHour % 12 || 12}:${openDisplayMinute.toString().padStart(2, "0")} ${openDisplayAmPm?.toUpperCase() || "AM"}`;
        const closeTime = `${closeDisplayHour % 12 || 12}:${closeDisplayMinute.toString().padStart(2, "0")} ${closeDisplayAmPm?.toUpperCase() || "PM"}`;
        closedMsg += ` Today's hours were ${openTime} - ${closeTime}.`;
      }
      closedMsg += `\n\n[SUPREME RULE]: If the user asks about TOMORROW or any FUTURE day, do NOT say 'The clinic is closed.' Instead, immediately provide the FULL doctor list from BUSINESS KNOWLEDGE for that day.`;
      closedMsg += `\n\nRULES FOR TODAY ONLY:\n- If the user asks about TODAY's availability: Start with "Our clinic is currently closed."\n- For general info (parking, services, etc.): Answer normally.\n- If the user asks for a doctor that only works on Sundays (none): State the clinic is closed.`;
      clinicFacts = contextMetadata + doctorListReminder + "\n" + closedMsg;
    } else {
      // --- START: NEW OPEN LOGIC ---
      clinicFacts = contextMetadata + doctorListReminder;
      if (history.length === 0) {
        const openTimeStr = clinicHoursExist
          ? `${openDisplayHour % 12 || 12}:${openDisplayMinute.toString().padStart(2, "0")} ${openDisplayAmPm?.toUpperCase()}`
          : "9:00 AM";
        const closeTimeStr = clinicHoursExist
          ? `${closeDisplayHour % 12 || 12}:${closeDisplayMinute.toString().padStart(2, "0")} ${closeDisplayAmPm?.toUpperCase()}`
          : "10:00 PM";
        clinicFacts += `\n✅ Clinic is CURRENTLY OPEN. Today's hours are ${openTimeStr} - ${closeTimeStr}.`;
      }
    }

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

      // 9.5 Fix any remaining Dr. line breaks (from model output)
      aiReplyText = aiReplyText.replace(/Dr\.\s*\n\s*/g, "Dr. ");
      aiReplyText = aiReplyText.replace(/Dr\.\s*<br\s*\/?>\s*/g, "Dr. ");

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

      // 14. DYNAMIC LINK CONVERSION (Markdown [Text](URL) -> HTML)
      // We do this first so the Google Maps link is safely converted.
      aiReplyText = aiReplyText.replace(
        /\[(.*?)\]\((.*?)\)/g,
        '<a href="$2" class="phone-link" target="_blank">$1</a>',
      );

      // 15. 📞 PHONE NUMBER -> HTML LINK (With "Already Processed" Protection)
      // This regex specifically avoids numbers that are inside href="" or already in <a> tags.
      aiReplyText = aiReplyText.replace(
        /(?<!href="tel:|">)(0\d{2,3}[-\s]?\d{5,8}|\+?92[-\s]?\d{9,12})(?![^<]*<\/a>)/g,
        (match) => {
          const cleanNumber = match.replace(/[-\s]/g, "");
          if (cleanNumber.length < 10) return match;

          const displayNumber = match.trim();
          return `<a href="tel:${cleanNumber}" class="phone-link">${displayNumber}</a>`;
        },
      );

      // 16. FINAL CLEANUP (Space/Punctuation)
      aiReplyText = aiReplyText.replace(
        /<a([^>]+)>(.*?) ([.,!?;])<\/a>/g,
        "<a$1>$2</a>$3",
      );

      // 17. FINAL CLEANUP
      aiReplyText = aiReplyText
        .trim()
        .replace(/(<br\s*\/?>|\n|\s)+$/gi, "")
        .trim();

      // 18. REMOVE EXCESSIVE LINE BREAKS (max 2 = 1 blank line) - MOVED FROM 16
      aiReplyText = aiReplyText.replace(/(<br\s*\/?>){3,}/gi, "<br/><br/>");
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