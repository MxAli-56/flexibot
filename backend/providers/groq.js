// backend/providers/groq.js
const Groq = require("groq-sdk");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function chatWithGroq(message, retries = 3, attempt = 1) {
  try {
    const controller = new AbortController();

    // ⏳ Timeout logic (20 sec max wait)
    const timeout = setTimeout(() => controller.abort(), 20000);

    const completion = await groq.chat.completions.create(
      {
        model: "llama-3.1-8b-instant", // Fast & reliable model
        messages: [
          {
            role: "system",
            content:
              "You are FlexiBot, a helpful AI assistant that responds clearly and conversationally.",
          },
          {
            role: "user",
            content: message,
          },
        ],
      },
      { signal: controller.signal }
    );

    clearTimeout(timeout);

    return {
      reply:
        completion.choices[0]?.message?.content || "No response from Groq.",
      attempt,
      status: "success",
    };
  } catch (error) {
    console.error(`Groq API error (attempt ${attempt}):`, error.message);

    // Retry if overloaded / timeout
    if (
      retries > 0 &&
      (error.message.includes("503") ||
        error.message.includes("overloaded") ||
        error.message.includes("Timeout") ||
        error.name === "AbortError")
    ) {
      const wait = Math.pow(2, attempt) * 1000; // exponential backoff: 2s → 4s → 8s
      console.warn(
        `⚠️ Retrying in ${wait / 1000}s... (attempt ${attempt + 1})`
      );
      await new Promise((res) => setTimeout(res, wait));

      return chatWithGroq(message, retries - 1, attempt + 1);
    }

    // API key issue
    if (
      error.message.includes("401") ||
      error.message.includes("invalid API key") ||
      error.message.includes("authentication")
    ) {
      return {
        reply: "❌ Groq API key issue. Please check your key.",
        attempt,
        status: "error",
      };
    }

    // Generic fallback
    return {
      reply: "⚠️ Groq is not available right now. Please try again later.",
      attempt,
      status: "error",
    };
  }
}

module.exports = { chatWithGroq };