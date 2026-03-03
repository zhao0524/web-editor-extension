const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`;

const chatArea = document.getElementById("chatArea");
const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const changeBtn = document.getElementById("changeBtn");

const conversationHistory = [];
let selectedAiText = null;

function autoResize() {
  msgInput.style.height = "auto";
  msgInput.style.height = msgInput.scrollHeight + "px";
}

msgInput.addEventListener("input", autoResize);

function scrollToBottom() {
  chatArea.scrollTop = chatArea.scrollHeight;
}

function addBubble(text, role) {
  const div = document.createElement("div");
  div.classList.add("msg", role);
  div.textContent = text;

  if (role === "ai") {
    const hint = document.createElement("span");
    hint.classList.add("use-hint");
    hint.textContent = "click to select";
    div.appendChild(hint);

    div.addEventListener("click", () => {
      document.querySelectorAll(".msg.ai.selected").forEach((el) => el.classList.remove("selected"));
      div.classList.add("selected");
      selectedAiText = text;
    });

    selectedAiText = text;
    document.querySelectorAll(".msg.ai.selected").forEach((el) => el.classList.remove("selected"));
    div.classList.add("selected");
  }

  chatArea.appendChild(div);
  scrollToBottom();
  return div;
}

function showTyping() {
  const div = document.createElement("div");
  div.classList.add("typing");
  div.id = "typingIndicator";
  div.textContent = "Thinking…";
  chatArea.appendChild(div);
  scrollToBottom();
}

function removeTyping() {
  document.getElementById("typingIndicator")?.remove();
}

async function sendMessage() {
  const text = msgInput.value.trim();
  if (!text) return;

  addBubble(text, "user");
  msgInput.value = "";
  msgInput.style.height = "auto";
  sendBtn.disabled = true;
  showTyping();

  conversationHistory.push({ role: "user", parts: [{ text }] });

  try {
    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: conversationHistory }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || res.statusText);
    }

    const data = await res.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "(no response)";

    conversationHistory.push({ role: "model", parts: [{ text: reply }] });

    removeTyping();
    addBubble(reply, "ai");
  } catch (e) {
    removeTyping();
    addBubble("Error: " + e.message, "ai");
  } finally {
    sendBtn.disabled = false;
    msgInput.focus();
  }
}

sendBtn.addEventListener("click", sendMessage);

msgInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

changeBtn.addEventListener("click", async () => {
  if (!selectedAiText) {
    alert("No AI message selected. Send a message first, or click an AI response to select it.");
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (replacementText) => {
      const headings = document.querySelectorAll("h1");
      let count = 0;

      headings.forEach((h1) => {
        h1.textContent = replacementText;
        count++;
      });

      alert(
        count > 0
          ? `Done — changed ${count} H1 heading${count > 1 ? "s" : ""}.`
          : "No H1 headings found on this page."
      );
    },
    args: [selectedAiText],
  });
});
