const express = require("express");
const cors = require("cors");
const { randomUUID } = require("crypto");
const Session = require("./models/Session");
const Message = require("./models/Message");
const adminRoutes = require("./routes/admin");
require("dotenv").config();

const connectDB = require("./db");
const { chatWithGemini } = require("./providers/gemini");

const PORT = process.env.PORT || 5000;
const app = express();

connectDB()

app.use(cors())
app.use(express.json())
app.use("/admin", adminRoutes);

// Helper to fetch the last N messages for a session
async function fetchConversation(sessionId, limit = 12) {
  const docs = await Message.find({ sessionId })
    .sort({ createdAt: -1 }) // newest first
    .limit(limit)
    .lean();

  // reverse to oldest → newest
  return docs.reverse().map(d => ({
    role: d.sender === 'user' ? 'user' : 'assistant',
    content: d.text
  }));
}

// Helper to get or create a session
async function getOrCreateSession({ sessionId, clientId }) {
  if (sessionId) {
    // try to find an existing session by its ID
    const s = await Session.findOne({ sessionId });
    if (s) return s; // if found, return it

    // if not found but sessionId was given, create new
    return Session.create({ sessionId, clientId });
  } else {
    // if no sessionId given, create new with random UUID
    const newId = randomUUID();
    return Session.create({ sessionId: newId, clientId });
  }
}

// Create a new session (called by widget on load)
app.post("/api/message", async (req, res) => {
  try {
    const { sessionId, text } = req.body;

    if (!sessionId || !text) {
      return res.status(400).json({ error: "sessionId and text are required" });
    }

    // 1️⃣ Find the session in DB
    let session = await Session.findOne({ sessionId });
    if (!session) {
      // If session doesn't exist, create it with a default clientId
      session = await Session.create({sessionId, clientId: "default", messages: []});
    }

    if (!Array.isArray(session.messages)) session.messages = [];

    // 2️⃣ Save user's new message
    session.messages.push({ sender: "user", text });

    // 3️⃣ Fetch last 12 messages as context for Gemini
    const lastMessages = session.messages.slice(-12); // last 12 messages
    let prompt = "";
    lastMessages.forEach((m) => {
      const role = m.sender === "user" ? "user" : "assistant";
      prompt += `${role}: ${m.text}\n`;
    });
    prompt += `user: ${text}\nassistant:`; // add current user message

    // 4️⃣ Get bot reply from Gemini
    const reply = await chatWithGemini(prompt);

    // 5️⃣ Save bot reply
    session.messages.push({ sender: "bot", text: reply });

    // 6️⃣ Save session
    await session.save();

    // 7️⃣ Send reply back to frontend
    res.json({ reply });
  } catch (error) {
    console.error("Error in /api/message:", error);
    res.status(500).json({ error: "Could not save message or generate reply" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});