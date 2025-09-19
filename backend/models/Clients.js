const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

// Define the Client schema
const clientSchema = new mongoose.Schema(
  {
    clientId: { type: String, default: uuidv4, unique: true },
    name: { type: String, required: true },
    websiteURL: { type: String, required: true },
    theme: {type: String, default: "style.css"},
    systemPrompt: {type: String, default: "You are FlexiBot, a helpful assistant."},
    embedCode: { type: String },
  },
  { timestamps: true }
);

// Create the model
const Client = mongoose.model("Client", clientSchema);

module.exports = Client;