let clientConfig = {
  botName: "FlexiBot",
  theme: "", // default = no extra theme
};

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
  z-index: 2147483647;
  font-size: 24px;
}

/* Chat window */
.flexibot-window {
  position: fixed;
  bottom: 90px;
  right: 20px;
  width: 350px;
  height: 450px;
  background: rgba(44,44,44,0.98);
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
  padding: 10px 6px 0px 5px;
  margin: 4px 0;
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.bot-bubble ul, .bot-bubble ol {
  padding-left: 20px;  /* indent bullets and numbers */
}

.bot-bubble li {
  margin-bottom: 4px;  /* spacing between list items */
}

.bot-bubble h1, .bot-bubble h2, .bot-bubble h3,
.bot-bubble h4, .bot-bubble h5, .bot-bubble h6 {
  margin: 8px 0 4px 0;  /* spacing for headings */
}

.bot-bubble strong, .bot-bubble b {
  font-weight: bold;    /* ensure bold works */
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

/* Light mode (chat window only) */
.flexibot-window.light-mode {
  background: #f8f8f8;
  color: black;
}

.flexibot-window.light-mode .flexibot-header {
  background: #007bff;
  color: white;
}

.flexibot-window.light-mode .flexibot-input {
  background: white;
  border-top: 1px solid #ccc;
}

.flexibot-window.light-mode .flexibot-input input {
  background: white;
  color: black;
}

.flexibot-window.light-mode .flexibot-input button {
  background: #007bff;
  color: white;
}

/* ---------------- DESKTOP (default) ---------------- */
.flexibot-bubble {
  width: 60px;
  height: 60px;
  font-size: 24px;
  bottom: 20px;
  right: 20px;
}

.flexibot-window {
  width: 350px;
  height: 450px;
  bottom: 90px;
  right: 20px;
}

#flexibot-messages {
  padding: 12px;
  gap: 8px;
}

.flexibot-input input,
.flexibot-input button {
  font-size: 16px;
  padding: 8px 12px;
}

/* ---------------- TABLET (max-width: 768px) ---------------- */
@media (max-width: 768px) {
  .flexibot-bubble {
    width: 50px;
    height: 50px;
    font-size: 20px;
    bottom: 15px;
    right: 15px;
  }

  .flexibot-window {
    width: 300px;
    height: 400px;
    bottom: 70px;
    right: 15px;
  }

  #flexibot-messages {
    padding: 10px;
    gap: 6px;
  }

  .flexibot-input input,
  .flexibot-input button {
    font-size: 14px;
    padding: 6px 8px;
  }

  .typing-bubble {
    min-width: 50px;
    padding: 6px 10px;
  }

  .user-bubble,
  .bot-bubble {
    padding: 8px 12px;
  }
}

/* ---------------- MOBILE (max-width: 480px) ---------------- */
@media (max-width: 480px) {
  .flexibot-bubble {
    width: 40px;
    height: 40px;
    font-size: 18px;
    bottom: 10px;
    right: 10px;
  }

  .flexibot-window {
    width: 90%;
    max-width: 320px;
    height: 55%;
    max-height: 400px;
    bottom: 70px;
    right: 5%;
  }

  #flexibot-messages {
    padding: 8px;
    gap: 5px;
  }

  .flexibot-input input,
  .flexibot-input button {
    font-size: 13px;
    padding: 5px 6px;
  }

  .typing-bubble {
    min-width: 45px;
    padding: 5px 8px;
  }

  .user-bubble,
  .bot-bubble {
    padding: 6px 10px;
  }

  .flexibot-header {
    font-size: 16px; /* prevent overflow on tiny screens */
  }
}

/* ✅ Fix overflow & positioning */
.flexibot-bubble,
.flexibot-window {
  position: fixed;
  max-width: 100vw;
  max-height: 100vh;
  box-sizing: border-box;
}

@media (max-width: 480px) {
  .flexibot-window {
    width: 90%;
    height: 60vh;       
    bottom: 60px;
    left: 50%;          
    right: auto;
    transform: translateX(-50%);
    max-width: none; /* remove limit so it adapts */
  }
}
`;

const currentScript = document.currentScript;
const clientId = currentScript.getAttribute("data-client-id");

// ------------------- fetch client config -------------------
async function loadClientConfig() {
  try {
    // 🔹 Inject base CSS early + hide widgets
    const baseStyle = document.createElement("style");
    baseStyle.textContent =
      flexibotStyles +
      `
      .flexibot-window, .flexibot-bubble {
        opacity: 0;
        transition: opacity 0.2s ease-in;
      }
    `;
    document.head.appendChild(baseStyle);

    // 🔹 Fetch config
    const res = await fetch(
      `https://flexibot-backend.onrender.com/admin/config/${clientId}?_=${Date.now()}`,
      { cache: "no-store" }
    );
    if (!res.ok) throw new Error("Config not found");
    const json = await res.json();
    clientConfig = json;

    // 🔹 Load client theme instantly after config
    if (clientConfig.theme && clientConfig.theme.trim()) {
      try {
        const themeHref = clientConfig.theme;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = themeHref.startsWith("http")
          ? themeHref
          : `https://flexibot-frontend.vercel.app${themeHref}`;
        document.head.appendChild(link);
      } catch (e) {
        console.warn("FlexiBot: failed to apply theme", e.message);
      }
    }
  } catch (err) {
    console.warn("FlexiBot: could not load client config:", err.message);
  }
}

