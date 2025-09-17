const express = require("express");
const router = express.Router();
const Client = require("../models/Clients");

// Add a new client
router.post("/addClient", async (req, res) => {
  try {
    const { name, websiteURL } = req.body;
    if (!name || !websiteURL) {
      return res
        .status(400)
        .json({ error: "Name and websiteURL are required" });
    }

    const newClient = new Client({ name, websiteURL });
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