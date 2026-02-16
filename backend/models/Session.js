// backend/models/Session.js
const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  clientId: { type: String, required: true },
  leadCaptured: { type: Boolean, default: false },
  leadState: { type: String, default: null }, // 'awaiting_name', 'awaiting_phone', 'awaiting_issue', 'awaiting_doctor'
  tempLead: {
    name: { type: String, default: "" },
    phone: { type: String, default: "" },
    issue: { type: String, default: "" },
    doctor: { type: String, default: "" },
  },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Session", sessionSchema);