// 2️⃣ Load external libraries dynamically
async function loadLibs() {
  await loadScript(
    "https://cdn.jsdelivr.net/npm/dompurify@3.1.7/dist/purify.min.js"
  );
  await loadScript("https://cdn.jsdelivr.net/npm/marked/marked.min.js");
}

function loadScript(src) {
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    document.head.appendChild(s);
  });
}

// ------------------- Main DOMContentLoaded -------------------
window.addEventListener("DOMContentLoaded", async () => {

  // 1️⃣ Load external libraries first
  await loadLibs();

  // 2️⃣ Fetch client config
  await loadClientConfig();
  initChatUI();


function initChatUI() {
  // Step 1 → Inject chat UI
  const chatButton = document.createElement("div");
  chatButton.className = "flexibot-bubble";
  chatButton.innerHTML = "💬";
  document.body.appendChild(chatButton);

  const chatWindow = document.createElement("div");
  chatWindow.className = "flexibot-window";
  chatWindow.innerHTML = `
    <div class="flexibot-header">
      <span class="flexibot-title" id="flexibot-title">Loading...</span>
      <span class="theme-toggle">🌙</span>
    </div>
    <div id="flexibot-messages"></div>
    <div class="flexibot-input">
      <input type="text" id="flexibot-input" placeholder="Enter your query..." />
      <button id="flexibot-send">Send</button>
    </div>
  `;
  document.body.appendChild(chatWindow);

  // Step 2 → Update title and tooltip
  const titleEl = document.getElementById("flexibot-title");
  if (titleEl) titleEl.textContent = clientConfig.botName || "FlexiBot";
  chatButton.title = clientConfig.botName?.trim() || "FlexiBot";

  // ✅ Step 3 → Reveal UI smoothly after theme loaded
  setTimeout(() => {
    document
      .querySelectorAll(".flexibot-window, .flexibot-bubble")
      .forEach((el) => (el.style.opacity = "1"));
  }, 150);
}

  // Grab the injected UI elements
  const Messages = document.getElementById("flexibot-messages");
  const Input = document.getElementById("flexibot-input");
  const Send = document.getElementById("flexibot-send");
  const themeToggle = chatWindow.querySelector(".theme-toggle"); // inside header

  // Toggle chat window
  function openChat() {
    chatWindow.style.display = "flex";
    chatWindow.style.flexDirection = "column";
    setTimeout(() => {
      try {
        Input.focus();
      } catch (e) {}
    }, 50);
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
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeChat();
  });

  // ✅ Session ID (same as flexibot.js)
  let sessionId = localStorage.getItem("flexibotSessionId");
  if (!sessionId) {
    sessionId =
      Date.now().toString() + "-" + Math.random().toString(36).substring(2, 8);
    localStorage.setItem("flexibotSessionId", sessionId);
  }

  // Append message helper
  function appendMessage(who, text) {
    const el = document.createElement("div");
    el.className =
      "message-bubble " + (who === "user" ? "user-bubble" : "bot-bubble");
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
      // 1️⃣ Try Groq (default)
      let res = await fetch(
        "https://flexibot-backend.onrender.com/api/message",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, sessionId, text }),
        }
      );

      let data = await res.json();

      // 2️⃣ Fallback to Gemini if Groq fails
      if (!res.ok || !data.reply || data.status === "error") {
        console.warn("Groq failed, falling back to Gemini...");

        res = await fetch("https://flexibot-backend.onrender.com/api/message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId,
            sessionId,
            text,
            forceGemini: true,
          }),
        });
        data = await res.json();
      }

      // 3️⃣ Show AI reply
      const botMsg = document.createElement("div");
      botMsg.className = "message-bubble bot-bubble";

      if (!res.ok || data.status === "error") {
        botMsg.textContent =
          data.reply ||
          "⚠️ Sorry, I couldn't process your message. Please try again.";
      } else {
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
        }, 2000);
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
    chatWindow.classList.toggle("light-mode");
    themeToggle.textContent = chatWindow.classList.contains("light-mode")
      ? "🌞"
      : "🌙";
  });
});
