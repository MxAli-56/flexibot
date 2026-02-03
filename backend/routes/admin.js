const express = require("express");
const router = express.Router();
const Client = require("../models/Client");
const { v4: uuidv4 } = require("uuid");

// Add a new client
router.post("/addClient", async (req, res) => {
  try {
    const { name, websiteURL, siteContext, systemPrompt } = req.body;

    if (!name || !websiteURL) {
      return res
        .status(400)
        .json({ error: "Name and websiteURL are required" });
    }

    // Generate clientId
    const clientId = uuidv4();
    const domain = `${req.protocol}://${req.get("host")}`;

    // Create embed script
    const embedCode = `<script src="${domain}/embed.js?v=${Date.now()}" data-client-id="${clientId}"></script>`;

    // Create new client document with all fields
    const newClient = new Client({
      name,
      websiteURL,
      clientId,
      embedCode,
      siteContext: siteContext || "",
      systemPrompt: systemPrompt || "",
    });

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

// Fetch client details by clientId (For Frontend/Widget)
router.get("/client-config/:clientId", async (req, res) => {
  try {
    const { clientId } = req.params;
    const client = await Client.findOne({ clientId });

    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }

    res.json({
      clientId: client.clientId,
      botName: client.botName || "FlexiBot",
      theme: client.theme || "",
      websiteURL: client.websiteURL || "",
    });
  } catch (err) {
    console.error("Error in /admin/config/:clientId", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;