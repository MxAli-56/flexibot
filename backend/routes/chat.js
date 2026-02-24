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

// ============================================
// 📅 Enhanced Date Parsing Helper
// Returns a Date object set to that date at 00:00 Karachi time, or null if unparseable.
// Handles:
//   - Relative: 'today', 'tomorrow'
//   - Ordinal: '23rd Feb', 'Feb 23', '23 feb 2026'
//   - Numeric: '02/27/2026' (MM/DD/YYYY or DD/MM/YYYY), '2026-02-27'
// ============================================
function parseDate(dateStr, todayDate) {
  if (!dateStr || typeof dateStr !== 'string') return null;

  const lower = dateStr.trim().toLowerCase();

  // Relative dates
  if (lower === 'today') return new Date(todayDate);
  if (lower === 'tomorrow') {
    const tomorrow = new Date(todayDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }

  // Try ordinal patterns first (e.g., "23rd Feb", "Feb 23", "23 feb 2026")
  const monthNames = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  const monthAbbr = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

  // Pattern: ordinal day + month name (optional year)
  let match = dateStr.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)(?:\s+(\d{4}))?/i);
  if (match) {
    let day = parseInt(match[1], 10);
    let monthStr = match[2].toLowerCase();
    let year = match[3] ? parseInt(match[3], 10) : todayDate.getFullYear();
    let monthIndex = monthNames.findIndex(m => m.startsWith(monthStr));
    if (monthIndex === -1) monthIndex = monthAbbr.indexOf(monthStr);
    if (monthIndex !== -1 && day >= 1 && day <= 31) {
      return new Date(year, monthIndex, day);
    }
  }

  // Pattern: month name + day (optional year)
  match = dateStr.match(/([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?/i);
  if (match) {
    let monthStr = match[1].toLowerCase();
    let day = parseInt(match[2], 10);
    let year = match[3] ? parseInt(match[3], 10) : todayDate.getFullYear();
    let monthIndex = monthNames.findIndex(m => m.startsWith(monthStr));
    if (monthIndex === -1) monthIndex = monthAbbr.indexOf(monthStr);
    if (monthIndex !== -1 && day >= 1 && day <= 31) {
      return new Date(year, monthIndex, day);
    }
  }

  // Numeric patterns
  // Try YYYY-MM-DD
  match = dateStr.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (match) {
    let year = parseInt(match[1], 10);
    let month = parseInt(match[2], 10) - 1;
    let day = parseInt(match[3], 10);
    if (month >= 0 && month < 12 && day >= 1 && day <= 31) {
      return new Date(year, month, day);
    }
  }

  // Try MM/DD/YYYY or DD/MM/YYYY – need to disambiguate
  match = dateStr.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (match) {
    let first = parseInt(match[1], 10);
    let second = parseInt(match[2], 10);
    let year = parseInt(match[3], 10);

    // Try as DD/MM first (day <=31, month <=12)
    if (second >= 1 && second <= 12 && first >= 1 && first <= 31) {
      // Valid as DD/MM
      return new Date(year, second - 1, first);
    }
    // Try as MM/DD (month <=12, day <=31)
    if (first >= 1 && first <= 12 && second >= 1 && second <= 31) {
      return new Date(year, first - 1, second);
    }
  }

  return null;
}

// Parse a time range like "9:00 AM - 2:00 PM" into start/end decimals
function parseTimeRange(rangeStr) {
  const match = rangeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;
  let startHour = parseInt(match[1], 10);
  const startMin = parseInt(match[2], 10);
  const startAmpm = match[3].toLowerCase();
  let endHour = parseInt(match[4], 10);
  const endMin = parseInt(match[5], 10);
  const endAmpm = match[6].toLowerCase();

  if (startAmpm === 'pm' && startHour !== 12) startHour += 12;
  if (startAmpm === 'am' && startHour === 12) startHour = 0;
  if (endAmpm === 'pm' && endHour !== 12) endHour += 12;
  if (endAmpm === 'am' && endHour === 12) endHour = 0;

  return {
    start: startHour + startMin / 60,
    end: endHour + endMin / 60
  };
}

// Helper to convert phone numbers to clickable links (same regex as post‑processing)
function formatPhoneNumbers(text) {
  return text.replace(
        /(?<!href="tel:|">)(0\d{2,3}[-\s]?\d{5,8}|\+?92[-\s]?\d{9,12})(?![^<]*<\/a>)/g,
        (match) => {
          const cleanNumber = match.replace(/[-\s]/g, "");
          if (cleanNumber.length < 10) return match;

          const displayNumber = match.trim();
          return `<a href="tel:${cleanNumber}" class="phone-link">${displayNumber}</a>`;
        },
      );
    }

async function createLeadAndNotify(session, clientData, leadData) {
  try {
    // Save lead to database – if this fails, we throw so the caller knows
    await Lead.create({
      sessionId: session.sessionId,
      clientId: session.clientId,
      name: leadData.name,
      phone: leadData.phone,
      issue: leadData.issue,
      doctor: leadData.doctor || "",
      date: leadData.date || "",
      time: leadData.time || "",
    });

    // If clinic has an email, send notification in the background (don't await)
    if (clientData?.email) {
      const subject = `New Lead from FlexiBot - ${clientData.name || "Clinic"}`;
      const body = `
A potential patient is interested:

Name: ${leadData.name}
Phone: ${leadData.phone}
Issue: ${leadData.issue}
Doctor preference: ${leadData.doctor || "Any"}
Requested Date: ${leadData.date || "Not specified"}
Preferred time: ${leadData.time ? leadData.time : "Anytime"}

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

    return true; // Lead saved successfully
  } catch (error) {
    console.error("❌ Error creating lead:", error);
    return false; // Lead save failed
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
    const response = await chatWithQwen(prompt, { max_tokens: 50 });
    return response.reply.trim().split("\n")[0]; // take first line only
  } catch (error) {
    console.error("Validation AI failed:", error);
    return "VALID";
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
    // 🚨 1.5️⃣ CLINIC HOURS ENFORCEMENT - MULTI-TENANT PARSER
    // ============================================
    // Get current time in Karachi
    const nowInKarachi = new Date().toLocaleString("en-US", {
      timeZone: "Asia/Karachi",
    });
    const [, timePart] = nowInKarachi.split(", ");
    const [time, modifier] = timePart.split(" ");
    let [hours, minutes] = time.split(":");
    if (modifier === "PM" && hours !== "12") hours = parseInt(hours) + 12;
    if (modifier === "AM" && hours === "12") hours = 0;
    const currentHour = parseInt(hours);
    const currentMinutes = parseInt(minutes);
    const currentTimeDecimal = currentHour + currentMinutes / 60;

    let isClinicOpen = false;
    let openDisplayHour, openDisplayMinute, openDisplayAmPm;
    let closeDisplayHour, closeDisplayMinute, closeDisplayAmPm;
    let clinicHoursExist = false;
    let doctorSchedules = {};
    let doctorsTodayList = [];
    let openDecimal = 0,
      closeDecimal = 0;

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

        openDecimal = openHour + openMinute / 60;
        closeDecimal = closeHour + closeMinute / 60;

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

      // --- PARSE DOCTOR SCHEDULES (for JavaScript validation) ---
      doctorSchedules = {};
      const doctorRegex =
        /Dr\.\s*([^:]+):\s*\(Unavailable:\s*([^)]+)\)[^A-Z]*Available:\s*([^.]+)/gi;
      let match;
      console.log("📄 Starting doctor parsing...");
      while ((match = doctorRegex.exec(siteContext)) !== null) {
        const name = match[1].trim();
        const unavailable = match[2].split(",").map((d) => d.trim());
        const available = match[3].trim();
        console.log(`✅ Parsed doctor: ${name}`, { unavailable, available });
        doctorSchedules[name.toLowerCase()] = { name, unavailable, available };
      }
      console.log("📋 doctorSchedules keys:", Object.keys(doctorSchedules));

      // --- BUILD TODAY'S DOCTOR LIST (for injection) ---
      doctorsTodayList = [];
      const todayFull = getCurrentDateTime().split(",")[0];
      const todayAbbr = todayFull.substring(0, 3);
      for (let key in doctorSchedules) {
        const doc = doctorSchedules[key];
        if (!doc.unavailable.includes(todayAbbr)) {
          const timeMatch = doc.available.match(
            /(\d{1,2}:\d{2}\s*(?:AM|PM)\s*-\s*\d{1,2}:\d{2}\s*(?:AM|PM))/i,
          );
          const timings = timeMatch ? timeMatch[1] : doc.available;
          doctorsTodayList.push({ name: doc.name, timings });
        }
      }
      console.log(
        "📋 doctorsTodayList after build:",
        doctorsTodayList.map((d) => d.name),
      );
    }

    // 2️⃣ Create or find session
    let session = await Session.findOne({ sessionId });
    if (!session) {
      session = await Session.create({
        sessionId: sessionId || randomUUID(),
        clientId,
      });
    }

    // --- ABANDONED LEAD CHECK ---
    const lastActive = session.lastActivity || session.createdAt;
    if (
      session.leadState &&
      Date.now() - new Date(lastActive).getTime() > 30 * 60 * 1000
    ) {
      // Reset lead state for abandoned sessions
      session.leadState = null;
      session.tempLead = null;
      await session.save();
    }

    // --- RESTART COMMAND HANDLER (outside lead collection) ---
    if (
      !session.leadCaptured &&
      /restart|start over/i.test(text) &&
      !session.leadState
    ) {
      // Start a fresh booking flow
      session.leadState = "awaiting_name";
      session.tempLead = {
        name: "",
        phone: "",
        issue: "",
        doctor: "",
        date: "",
        time: "",
      };
      session.lastActivity = new Date();
      await session.save();
      return res.json({
        reply:
          "Sure, let's restart the booking process. Please provide your <b>name</b>. (You can type <b>cancel</b> anytime to stop or <b>restart</b> to start over the booking process.)",
        sessionId: session.sessionId,
      });
    }

    // 3️⃣ Save user message
    await Message.create({
      sessionId: session.sessionId,
      clientId,
      role: "user",
      text,
    });

    // Update last activity time
    session.lastActivity = new Date();
    await session.save();

    // --- LEAD COLLECTION LOGIC STARTS HERE ---
    // If lead already captured, skip
    if (!session.leadCaptured) {
      const bookingIntent =
        /\b(?:book|schedule|make|fix|set up)\s+(?:an?\s+)?(?:appointment|consultation|visit)\b|\b(?:i(?:'d| would)? like to|i want to|can i|i need to)\s+(?:book|schedule|make|fix|set up|come in|see a doctor|visit)\b/i.test(
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
          date: "",
          time: "",
        };
        session.lastActivity = new Date();
        await session.save();
        return res.json({
          reply:
            "Sure, I can help you schedule that. Please provide your <b>name</b>. (You can type <b>cancel</b> anytime to stop or <b>restart</b> to start over the booking process.)",
          sessionId: session.sessionId,
        });
      }

      // If we are in the middle of lead collection (session.leadState is set)
      if (session.leadState) {
        let reply = "";

        if (/go back|restart|start over/i.test(text)) {
          // Restart booking flow from beginning
          session.leadState = "awaiting_name";
          session.tempLead = {
            name: "",
            phone: "",
            issue: "",
            doctor: "",
            date: "",
            time: "",
          };
          session.lastActivity = new Date();
          await session.save();
          return res.json({
            reply:
              "Sure, let's restart the booking process. Please provide your <b>name</b>. (You can type <b>cancel</b> anytime to stop or <b>restart</b> to start over the booking process.)",
            sessionId: session.sessionId,
          });
        }

        // Allow user to cancel lead collection
        if (/cancel|never mind|forget it|stop/i.test(text)) {
          session.leadState = null;
          session.tempLead = null;
          session.lastActivity = new Date();
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
            reply = "Thanks! Now please provide your <b>phone number</b>.";
            break;

          case "awaiting_phone":
            // First, check raw input for allowed characters only: digits, spaces, dashes, optional leading plus
            if (!/^\+?[0-9\s-]+$/.test(text)) {
              reply =
                "Please enter a valid phone number. (Only digits, spaces, dashes, & plus sign is allowed)";
                break;
            }
            // Remove all non-digit characters except leading plus for length check
            const cleaned = text.replace(/[^\d+]/g, "");

            // Basic international length check
            if (!/^\+?\d{8,15}$/.test(cleaned)) {
              reply = "Please enter a valid phone number with 8 to 15 digits.";
              break;
            }

            // Additional validation for Pakistani numbers
            if (cleaned.startsWith("03") && cleaned.length !== 11) {
              reply =
                "For <b>Pakistani mobile numbers</b>, please enter 11 digits starting with 03.";
              break;
            }
            if (cleaned.startsWith("+92") && cleaned.length !== 13) {
              reply =
                "For <b>Pakistani numbers</b> with country code, please use +92 followed by 10 digits (total 13 characters).";
              break;
            }
            // If it starts with 0 but not 03, it might be a landline – accept (length 10-11)

            session.tempLead.phone = text; // store original input
            session.leadState = "awaiting_issue";
            reply =
              "Please briefly describe the <b>issue</b> you're facing (e.g: wisdom tooth pain, general checkup).";
            break;

          case "awaiting_issue":
            session.tempLead.issue = text;
            session.leadState = "awaiting_doctor";
            reply =
              "Is there a specific <b>doctor</b> you'd prefer? (If you're not sure, just say <b>any</b> for our team to assign best doctor for your issue)";
            break;

          case "awaiting_doctor":
            session.tempLead.doctor = text.toLowerCase() === "any" ? "" : text;
            session.leadState = "awaiting_date";
            reply =
              "For which <b>Day/Date</b> would you like to book? (e.g., 'today', 'tomorrow', 'June 5th' etc)";
            break;

          case "awaiting_date":
            // Check if user is trying to change doctor instead of providing time
            const doctorChangeRegex = /dr\.?\s*[a-z]+(?:\s+[a-z]+)?/i; // basic doctor mention
            if (doctorChangeRegex.test(text) && !text.match(/\d/)) {
              // contains doctor keyword but no digits
              session.leadState = "awaiting_doctor";
              reply =
                "Sure, which <b>doctor</b> would you prefer? (If you're not sure, just say <b>any</b> for our team to assign best doctor for your issue)";
              break;
            }
            session.tempLead.date = text;
            session.leadState = "awaiting_time";
            reply =
              "What <b>time</b> would you prefer? Please include AM or PM (e.g., '6 PM' or '1:30 PM' or 'anytime')";
            break;

          case "awaiting_time":
            // Check for "anytime"
            if (text.toLowerCase() === "anytime") {
              session.tempLead.time = "";
              session.leadState = "awaiting_confirmation";
              reply = `Great! Let me confirm the details:<br><br>Name: ${session.tempLead.name}<br>Phone: ${session.tempLead.phone}<br>Issue: ${session.tempLead.issue}<br>Doctor: ${session.tempLead.doctor || "Any"}<br>Date: ${session.tempLead.date}<br>Time: Anytime<br><br>Is this correct? (yes/no)`;
              break;
            }

            // Validate time format (must include AM/PM)
            const timeMatch = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
            if (!timeMatch || !timeMatch[3]) {
              reply =
                "Please specify AM or PM (e.g., '6 PM' or '1:30 PM' or 'anytime')";
              // Stay in awaiting_time
              break;
            }

            // Valid time with AM/PM – store and proceed
            session.tempLead.time = text;
            session.leadState = "awaiting_confirmation";
            reply = `Great! Let me confirm the details:<br><br>Name: ${session.tempLead.name}<br>Phone: ${session.tempLead.phone}<br>Issue: ${session.tempLead.issue}<br>Doctor: ${session.tempLead.doctor || "Any"}<br>Date: ${session.tempLead.date}<br>Time: ${session.tempLead.time}<br><br>Is this correct? (yes/no)`;
            break;

          case "awaiting_confirmation":
            if (/yes|correct|right|ok|yep|yeah/i.test(text)) {
              // ----- DATE PRE-VALIDATION (JavaScript) -----
              let validationError = null;

              // Get today's date in Karachi
              const nowInKarachi = new Date().toLocaleString("en-US", {
                timeZone: "Asia/Karachi",
              });
              const [todayDateStr] = nowInKarachi.split(", ");
              const [month, day, year] = todayDateStr.split("/").map(Number);
              const todayDate = new Date(year, month - 1, day);

              // Parse the user's requested date
              const parsedDate = parseDate(session.tempLead.date, todayDate);
              console.log("📅 Parsed date:", parsedDate); // debug

              if (parsedDate) {
                // 1. Past date check
                if (parsedDate < todayDate) {
                  validationError =
                    "That date has already passed. Please choose a future date.";
                } else {
                  const dayOfWeek = parsedDate.getDay(); // 0 = Sunday, 1 = Monday, ...

                  // 2. Clinic closed on Sunday
                  if (dayOfWeek === 0) {
                    validationError =
                      "Our clinic is closed on Sundays. Please choose another day.";
                  } else {
                    // 3. Doctor availability check (if specific doctor)
                    if (
                      session.tempLead.doctor &&
                      session.tempLead.doctor.toLowerCase() !== "any"
                    ) {
                      const doctorInput = session.tempLead.doctor
                        .toLowerCase()
                        .replace(/^dr\.?\s*/, "")
                        .trim();
                      const matchedDoctor = Object.values(doctorSchedules).find(
                        (d) =>
                          d.name.toLowerCase().includes(doctorInput) ||
                          doctorInput.includes(d.name.toLowerCase()),
                      );
                      if (matchedDoctor) {
                        const dayAbbr = [
                          "Sun",
                          "Mon",
                          "Tue",
                          "Wed",
                          "Thu",
                          "Fri",
                          "Sat",
                        ][dayOfWeek];
                        if (matchedDoctor.unavailable.includes(dayAbbr)) {
                          validationError = `${matchedDoctor.name} does not work on ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dayOfWeek]}. Their full schedule: ${matchedDoctor.available}.`;
                        }
                      }
                    }
                    // 4. For "any" doctor, ensure at least one doctor works that day
                    if (
                      !validationError &&
                      (!session.tempLead.doctor ||
                        session.tempLead.doctor.toLowerCase() === "any")
                    ) {
                      const dayAbbr = [
                        "Sun",
                        "Mon",
                        "Tue",
                        "Wed",
                        "Thu",
                        "Fri",
                        "Sat",
                      ][dayOfWeek];
                      const anyDoctorWorks = Object.values(
                        doctorSchedules,
                      ).some((doc) => !doc.unavailable.includes(dayAbbr));
                      if (!anyDoctorWorks) {
                        validationError =
                          "No doctors are available on that day. Please choose another day.";
                      }
                    }
                  }
                }
              } else {
                console.log(
                  "Date parsing failed, relying on AI for:",
                  session.tempLead.date,
                );
              }

              // If we have a validation error, reply immediately
              if (validationError) {
                reply = `I notice an issue: ${validationError} Would you like to restart? (type <b>restart</b> to begin again or <b>cancel</b> to stop)`;
                session.leadState = null;
                session.tempLead = null;
                session.lastActivity = new Date();
                await session.save();
                return res.json({ reply, sessionId: session.sessionId });
              }

              // Get day of week for requested date (if parsed)
              const dayNames = [
                "Sunday",
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
              ];
              let requestedDay = "";
              if (parsedDate) {
                requestedDay = dayNames[parsedDate.getDay()];
              }

              // ----- TIME-OF-DAY PRE-VALIDATION (for specific doctor + specific time) -----
              if (
                !validationError &&
                session.tempLead.doctor &&
                session.tempLead.doctor.toLowerCase() !== "any" &&
                session.tempLead.time &&
                session.tempLead.time.toLowerCase() !== "anytime"
              ) {
                // Parse requested time to decimal
                const timeStr = session.tempLead.time;
                const timeMatch = timeStr.match(
                  /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i,
                );
                if (timeMatch) {
                  let hour = parseInt(timeMatch[1]);
                  const minute = parseInt(timeMatch[2]) || 0;
                  const ampm = timeMatch[3] ? timeMatch[3].toLowerCase() : null;
                  if (ampm === "pm" && hour !== 12) hour += 12;
                  if (ampm === "am" && hour === 12) hour = 0;
                  const requestedDecimal = hour + minute / 60;

                  // Find the matched doctor
                  const doctorInput = session.tempLead.doctor
                    .toLowerCase()
                    .replace(/^dr\.?\s*/, "")
                    .trim();
                  const matchedDoctor = Object.values(doctorSchedules).find(
                    (d) =>
                      d.name.toLowerCase().includes(doctorInput) ||
                      doctorInput.includes(d.name.toLowerCase()),
                  );

                  if (matchedDoctor) {
                    const range = parseTimeRange(matchedDoctor.available);
                    if (range) {
                      if (requestedDecimal < range.start) {
                        validationError = `${matchedDoctor.name}'s shift starts at ${matchedDoctor.available.split("(")[1].split(")")[0]}. Please choose a time after that.`;
                      } else if (requestedDecimal > range.end) {
                        validationError = `${matchedDoctor.name}'s shift ends at ${matchedDoctor.available.split("(")[1].split(")")[0]}. Please choose an earlier time.`;
                      }
                      // if within range, no error
                    }
                  }
                }
              }

              // If still no error and it's a specific doctor + specific time, accept without AI
              if (
                !validationError &&
                session.tempLead.doctor &&
                session.tempLead.doctor.toLowerCase() !== "any" &&
                session.tempLead.time &&
                session.tempLead.time.toLowerCase() !== "anytime"
              ) {
                const leadSaved = await createLeadAndNotify(
                  session,
                  clientData,
                  session.tempLead,
                );
                if (leadSaved) {
                  session.leadCaptured = false;
                  session.leadState = null;
                  session.tempLead = null;
                  reply =
                    "Thank you! Your appointment request has been sent. Our team will call you shortly to confirm.";
                } else {
                  reply =
                    "Sorry, we're having trouble saving your request right now. Please call us at 021-34121905 to book your appointment. Our team will assist you immediately.";
                  session.leadState = null;
                  session.tempLead = null;
                }
                session.lastActivity = new Date();
                await session.save();
                return res.json({ reply, sessionId: session.sessionId });
              }

              // ----- AI VALIDATION (no JavaScript pre-validation) -----
              const validationPrompt = `
You are a validation assistant. Check if this appointment request is valid.

TODAY'S DATE: ${getCurrentDateTime().split(",")[0]}
CURRENT TIME: ${currentHour}:${currentMinutes.toString().padStart(2, "0")}

CLINIC HOURS: ${clinicHoursExist ? `${openDisplayHour % 12 || 12}:${openDisplayMinute.toString().padStart(2, "0")} ${openDisplayAmPm?.toUpperCase() || "AM"} - ${closeDisplayHour % 12 || 12}:${closeDisplayMinute.toString().padStart(2, "0")} ${closeDisplayAmPm?.toUpperCase() || "PM"}` : "Not specified"}

REQUEST DETAILS:
- Doctor: ${session.tempLead.doctor || "Any"}
- Requested date: ${session.tempLead.date}${requestedDay ? ` (${requestedDay})` : ""}
- Requested time: ${session.tempLead.time || "Anytime"}
- Issue: ${session.tempLead.issue}

DOCTOR SCHEDULES (from BUSINESS KNOWLEDGE):
${clientData.siteContext || "No data"}

INSTRUCTIONS - FOLLOW EXACTLY:

1. DATE INTERPRETATION: The user may provide a date in various formats (e.g., 'tomorrow', '21 Feb', '02/21/2026'). Interpret it relative to today's date (${getCurrentDateTime().split(",")[0]}). If the date is not provided or unclear, assume today.

2. TIME FORMAT: Convert times to 24-hour format for comparison. Example: "8:55 PM" = 20:55, "9:00 PM" = 21:00.

3. CLINIC HOURS CHECK:
   - The requested date and time must fall within clinic hours. If the date is today, check current time against clinic hours; if future, just ensure the time is within clinic hours.

4. DOCTOR AVAILABILITY CHECK:
   - Look at the doctor's schedule in BUSINESS KNOWLEDGE. It will be given in 12‑hour format (e.g., "9:00 AM - 2:00 PM").
   - First, check the "Unavailable" list: days in parentheses after "(Unavailable: ...)" are days the doctor DOES NOT work. Use the day of week provided in the request details (in parentheses) – do not recalculate it.
   - If that day is in the "Unavailable" list, respond with "INVALID: [Doctor] does not work on [day]. Their full schedule: [full schedule]."
   - Otherwise, the doctor works on that day. Convert the doctor's hours to 24‑hour format. Compare the requested time to the doctor's start and end times.
        * If the requested time is less than the start time, respond with "INVALID: [Doctor]'s shift starts at [start time]. Please choose a time after that."
        * If the requested time is greater than the end time, respond with "INVALID: [Doctor]'s shift ends at [end time]. Please choose an earlier time."
        * If the requested time is between start and end (inclusive of end time), then it is valid.
   - If valid, respond with "VALID".
   - If the user chose "Any", check that the clinic is open on that day and that at least one doctor is working (i.e., the requested day is not a day when all doctors are unavailable). If the clinic is open and at least one doctor works, respond with "VALID". Otherwise, provide an appropriate "INVALID: ..." message explaining (e.g., "The clinic is closed on Sundays" or "No doctors are available on that day").

   5. RESPONSE FORMAT - RESPOND WITH EXACTLY ONE OF THESE:
   - "VALID" if the request is valid
   - "INVALID: [reason]" where [reason] is one of the messages described above.
DO NOT add any other text. DO NOT explain your reasoning. Just return VALID or INVALID: followed by the reason.
`;

              console.log("VALIDATION PROMPT:", validationPrompt);
              const validation = await quickValidateWithAI(validationPrompt);
              console.log("VALIDATION RESPONSE:", validation);

              const cleanValidation = validation.trim();
              const validPattern = /^VALID[.!]?$/i;
              const invalidPattern = /^INVALID:\s*(.+)$/i;

              if (validPattern.test(cleanValidation)) {
                const leadSaved = await createLeadAndNotify(
                  session,
                  clientData,
                  session.tempLead,
                );

                if (leadSaved) {
                  session.leadCaptured = false;
                  session.leadState = null;
                  session.tempLead = null;
                  reply =
                    "Thank you! Your appointment request has been sent. Our team will call you shortly to confirm.";
                } else {
                  reply =
                    "Sorry, we're having trouble saving your request right now. Please call us at 021-34121905 to book your appointment. Our team will assist you immediately.";
                  session.leadState = null;
                  session.tempLead = null;
                }
              } else {
                let reason = cleanValidation;
                const invalidMatch = cleanValidation.match(invalidPattern);
                if (invalidMatch) reason = invalidMatch[1];
                if (!reason || reason.length < 5)
                  reason =
                    "We couldn't confirm this time. Please try a different time.";
                reply = `I notice an issue: ${reason} Would you like to restart? (type <b>restart</b> to begin again or <b>cancel</b> to stop)`;
                session.leadState = null;
                session.tempLead = null;
              }
            } else {
              // User said no – restart booking from name
              session.leadState = "awaiting_name";
              session.tempLead = {
                name: "",
                phone: "",
                issue: "",
                doctor: "",
                date: "",
                time: "",
              };
              await session.save();
              reply =
                "No problem! Let's start over. Please provide your <b>name</b>. (You can type <b>cancel</b> anytime to stop or <b>restart</b> to start over the booking process.)";
            }
            break;
        }
        session.lastActivity = new Date();
        await session.save();
        return res.json({ reply, sessionId: session.sessionId });
      }
    }
    // --- LEAD COLLECTION LOGIC ENDS HERE ---

    // --- POST‑LEAD CHANGE / NEW BOOKING HANDLER ---
      if (/change|modify|update|reschedule|cancel|wrong|mistake/i.test(text)) {
        const reply = formatPhoneNumbers(
          "If you need to change or cancel your appointment, please call us at 021-34121905. Our team will help you right away.",
        );
        session.lastActivity = new Date();
        await session.save();
        return res.json({ reply, sessionId: session.sessionId });
      }

    // 4️⃣ Get Chat History
    const history = await fetchConversation(session.sessionId, 12);

    // ============================================
    // ✅ CLINIC FACTS INJECTION
    // ============================================
    let clinicFacts = "";

    const doctorListReminder =
      "\n📌 REMINDER: When asked about today's doctors, you MUST list EVERY doctor working today (including evening shifts) from BUSINESS KNOWLEDGE. Do NOT omit any.";
    const contextMetadata = `[CONTEXT: Today=${getCurrentDateTime().split(",")[0]} | Time=${currentHour}:${currentMinutes.toString().padStart(2, "0")} | Clinic_Status=${isClinicOpen ? "OPEN" : "CLOSED"}]`;

    // Build the doctor list string once
    let doctorListStr = "";
    if (doctorsTodayList.length > 0) {
      doctorListStr =
        "\n\nHere is the EXACT list of doctors working today. You MUST use this list when answering questions about today's availability and do NOT omit any doctor:";
      doctorsTodayList.forEach((doc) => {
        doctorListStr += `\n- ${doc.name}: ${doc.timings}`;
      });
    }

    if (!isClinicOpen) {
      // --- CLOSED LOGIC ---
      let closedMsg = "IMPORTANT CONTEXT: The clinic is CURRENTLY CLOSED.";
      if (clinicHoursExist) {
        const openTime = `${openDisplayHour % 12 || 12}:${openDisplayMinute.toString().padStart(2, "0")} ${openDisplayAmPm?.toUpperCase() || "AM"}`;
        const closeTime = `${closeDisplayHour % 12 || 12}:${closeDisplayMinute.toString().padStart(2, "0")} ${closeDisplayAmPm?.toUpperCase() || "PM"}`;
        closedMsg += ` Today's hours were ${openTime} - ${closeTime}.`;
      }
      closedMsg += `\n\n[SUPREME RULE]: If the user asks about TOMORROW or any FUTURE day, do NOT say 'The clinic is closed.' Instead, immediately provide the FULL doctor list from BUSINESS KNOWLEDGE for that day.`;
      closedMsg += `\n\nRULES FOR TODAY ONLY:\n- If the user asks about TODAY's availability: Start with "Our clinic is currently closed."\n- For general info (parking, services, etc.): Answer normally.\n- If the user asks for a doctor that only works on Sundays (none): State the clinic is closed.`;
      clinicFacts =
        contextMetadata + doctorListReminder + "\n" + closedMsg + doctorListStr;
    } else {
      // --- OPEN LOGIC ---
      let openMsg = contextMetadata + doctorListReminder;
      if (history.length === 0) {
        const openTimeStr = clinicHoursExist
          ? `${openDisplayHour % 12 || 12}:${openDisplayMinute.toString().padStart(2, "0")} ${openDisplayAmPm?.toUpperCase()}`
          : "9:00 AM";
        const closeTimeStr = clinicHoursExist
          ? `${closeDisplayHour % 12 || 12}:${closeDisplayMinute.toString().padStart(2, "0")} ${closeDisplayAmPm?.toUpperCase()}`
          : "10:00 PM";
        openMsg += `\n✅ Clinic is CURRENTLY OPEN. Today's hours are ${openTimeStr} - ${closeTimeStr}.`;
      }
      clinicFacts = openMsg + doctorListStr;
    }
    console.log("📦 clinicFacts:", clinicFacts);

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
        throw new Error(qwenRes.error || "Qwen returned no reply");
      }
    } catch (error) {
      console.error("❌ Qwen failed:", error.message); // Now logs the actual error
      console.warn("⚠️ Falling back to Mistral...");
      try {
        const mistralRes = await chatWithMistral(prompt);
        if (mistralRes.status === "success" && mistralRes.reply) {
          aiReplyText = mistralRes.reply;
          console.log("✅ Mistral fallback successful");
        } else {
          throw new Error(mistralRes.error || "Mistral returned no reply");
        }
      } catch (e) {
        console.error("❌ Mistral also failed:", e.message);
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
      aiReplyText = aiReplyText.replace(/Would you like to book (a time|a slot|it)\?/gi,"",);
      aiReplyText = aiReplyText.replace(/Should I book it\?/gi, "");
      aiReplyText = aiReplyText.replace(/Want me to check availability\?/gi,"",);
      aiReplyText = aiReplyText.replace(/^(Hey!|Hi!) How else can I help you.*?\?/i,"How can I help you today?",);
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

      // 14. DYNAMIC LINK CONVERSION (Markdown [Text](URL) -> HTML) with URL filtering
      aiReplyText = aiReplyText.replace(
        /\[(.*?)\]\((.*?)\)/g,
        (match, text, url) => {
          // Only allow http, https, or tel links
          if (
            url.startsWith("http://") ||
            url.startsWith("https://") ||
            url.startsWith("tel:")
          ) {
            return `<a href="${url}" class="phone-link" target="_blank">${text}</a>`;
          }
          // If it's something else, just return the text without a link
          return text;
        },
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

    // Update last activity time
    session.lastActivity = new Date();
    await session.save();

    res.json({ reply: aiReplyText, sessionId: session.sessionId });
  } catch (error) {
    console.error("Critical Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;