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

// Send message function
async function sendMessage() {
  const text = input.value.trim();
  if (!text) return;

  // Add user message
  const msg = document.createElement("div");
  msg.className = "user-bubble"; // ✅ style
  msg.textContent = text;
  messages.appendChild(msg);
  input.value = "";
  messages.scrollTop = messages.scrollHeight;

  // Show "typing..." indicator as a bubble
  const typing = document.createElement("div");
  typing.id = "typing";
  typing.className = "bot-bubble";
  typing.textContent = "FlexiAI is responding...";
  messages.appendChild(typing);
  messages.scrollTop = messages.scrollHeight;

  try {
    // Send message to backend with sessionId
    const res = await fetch("http://localhost:5000/api/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, text }),
    });

    const data = await res.json();
    if (data.reply) {
      setTimeout(() => {
        const botMsg = document.createElement("div");
        botMsg.className = "bot-bubble"; // ✅ style
        botMsg.innerHTML = DOMPurify.sanitize(
          marked.parse(data.reply)
        );
        typing.replaceWith(botMsg); // ✅ replaces typing bubble
        messages.scrollTop = messages.scrollHeight;
      }, 1000);
    }
  } catch (error) {
    console.error("Error: ", error.message);
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
  document.body.classList.toggle("dark-mode");
  themetoggle.textContent = document.body.classList.contains("dark-mode")
    ? "🌙"
    : "🌞";
});