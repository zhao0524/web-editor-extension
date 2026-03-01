document.getElementById("changeBtn").addEventListener("click", async () => {
  const text = document.getElementById("textInput").value.trim();
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
          ? `Done — changed ${count} H1 heading${count > 1 ? "s" : ""} to "${replacementText}".`
          : "No H1 headings found on this page."
      );
    },
    args: [text],
  });
});
