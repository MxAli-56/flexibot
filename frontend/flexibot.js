document.addEventListener("DOMContentLoaded", () => {
    const container = document.getElementById("flexibot")

    const bubble = document.createElement("div")
    bubble.className = "flexibot-bubble";
    bubble.innerText = "💬";

    const chatWindow = document.getElementById("div")
    chatWindow.className = "flexibot-window";
    chatWindow.innerHTML = `
    <div class="flexibot-header">FlexiBot</div>
    <div class="flexibot-messages" id="messages"></div>
    <div class="flexibot-input">
    <input type="text" id="userInput" placeholder="Type a message..." />
    <button id="sendBtn">Send</button>
    </div>`;

    container.appendChild(bubble)
    container.appendChild(chatWindow)

    bubble.addEventListener("click", () => {
        chatWindow.style.display = chatWindow.style.display === "flex" ? "none" : "flex"
        chatWindow.style.flexDirection = "column"
    })

    const messagesDiv = chatWindow.querySelector("#messages");
    const input = chatWindow.querySelector("#userInput");
    const sendBtn = chatWindow.querySelector("#sendBtn");

    function appendMessage(sender, text) {
      const msg = document.createElement("div");
      msg.textContent = `${sender}: ${text}`;
      messagesDiv.appendChild(msg);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    sendBtn.addEventListener("click", () => {
      const text = input.value.trim();
      if (!text) return;
      appendMessage("You", text);
      input.value = "";
      // Local dummy reply
      setTimeout(() => appendMessage("Bot", "This is a dummy reply."), 500);
    });
})
