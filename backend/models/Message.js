// backend/models/Message.js
const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema(
  {
    sessionId: {type: String, required: true, index: true},
    clientId: {type: String, required: true, default: "default"},
    role: {type: String, enum: ["user", "bot"], required: true},
    text: {type: String, required: true},
  },
  { timestamps: true } 
);

module.exports = mongoose.model("Message", MessageSchema);