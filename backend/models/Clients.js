const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

// Define the Client schema
const clientSchema = new mongoose.Schema(
  {
    clientId: {type: String, default: uuidv4, unique: true},
    name: {type: String, required: true},
    websiteURL: {type: String,required: true},
  },
  { timestamps: true }
);

// Create the model
const Client = mongoose.model("Client", clientSchema);

module.exports = Client;