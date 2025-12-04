// backend/providers/deepseek.js
const axios = require("axios");

async function chatWithDeepSeek(message, retries = 3, attempt = 1) {
  const controller = new AbortController();

  try {
    // ⏳ Timeout logic (20 sec)
    const timeout = setTimeout(() => controller.abort(), 20000);

    const response = await axios.post(
      "https://api.deepseek.com/chat/completions",
      {
        model: "deepseek-chat",
        messages: [{ role: "user", content: message }],
        temperature: 0.7,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        },
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);

    return {
      reply: response.data?.choices?.[0]?.message?.content || "",
      attempt,
      status: "success",
    };
  } catch (error) {
    console.error(`DeepSeek error (attempt ${attempt}):`, error.message);

    // Retry conditions → overloaded / timeout / abort
    if (
      retries > 0 &&
      (error.message.includes("503") ||
        error.message.includes("overloaded") ||
        error.message.includes("Timeout") ||
        error.name === "AbortError")
    ) {
      const wait = Math.pow(2, attempt) * 1000; // 2s → 4s → 8s
      console.warn(
        `⚠️ Retrying DeepSeek in ${wait / 1000}s... (attempt ${attempt + 1})`
      );

      await new Promise((res) => setTimeout(res, wait));

      return chatWithDeepSeek(message, retries - 1, attempt + 1);
    }

    // API key issues
    if (
      error.message.includes("401") ||
      error.message.includes("invalid API key") ||
      error.message.includes("authentication")
    ) {
      return {
        reply: "❌ DeepSeek API key issue. Please check your key.",
        attempt,
        status: "error",
      };
    }

    // Generic fallback
    return {
      reply: "⚠️ DeepSeek is not available right now. Please try again later.",
      attempt,
      status: "error",
    };
  }
}

module.exports = { chatWithDeepSeek };