// utils/crawler.js
const axios = require("axios");
const cheerio = require("cheerio");
const { URL } = require("url");

async function crawlWebsite(startUrl, maxDepth = 3) {
  const visited = new Set();
  const baseUrl = new URL(startUrl).origin;
  let fullText = "";

  async function crawl(url, depth) {
    if (depth > maxDepth || visited.has(url)) return;
    visited.add(url);

    try {
      const { data } = await axios.get(url, {
        headers: { "User-Agent": "Mozilla/5.0 (FlexiBotCrawler/1.0)" },
        timeout: 15000,
      });

      const $ = cheerio.load(data);

      // Extract visible text (skip scripts, styles, navs, footers, etc.)
      const text = $("body")
        .find("*")
        .contents()
        .filter(function () {
          return (
            this.type === "text" &&
            $(this)
              .parent()
              .is(
                ":not(script):not(style):not(noscript):not(footer):not(nav):not(header)"
              )
          );
        })
        .map((_, el) => $(el).text().trim())
        .get()
        .join(" ")
        .replace(/\s+/g, " ");

      fullText += `\n\n[${url}]\n${text}\n`;

      // Find and normalize internal links
      const links = $("a[href]")
        .map((_, el) => $(el).attr("href"))
        .get()
        .filter(
          (href) =>
            href &&
            !href.startsWith("#") &&
            !href.startsWith("mailto:") &&
            !href.startsWith("tel:") &&
            (href.startsWith(baseUrl) ||
              (href.startsWith("/") && !href.startsWith("//")))
        )
        .map((href) =>
          href.startsWith("http")
            ? href
            : baseUrl + (href.startsWith("/") ? href : "/" + href)
        );

      // Crawl internal links recursively
      for (const link of links) {
        await crawl(link, depth + 1);
      }
    } catch (err) {
      console.error(`❌ Failed to crawl ${url}:`, err.message);
    }
  }

  await crawl(startUrl, 1);
  return fullText.trim();
}

module.exports = { crawlWebsite };