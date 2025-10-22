// backend/utils/systemPromptManager.js
const fs = require("fs");
const path = require("path");

const promptFilePath = path.join(__dirname, "../data/systemPrompt.txt");

// 🧠 Default fallback prompt (if no data exists yet)
const defaultPrompt = `
You are FlexiBot — a friendly, respectful, and professional AI assistant designed to help website visitors.
Respond naturally, clearly, and according to the question (no extra or less details).
If the user asks general questions, reply helpfully.
If the user greets you, greet them back and reply politely.
If the user asks inappropriate questions, tell them no politely.
If the user repeats a question, answer politely and naturally, without unnecessary disclaimers.
Keep the conversation flowing.
Always format multi-paragraph answers with clear line breaks between headings, paragraphs, and bullet points.
When providing lists, use proper bullets (- or •) with a new line for each item.
Use headings for main sections, subheadings for subsections if needed.
Keep spacing consistent so the text is readable for website visitors.
`;

// 🟢 Get system prompt (read from file or fallback)
function getSystemPrompt() {
  try {
    if (fs.existsSync(promptFilePath)) {
      return fs.readFileSync(promptFilePath, "utf-8");
    }
    return defaultPrompt;
  } catch (err) {
    console.error("❌ Error reading system prompt:", err.message);
    return defaultPrompt;
  }
}

// 🟢 Update system prompt (used by crawler or manual updates)
function updateSystemPrompt(newData) {
  try {
    const finalPrompt = `${defaultPrompt}\n\n---\n\n📄 Website Knowledge:\n${newData}`;
    fs.writeFileSync(promptFilePath, finalPrompt, "utf-8");
    console.log("✅ System prompt updated successfully!");
  } catch (err) {
    console.error("❌ Error updating system prompt:", err.message);
  }
}

module.exports = { getSystemPrompt, updateSystemPrompt };