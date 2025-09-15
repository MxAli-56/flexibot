// backend/models/Message.js
const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  sender: { type: String, enum: ["user", "bot"], required: true},
  text: {type: String, required: true},
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Message", MessageSchema);
