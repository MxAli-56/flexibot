const currentScript = document.currentScript;
const clientId = currentScript.getAttribute("data-client-id");

// FlexiBot CSS (embed-safe, scoped, injected via JS)
const flexibotStyles = `
/* Bubble button */
.flexibot-bubble {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: #007bff;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  z-index: 9999;
  font-size: 24px;
}

/* Chat window */
.flexibot-window {
  position: fixed;
  bottom: 90px;
  right: 20px;
  width: 350px;
  height: 450px;
  background: #2c2c2ce2;
  border: 1px solid #333;
  display: none;
  flex-direction: column;
  box-shadow: 0 2px 10px rgba(0,0,0,0.3);
  z-index: 9999;
}

/* Header */
.flexibot-header {
  display: flex;
  justify-content: space-between; 
  align-items: center;
  padding: 10px;
  background: #4c0f77;
  color: white;
  font-weight: bold;
  font-size: 20px;
}

.theme-toggle {
  cursor: pointer;
  font-size: 22px;
  user-select: none;
}

/* Messages container */
#flexibot-messages {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  align-items: flex-start;
  box-sizing: border-box;
}

/* Input area */
.flexibot-input {
  display: flex;
  border-top: 1px solid #444;
  background: #1e1e1e;
}

.flexibot-input input {
  flex: 1;
  padding: 8px;
  border: none;
  outline: none;
  background: #2c2c2c;
  color: white;
}

.flexibot-input button {
  padding: 8px 12px;
  border: none;
  background: #4c0f77;
  color: white;
  cursor: pointer;
}

/* Base bubble style */
.message-bubble {
  display: inline-block;
  padding: 10px 14px;
  border-radius: 14px;
  max-width: 75%;
  word-wrap: break-word;
  white-space: pre-wrap;
  line-height: 1.3;
}

/* User bubble (blue, right) */
.user-bubble {
  background-color: #0d6efd;
  color: #fff;
  align-self: flex-end;
  border-bottom-right-radius: 6px;
}

/* Bot bubble (gray, left) */
.bot-bubble {
  background-color: #e9ecef;
  color: #111;
  align-self: flex-start;
  border-bottom-left-radius: 6px;
  padding: 6px 10px;
  margin: 2px 0;
  line-height: 1.3;
  white-space: normal;
}

/* Typing bubble */
.typing-bubble {
  display: inline-block;
  padding: 8px 12px;
  border-radius: 12px;
  background: #e9ecef;
  color: #666;
  align-self: flex-start;
  min-width: 56px;
  text-align: center;
}

/* Typing dots animation */
.typing-dots {
  display: inline-block;
  width: 40px;
  height: 10px;
}
.typing-dots span {
  display: inline-block;
  width: 6px;
  height: 6px;
  margin: 0 2px;
  background: currentColor;
  border-radius: 50%;
  opacity: 0.3;
  animation: typing-dot 1s infinite;
}
.typing-dots span:nth-child(1) { animation-delay: 0s; }
.typing-dots span:nth-child(2) { animation-delay: 0.15s; }
.typing-dots span:nth-child(3) { animation-delay: 0.3s; }

@keyframes typing-dot {
  0% { opacity: 0.25; transform: translateY(0); }
  50% { opacity: 1; transform: translateY(-4px); }
  100% { opacity: 0.25; transform: translateY(0); }
}
`;

// Inject styles into page
const styleEl = document.createElement("style");
styleEl.textContent = flexibotStyles;
document.head.appendChild(styleEl);

// Step 4.2 → Inject floating chat button
const chatButton = document.createElement("div");
chatButton.className = "flexibot-bubble";
chatButton.innerHTML = "💬"; // later replace with SVG/logo if needed
document.body.appendChild(chatButton);

// 2. Create chat window
const chatWindow = document.createElement("div");
chatWindow.className = "flexibot-window";

// Chat window inner HTML
chatWindow.innerHTML = `
  <div class="flexibot-header">
    FlexiBot
    <span class="theme-toggle">🌙</span>
  </div>
  <div id="flexibot-messages"></div>
  <div class="flexibot-input">
    <input type="text" id="flexibot-input" placeholder="Enter your query..." />
    <button id="flexibot-send">Send</button>
  </div>
`;

