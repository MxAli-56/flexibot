const bubble = document.querySelector(".flexibot-bubble");
const chatWindow = document.querySelector(".flexibot-window");
const messages = document.querySelector("#flexibot-messages");
const input = document.querySelector("#flexibot-input");
const sendBtn = document.querySelector("#flexibot-send");
const themetoggle = document.querySelector("#theme-toggle");

// Toggle window
bubble.addEventListener("click", () => {
  chatWindow.style.display =
    chatWindow.style.display === "flex" ? "none" : "flex";
  chatWindow.style.flexDirection = "column";
});

// ✅ Generate or get sessionId from localStorage
let sessionId = localStorage.getItem("flexibotSessionId");
if (!sessionId) {
  sessionId =
    Date.now().toString() + "-" + Math.random().toString(36).substring(2, 8);
  localStorage.setItem("flexibotSessionId", sessionId);
}

// Send message function with retry for temporary failures
async function sendMessage(retries = 2) {
  const text = input.value.trim();
  if (!text) return;

  // Display user message
  const userMsg = document.createElement("div");
  userMsg.className = "message-bubble user-bubble";
  userMsg.textContent = text;
  messages.appendChild(userMsg);
  input.value = "";
  messages.scrollTop = messages.scrollHeight;

  // Show typing indicator
  const typing = document.createElement("div");
  typing.id = "typing";
  typing.className = "message-bubble typing-bubble";
  typing.innerHTML =
    '<span class="typing-dots"><span></span><span></span><span></span></span>';
  messages.appendChild(typing);

  try {
    const res = await fetch("http://localhost:5000/api/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, text }),
    });

    const data = await res.json();

    const botMsg = document.createElement("div");
    botMsg.className = "message-bubble bot-bubble";

    if (!res.ok || data.error) {
      botMsg.textContent =
        data.error ||
        "⚠️ Sorry, I couldn't process your message. Please try again.";
    } else {
      botMsg.innerHTML = DOMPurify.sanitize(marked.parse(data.reply));
    }

    typing.replaceWith(botMsg);
    messages.scrollTop = messages.scrollHeight;
  } catch (err) {
    console.error("Frontend fetch error:", err.message);

    // Retry once if temporary network/server issue
    if (retries > 0) {
      console.warn(`⚠️ Retry sending message... (${3 - retries} attempt)`);
      typing.remove();
      return sendMessage(retries - 1);
    }

    // Final fallback message
    const fallback = document.createElement("div");
    fallback.className = "message-bubble bot-bubble";
    fallback.textContent =
      "⚠️ I’m having trouble connecting. Please check your internet or try again later.";
    typing.replaceWith(fallback);
    messages.scrollTop = messages.scrollHeight;
  }
}

// Send on button click
sendBtn.addEventListener("click", sendMessage);

// Send on Enter (Shift+Enter = new line)
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Theme toggle
themetoggle.addEventListener("click", () => {
  document.body.classList.toggle("light-mode");
  themetoggle.textContent = document.body.classList.contains("light-mode")
    ? "🌞"
    : "🌙";
});