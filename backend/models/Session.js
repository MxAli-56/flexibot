// backend/models/Session.js
const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  clientId: { type: String, required: true }, // e.g. restaurant123
  messages: { type: Array, default: [] },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Session", sessionSchema);