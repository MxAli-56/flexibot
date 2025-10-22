const express = require("express");
const router = express.Router();
const Client = require("../models/Clients");
const { v4: uuidv4 } = require("uuid");
const version = Date.now();
const { crawlWebsite } = require("../utils/crawler");

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
      const embedCode = `<script src="${domain}/embed.js?v=${Date.now()}" data-client-id="${clientId}"></script>`;

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

// Fetch client details by clientId
router.get("/config/:clientId", async (req, res) => {
  try {
    const { clientId } = req.params;
    const client = await Client.findOne({ clientId });

    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }

    // Send only the fields frontend needs (safe)
    res.json({
      clientId: client.clientId,
      botName: client.botName || "FlexiBot",
      theme: client.theme || "", // e.g. "/themes/restaurant.css"
      websiteURL: client.websiteURL || "",
    });
  } catch (err) {
    console.error("Error in /admin/config/:clientId", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/admin/crawl-site
router.post("/crawl-site", async (req, res) => {
  try {
    const { clientId } = req.body; // get which client to crawl

    const client = await Client.findOne({ clientId });
    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    // Crawl the website and get content
    const siteContext = await crawlWebsite(client.websiteURL);

    // Update DB with new content
    client.siteContext = siteContext;
    client.lastCrawled = new Date();
    await client.save();

    res.status(200).json({
      message: "Website crawled and context saved successfully.",
      siteContext: siteContext.slice(0, 500) + "..." // just preview
    });

  } catch (error) {
    console.error("Error crawling site:", error);
    res.status(500).json({ message: "Error crawling site", error });
  }
});

module.exports = router;