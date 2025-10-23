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
    const { clientId } = req.body;

    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    // Crawl the website
    const siteContext = await crawlWebsite(client.websiteURL);

    // Save new content
    client.siteContext = siteContext;
    client.lastCrawled = new Date();
    await client.save();

    // 🧠 Auto-update system prompt for this client
    const basePrompt = `
You are FlexiBot — a friendly, respectful, and professional AI assistant designed to help website visitors.
Respond naturally, clearly, and according to the question (no extra or less details).
If the user asks general questions, reply helpfully.
If the user greets you, greet them back and reply politely.
If the user asks inappropriate questions, tell them no politely.
If the user repeats a question, answer politely and naturally, without unnecessary disclaimers. Keep the conversation flowing.
Always format multi-paragraph answers with clear line breaks between headings, paragraphs, and bullet points.
When providing lists, use proper bullets (- or •) with a new line for each item.
Use headings for main sections, subheadings for subsections if needed.
Keep spacing consistent so the text is readable for website visitors.
`;

    const updatedPrompt = `
${basePrompt}

Website Context (use it to make answers site-specific):
${siteContext ? siteContext.slice(0, 3000) : "No website data available."}
`;

    // Update in DB
    client.systemPrompt = updatedPrompt;
    await client.save();

    res.status(200).json({
      message: "Website crawled and system prompt updated successfully.",
      siteContextPreview: siteContext.slice(0, 500) + "...",
    });
  } catch (error) {
    console.error("Error crawling site:", error);
    res.status(500).json({ message: "Error crawling site", error });
  }
});

module.exports = router;