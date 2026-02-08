let clientConfig = {
  botName: "FlexiBot",
  theme: "", // default = no extra theme
};

const currentScript = document.currentScript;
const clientId = currentScript.getAttribute("data-client-id");

// ------------------- fetch client config -------------------
async function loadClientConfig() {
  try {
    const res = await fetch(
      `https://flexibot-backend.onrender.com/api/admin/client-config/${clientId}?_=${Date.now()}`,
      { cache: "no-store" }
    );
    if (!res.ok) throw new Error("Config not found");
    const json = await res.json();
    clientConfig = json;
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
  box-shadow: 0 4px 12px rgba(0,0,0,0.2); /* Updated shadow for depth */
  z-index: 2147483647;
  font-size: 24px;
  transition: transform 0.3s ease; /* Added for hover effect */
}

/* Added: Hover effect */
.flexibot-bubble:hover {
  transform: scale(1.1);
}

/* Added: The "Chat with us" Pointer/Pill */
.flexibot-cta {
  position: absolute;
  right: 75px;
  background: white;
  color: #333;
  padding: 8px 15px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  box-shadow: 0 4px 10px rgba(0,0,0,0.1);
  pointer-events: none;
  animation: cta-pulse 2s infinite ease-in-out;
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

/* Container adjustments */
.flexibot-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 20px; /* More breathing room on sides */
  background: #4c0f77;
  color: white;
  border-top-left-radius: 10px; /* Match window curves */
  border-top-right-radius: 10px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.bot-logo-header {
  width: 40px;
  height: 40px;
  background: white; /* Clean white background for the icon */
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.header-info {
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.bot-name {
  font-size: 16px;
  font-weight: 700;
  margin: 0;
  line-height: 1.2;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}

.online-dot {
  width: 8px;
  height: 8px;
  background-color: #00ff00; /* Bright green like the example */
  border-radius: 50%;
  border: 1.5px solid #4c0f77; /* Creates a clean gap effect */
}

.online-text {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.9);
  font-weight: 400;
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

/* The wrapper that adds padding around the pill */
.flexibot-input-container {
  padding: 15px;
  background: #1e1e1e; /* Matches your chat background */
  border-bottom-left-radius: 10px;
  border-bottom-right-radius: 10px;
}

/* The actual Pill */
.flexibot-input {
  display: flex;
  align-items: center;
  background: #2c2c2c;
  border: 1px solid #444;
  border-radius: 25px; /* Makes it a pill */
  padding: 5px 15px;
  transition: border-color 0.3s ease, box-shadow 0.3s ease;
}

/* Glow effect when user clicks the input */
.flexibot-input:focus-within {
  border-color: #4c0f77;
  box-shadow: 0 0 8px rgba(76, 15, 119, 0.4);
}

.flexibot-input input {
  flex: 1;
  padding: 10px;
  border: none !important;
  outline: none !important;
  background: transparent;
  color: white;
  font-size: 14px;
}

.flexibot-input button {
  background: transparent;
  border: none;
  color: #4c0f77; /* Brand color for the icon */
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 5px;
  transition: transform 0.2s ease;
}

.flexibot-input button:hover {
  transform: scale(1.15) rotate(-10deg); /* Slight "takeoff" tilt */
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

/* 1. Header Circle (Large) */
.bot-logo-header {
  width: 32px;
  height: 32px;
  background: white;
  border-radius: 50%;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  flex-shrink: 0;
  overflow: hidden;
}

/* 2. Message Circle (Small) */
.bot-avatar-small {
  width: 24px;
  height: 24px;
  background: #eee;
  border-radius: 50%;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  flex-shrink: 0;
  overflow: hidden;
}

/* 3. Header Tooth (Large) */
.bot-logo-header svg {
  width: 20px !important;
  height: 20px !important;
  display: block;
  fill: #4c0f77;
}

/* 4. Message Tooth (Small) */
.bot-avatar-small svg {
  width: 14px !important;
  height: 14px !important;
  display: block;
  fill: #4c0f77;
}

/* 5. Layout Wrapper */
.bot-message-wrapper {
  display: flex;
  align-items: flex-end; 
  gap: 8px;
  margin-bottom: 10px;
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
    width: 55px; /* Adjusted for tablet */
    height: 55px;
    font-size: 22px;
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
    width: 50px; /* Slightly larger than before for better thumb-target */
    height: 50px;
    font-size: 20px;
    bottom: 15px;
    right: 15px;
  }
  
  .flexibot-cta {
    display: none; /* Hide pill on mobile for clean look */
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

@keyframes cta-pulse {
  0% { transform: scale(1); opacity: 0.9; }
  50% { transform: scale(1.05); opacity: 1; }
  100% { transform: scale(1); opacity: 0.9; }
}

.suggestion-container {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 10px 0 10px 48px; /* Aligns with the message bubble text */
      }

      .suggestion-btn {
        background: white;
        border: 1px solid #4c0f77;
        color: #4c0f77;
        padding: 6px 14px;
        border-radius: 20px;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.2s;
        font-family: inherit;
        font-weight: 500;
        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
      }

      .suggestion-btn:hover {
        background: #4c0f77;
        color: white;
        transform: translateY(-1px);
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      }
`;

  // 1️⃣ Load external libraries first
  await loadLibs();

  // 2️⃣ Fetch client config
  await loadClientConfig();
  initChatUI();

  function initChatUI() {
    // Inject styles into page
    const styleEl = document.createElement("style");
    styleEl.textContent = flexibotStyles;
    document.head.appendChild(styleEl);

    // --- UPDATED: Inject floating chat button ---
    const chatButton = document.createElement("div");
    chatButton.className = "flexibot-bubble";
    // We added the CTA div here so the CSS has something to target
    chatButton.innerHTML = `
        <div class="flexibot-cta">Chat with us</div>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    `;
    document.body.appendChild(chatButton);
    chatButton.title = clientConfig.botName?.trim() || "FlexiBot";

    // 2. Create chat window
    const chatWindow = document.createElement("div");
    chatWindow.className = "flexibot-window";

    // UPDATED: Header structure for Icon + Name + Online Dot
    chatWindow.innerHTML = `
      <div class="flexibot-header">
  <div class="header-left">
    <div class="bot-logo-header" style="color: #4c0f77;">
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 2C10 2 8 3.5 8 6C8 7 8.5 8.5 9 9.5C7.5 10 6 11.5 6 14C6 17 8 22 10 22C11 22 11.5 21 12 21C12.5 21 13 22 14 22C16 22 18 17 18 14C18 11.5 16.5 10 15 9.5C15.5 8.5 16 7 16 6C16 3.5 14 2 12 2Z" fill="currentColor"/>
</svg>
</div>
    <div class="header-info">
      <div class="name-row">
        <span class="bot-name" id="flexibot-title">Smile Care AI</span>
      </div>
      <div class="status-row">
        <span class="online-dot"></span>
        <span class="online-text">Online Now</span>
      </div>
    </div>
  </div>
  <div id="flexibot-close" style="cursor:pointer; font-size: 20px; color: rgba(255,255,255,0.8);">&times;</div>
  </div>
      <div id="flexibot-messages"></div>
      <div class="flexibot-input-container">
  <div class="flexibot-input">
    <input type="text" id="flexibot-input" placeholder="Enter your query..." />
    <button id="flexibot-send">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="22" y1="2" x2="11" y2="13"></line>
        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
      </svg>
    </button>
  </div>
</div>
    `;

    document.body.appendChild(chatWindow);

    // Target the X button we added to the header
    const closeBtn = chatWindow.querySelector("#flexibot-close");

    if (closeBtn) {
      closeBtn.onclick = () => {
        chatWindow.style.display = "none";
        // If your launcher is named 'chatButton', show it again
        chatButton.style.display = "flex";
      };
    }

    // Update chat header title after window is created
    const titleEl = document.getElementById("flexibot-title");
    if (titleEl) {
      titleEl.textContent = clientConfig.botName || "FlexiBot";
    }

    // Apply client theme if provided. Default CSS is already injected earlier.
    if (clientConfig.theme && clientConfig.theme.trim()) {
      try {
        const themeHref = clientConfig.theme; // e.g. "/themes/restaurant.css" OR full URL
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
    // Grab the injected UI elements
    const Messages = document.getElementById("flexibot-messages");
    const Input = document.getElementById("flexibot-input");
    const Send = document.getElementById("flexibot-send");

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
        Date.now().toString() +
        "-" +
        Math.random().toString(36).substring(2, 8);
      localStorage.setItem("flexibotSessionId", sessionId);
    }

    function appendMessage(who, text) {
      const wrapper = document.createElement("div");

      if (who === "bot") {
        wrapper.className = "bot-message-wrapper";
        wrapper.innerHTML = `
      <div class="bot-avatar-small">
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 2C10 2 8 3.5 8 6C8 7 8.5 8.5 9 9.5C7.5 10 6 11.5 6 14C6 17 8 22 10 22C11 22 11.5 21 12 21C12.5 21 13 22 14 22C16 22 18 17 18 14C18 11.5 16.5 10 15 9.5C15.5 8.5 16 7 16 6C16 3.5 14 2 12 2Z" fill="currentColor"/>
</svg>
</div>
      <div class="message-bubble bot-bubble">${text}</div>
    `;
      } else {
        // User message stays simple
        wrapper.className = "message-bubble user-bubble";
        wrapper.style.alignSelf = "flex-end";
        wrapper.textContent = text;
      }

      Messages.appendChild(wrapper);
      Messages.scrollTop = Messages.scrollHeight;
    }

    // --- PLACE IT HERE ---
    async function sendGreeting() {
      // Prevent duplicate greetings if user re-opens window in same session
      if (Messages.children.length > 0) return;

      // Pulls from your config so it stays generic for all clinics
      const clinicName = window.FlexiBotConfig?.clientName || "our clinic";
      const greetingText = `Hi there! Welcome to ${clinicName}. How can I help you today?`;

      appendMessage("bot", greetingText);

      const suggestions = [
        "Which dentist is available today?",
        "What services do you offer?",
        "What is the process for emergencies?",
      ];

      const buttonContainer = document.createElement("div");
      buttonContainer.className = "suggestion-container";

      suggestions.forEach((text) => {
        const btn = document.createElement("button");
        btn.className = "suggestion-btn";
        btn.textContent = text;
        btn.onclick = () => {
          // Find the input, set value, and trigger existing sendMessage
          const inputField = document.getElementById("flexibot-input");
          if (inputField) {
            inputField.value = text;
            sendMessage();
            buttonContainer.remove();
          }
        };
        buttonContainer.appendChild(btn);
      });

      Messages.appendChild(buttonContainer);
      Messages.scrollTop = Messages.scrollHeight;
    }
    // --- END OF GREETING FUNCTION ---

    chatButton.onclick = () => {
      chatWindow.style.display = "flex";
      chatButton.style.display = "none";

      // This is the trigger
      sendGreeting();
    };

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
        // 1️⃣ Try Mistral (default)
        let res = await fetch(
          "https://flexibot-backend.onrender.com/api/message",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clientId, sessionId, text }),
          },
        );

        let data = await res.json();

        // 2️⃣ Fallback to Bytez if Mistral fails
        if (!res.ok || !data.reply || data.status === "error") {
          console.warn("Mistral failed, falling back to Bytez...");

          res = await fetch(
            "https://flexibot-backend.onrender.com/api/message",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                clientId,
                sessionId,
                text,
                forceGemini: true,
              }),
            },
          );
          data = await res.json();
        }

        // 3️⃣ Show AI reply
        const botWrapper = document.createElement("div");
        botWrapper.className = "bot-message-wrapper";

        // Create the inner HTML with the icon and the bubble
        const replyContent =
          !res.ok || data.status === "error"
            ? data.reply || "⚠️ Sorry, I couldn't process your message."
            : DOMPurify.sanitize(marked.parse(data.reply));

        // Look for the line where you define botWrapper.innerHTML:
        botWrapper.innerHTML = `
      <div class="bot-avatar-small">
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 2C10 2 8 3.5 8 6C8 7 8.5 8.5 9 9.5C7.5 10 6 11.5 6 14C6 17 8 22 10 22C11 22 11.5 21 12 21C12.5 21 13 22 14 22C16 22 18 17 18 14C18 11.5 16.5 10 15 9.5C15.5 8.5 16 7 16 6C16 3.5 14 2 12 2Z" fill="currentColor"/>
</svg>
  </div>
    <div class="message-bubble bot-bubble">${replyContent}</div>
    `;

        typingEl.replaceWith(botWrapper);
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
  } 
});