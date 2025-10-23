// backend/cron/crawlerCron.js
const cron = require("node-cron");
const { crawlWebsite } = require("../utils/crawler");
const { mergeSystemPrompt } = require("../utils/systemPromptManager");
const Client = require("../models/Clients");

// Runs every 24 hours (you can test with "*/5 * * * *" = every 5 mins)
cron.schedule("0 0 * * *", async () => {
  console.log("🔁 Starting daily crawl and system prompt update...");

  try {
    const clients = await Client.find();

    for (const client of clients) {
      if (!client.website) continue;

      console.log(`🌐 Crawling ${client.website}...`);
      const siteContext = await crawlWebsite(client.website, 2);

      // Merge base system prompt + site context
      const updatedPrompt = mergeSystemPrompt(siteContext);

      // Update client in DB
      client.systemPrompt = updatedPrompt;
      await client.save();

      console.log(`✅ Updated system prompt for ${client.name}`);
    }

    console.log("🎯 All client system prompts refreshed successfully!");
  } catch (err) {
    console.error("❌ Error running crawler cron:", err);
  }
});