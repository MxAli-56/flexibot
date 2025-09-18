const express = require("express");
const cors = require("cors");
const { randomUUID } = require("crypto");
const Session = require("./models/Session");
const Message = require("./models/Message"); // ✅ Import messages model
const adminRoutes = require("./routes/admin");
require("dotenv").config();

const connectDB = require("./db");
const { chatWithGemini } = require("./providers/gemini");

const PORT = process.env.PORT || 5000;
const app = express();

connectDB();

app.use(cors());
app.use(express.json());
app.use("/admin", adminRoutes);

// 🔹 Helper to fetch the last N messages for a session from Message collection
async function fetchConversation(sessionId, limit = 12) {
  const docs = await Message.find({ sessionId })
    .sort({ createdAt: -1 }) // newest first
    .limit(limit)
    .lean();

  // reverse → oldest first
  return docs.reverse().map((d) => ({
    role: d.role, // user | bot (we changed this in schema)
    content: d.text,
  }));
}

// 🔹 Helper to get or create a session
async function getOrCreateSession({ sessionId, clientId }) {
  if (sessionId) {
    const s = await Session.findOne({ sessionId });
    if (s) return s; // found existing session
    return Session.create({ sessionId, clientId });
  } else {
    const newId = randomUUID();
    return Session.create({ sessionId: newId, clientId });
  }
}

// 🔹 Handle incoming chat messages
app.post("/api/message", async (req, res) => {
  try {
    const { sessionId, text } = req.body;

    if (!sessionId || !text) {
      return res.status(400).json({ error: "sessionId and text are required" });
    }

    // 1️⃣ Ensure session exists
    let session = await Session.findOne({ sessionId });
    if (!session) {
      session = await Session.create({
        sessionId,
        clientId: "default", // default for now
        messages: [],
      });
    }

    if (!Array.isArray(session.messages)) session.messages = [];

    // 2️⃣ Save user's message inside Session + Message collection
    session.messages.push({ sender: "user", text });
    await Message.create({
      sessionId,
      clientId: session.clientId,
      role: "user",
      text,
    });

    // 3️⃣ Fetch last 12 messages from Message collection as context
    const conversation = await fetchConversation(sessionId, 12);

    // Build prompt for Gemini
    let prompt = "";
    conversation.forEach((m) => {
      prompt += `${m.role}: ${m.content}\n`;
    });
    prompt += `user: ${text}\nassistant:`; // current user input

    // 4️⃣ Get bot reply from Gemini
    const reply = await chatWithGemini(prompt);

    // 5️⃣ Save bot reply inside Session + Message collection
    session.messages.push({ sender: "bot", text: reply });
    await Message.create({
      sessionId,
      clientId: session.clientId,
      role: "bot",
      text: reply,
    });

    // 6️⃣ Save session changes
    await session.save();

    // 7️⃣ Send bot reply back to frontend
    res.json({ reply });
  } catch (error) {
    console.error("Error in /api/message:", error);
    res.status(500).json({ error: "Could not save message or generate reply" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
