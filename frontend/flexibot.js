const bubble = document.querySelector(".flexibot-bubble");
const chatWindow = document.querySelector(".flexibot-window");
const messages = document.querySelector("#flexibot-messages");
const input = document.querySelector("#flexibot-input");
const sendBtn = document.querySelector("#flexibot-send");

// Toggle window
bubble.addEventListener("click", () => {
  chatWindow.style.display =
    chatWindow.style.display === "flex" ? "none" : "flex";
  chatWindow.style.flexDirection = "column";
});

// Send message function
async function sendMessage() {
  const text = input.value.trim();
  if (!text) return;

  // Add user message
  const msg = document.createElement("div");
  msg.textContent = "You: " + text;
  messages.appendChild(msg);
  input.value = "";
  messages.scrollTop = messages.scrollHeight;

  try {
    const res = await fetch("http://localhost:5000/api/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });

    const data = await res.json();

    // Show "typing..." indicator
    const typing = document.createElement("div");
    typing.id = "typing";
    typing.textContent = "Bot is typing...";
    messages.appendChild(typing);
    messages.scrollTop = messages.scrollHeight;

    if (data.reply) {
      setTimeout(() => {
        typing.remove()
        const botMsg = document.createElement("div");
        botMsg.textContent = `Bot: ${data.reply}`;
        messages.appendChild(botMsg);
        messages.scrollTop = messages.scrollHeight;
    }, 1000)}
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
