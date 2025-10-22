// backend/cron/crawlercron.js

const cron = require("node-cron");
const Client = require("../models/Clients");
const { crawlWebsite } = require("../utils/crawler");

// 🕐 Schedule: run every 24 hours at 2:00 AM
// Format: "0 2 * * *" = minute 0, hour 2, every day
cron.schedule("0 2 * * *", async () => {
  console.log("🕐 Daily crawl job started:", new Date().toISOString());

  try {
    const clients = await Client.find();
    for (const client of clients) {
      console.log(`🌐 Crawling ${client.websiteURL}...`);
      const siteContext = await crawlWebsite(client.websiteURL);
      client.siteContext = siteContext;
      client.lastCrawled = new Date();
      await client.save();
      console.log(`✅ Updated ${client.name}`);
    }
    console.log("🎯 Daily crawl job finished successfully.");
  } catch (err) {
    console.error("❌ Error during daily crawl job:", err);
  }
});