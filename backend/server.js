const express = require("express");
const cors = require("cors");
const { randomUUID } = require("crypto");
const Session = require("./models/Session");
const Message = require("./models/Message");
require("dotenv").config();

const connectDB = require("./db");
const { chatWithGemini } = require("./providers/gemini");

const PORT = process.env.PORT || 5000;
const app = express();

connectDB()

app.use(cors())
app.use(express.json())

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
app.post('/api/session', async (req, res) => {
  try {
    const { clientId } = req.body; // e.g. "restaurant123"
    const session = await getOrCreateSession({ sessionId: null, clientId });
    res.json({ sessionId: session.sessionId });
  } catch (err) {
    console.error('Error creating session:', err);
    res.status(500).json({ error: 'Could not create session' });
  }
});

app.post("/api/message", async (req, res) => {
  try {
    const { sessionId, text } = req.body;

    if (!sessionId || !text) {
      return res.status(400).json({ error: "sessionId and text are required" });
    }

    // Find the session in DB
    const session = await Session.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // Save user's message
    session.messages.push({
      sender: "user",
      text,
    });

    // Generate bot reply
    const reply = await chatWithGemini(text);

    // Save bot's reply
    session.messages.push({
      sender: "bot",
      text: reply,
    });

    await session.save();

    // Send reply back to client
    res.json({ reply });
  } catch (error) {
    console.error("Error saving message:", error);
    res.status(500).json({ error: "Could not save message" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});