// Add popup to page
document.body.appendChild(chatWindow);

// Grab the injected UI elements
const Messages = document.getElementById("flexibot-messages");
const Input = document.getElementById("flexibot-input");
const Send = document.getElementById("flexibot-send");
const themeToggle = chatWindow.querySelector(".theme-toggle"); // inside header

// Toggle chat window
function openChat() {
  chatWindow.style.display = "flex";
  chatWindow.style.flexDirection = "column";
  setTimeout(() => { try { Input.focus(); } catch(e) {} }, 50);
  Messages.scrollTop = Messages.scrollHeight;
}
function closeChat() {
  chatWindow.style.display = "none";
}
function toggleChat() {
  if (!chatWindow.style.display || chatWindow.style.display === "none") {
    openChat();
  } else {
    closeChat();
  }
}

// Connect floating button to toggle
chatButton.addEventListener("click", toggleChat);

// Close chat on ESC key
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeChat(); });

// ✅ Session ID (same as flexibot.js)
let sessionId = localStorage.getItem("flexibotSessionId");
if (!sessionId) {
  sessionId = Date.now().toString() + "-" + Math.random().toString(36).substring(2,8);
  localStorage.setItem("flexibotSessionId", sessionId);
}

// Append message helper
function appendMessage(who, text) {
  const el = document.createElement("div");
  el.className = "message-bubble " + (who === "user" ? "user-bubble" : "bot-bubble");
  el.textContent = text;
  Messages.appendChild(el);
  Messages.scrollTop = Messages.scrollHeight;
}

// Typing indicator helper
function showTyping() {
  const t = document.createElement("div");
  t.className = "typing-bubble";
  t.innerHTML = `<span class="typing-dots"><span></span><span></span><span></span></span>`;
  Messages.appendChild(t);
  Messages.scrollTop = Messages.scrollHeight;
  return t;
}

async function sendMessage(networkRetries = 2) {
  const text = Input.value.trim();
  if (!text) return;

  // Show user message
  appendMessage("user", text);
  Input.value = "";

  // Show typing indicator
  const typingEl = showTyping();

  try {
    // ✅ Real backend call (update URL if needed)
    const res = await fetch("http://localhost:5000/api/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, sessionId, text }),
    });

    const data = await res.json();

    const botMsg = document.createElement("div");
    botMsg.className = "message-bubble bot-bubble";

    if (!res.ok || data.status === "error") {
      botMsg.textContent =
        data.reply || "⚠️ Sorry, I couldn't process your message. Please try again.";
    } else {
      // sanitize any HTML returned from backend
      botMsg.innerHTML = DOMPurify.sanitize(marked.parse(data.reply));
    }

    typingEl.replaceWith(botMsg);
    Messages.scrollTop = Messages.scrollHeight;

  } catch (err) {
    console.error("Frontend fetch error:", err.message);

    // Retry network errors
    if (networkRetries > 0) {
      const attempt = 3 - networkRetries + 1;
      console.warn(`⚠️ Network error, retrying... (Attempt ${attempt})`);
      typingEl.textContent = `Retrying... (${attempt}/3)`;

      setTimeout(() => {
        sendMessage(networkRetries - 1);
      }, 2000); // wait 2s before retry
      return;
    }

    // Final fallback
    const fallback = document.createElement("div");
    fallback.className = "message-bubble bot-bubble";
    fallback.textContent =
      "⚠️ I’m having trouble connecting. Please check your internet or try again later.";
    typingEl.replaceWith(fallback);
    Messages.scrollTop = Messages.scrollHeight;
  }
}

// Send on button click
Send.addEventListener("click", sendMessage);

// Send on Enter key (Shift+Enter = newline)
Input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    Send.click();
  }
});

themeToggle.addEventListener("click", () => {
  document.body.classList.toggle("light-mode");
  themeToggle.textContent = document.body.classList.contains("light-mode")
    ? "🌞"
    : "🌙";
});