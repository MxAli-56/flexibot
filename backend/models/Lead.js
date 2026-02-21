const mongoose = require("mongoose");

const LeadSchema = new mongoose.Schema({
  sessionId: { type: String, required: true },
  clientId: { type: String, required: true },
  name: { type: String, required: true },
  phone: { type: String, required: true },
  issue: { type: String, required: true },
  doctor: { type: String, default: "" },
  date: { type: String, default: "" },
  time: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Lead", LeadSchema);