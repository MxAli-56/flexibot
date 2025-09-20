const express = require("express");
const router = express.Router();
const Client = require("../models/Clients");
const { v4: uuidv4 } = require("uuid");


// Add a new client
router.post("/addClient", async (req, res) => {
  try {
    const { name, websiteURL } = req.body;
    if (!name || !websiteURL) {
      return res
        .status(400)
        .json({ error: "Name and websiteURL are required" });
    }

    // Generate clientId
    const clientId = uuidv4();

    const domain = `${req.protocol}://${req.get("host")}`;

    // Create embed script
    const embedCode = `<script src="${domain}/embed.js" data-client-id="${clientId}"></script>`;

    const newClient = new Client({ name, websiteURL, clientId, embedCode });
    await newClient.save();

    res.json({
      message: "Client added successfully",
      client: newClient,
    });
  } catch (err) {
    console.error("Error adding client:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get all clients
router.get("/clients", async (req, res) => {
  try {
    const clients = await Client.find().sort({ createdAt: -1 });
    res.json(clients);
  } catch (err) {
    console.error("Error fetching clients:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;