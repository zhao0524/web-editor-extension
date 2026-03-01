const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`;

const textarea = document.getElementById("textInput");
const aiBtn = document.getElementById("aiBtn");
const status = document.getElementById("status");

function autoResize() {
  textarea.style.height = "auto";
  textarea.style.height = textarea.scrollHeight + "px";
}

textarea.addEventListener("input", autoResize);

aiBtn.addEventListener("click", async () => {
  const prompt = textarea.value.trim();
  if (!prompt) return;

  aiBtn.disabled = true;
  status.textContent = "Thinking…";

  try {
    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || res.statusText);
    }

    const data = await res.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "(no response)";
    textarea.value = reply;
    autoResize();
    status.textContent = "AI response ready";
  } catch (e) {
    status.textContent = "Error: " + e.message;
  } finally {
    aiBtn.disabled = false;
  }
});

document.getElementById("changeBtn").addEventListener("click", async () => {
  const text = textarea.value.trim();
  if (!text) return;

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
    args: [text],
  });
});
