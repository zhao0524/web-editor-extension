# Web Editor

A Chrome extension that lets you modify any web page using natural language. Describe what you want to change, review the AI's plan, then apply it — all from a chat interface in your browser toolbar.

Powered by Google Gemini.

## How It Works

1. **Open the extension** on any web page. It automatically scans the page and builds a map of visible elements (headings, buttons, links, sections, etc.).
2. **Describe a change** in plain English — for example, *"Make the main heading say Welcome Back"* or *"Increase the button font size to 20px"*.
3. **Review the plan.** Gemini returns a structured set of proposed changes displayed as cards. Each card shows the target element, a description, and an editable value. You can modify values, remove individual actions, or discard the whole plan.
4. **Apply.** Once you're satisfied, click Apply Changes. The extension executes only the approved actions on the page.
5. **Undo.** Every change is saved to an undo stack. Press the Undo button or Ctrl+Z to revert changes one at a time, like Google Docs.

## Supported Actions

| Action | What it does |
|---|---|
| **Edit Text** | Changes the text content of an element |
| **Font Size** | Changes the CSS `font-size` of an element |

## Safety

- The AI can only target elements it found during the page scan — it cannot invent selectors.
- Every plan is validated against a strict JSON schema before it's shown to you.
- Plans with low confidence (< 70%) display a warning.
- **Nothing is executed without your explicit approval.**

## Setup

1. Get a [Gemini API key](https://aistudio.google.com/apikey).
2. Create a `config.js` file in the project root:

```js
const CONFIG = {
  GEMINI_API_KEY: "your-api-key-here",
};
```

3. Open `chrome://extensions` in Chrome.
4. Enable **Developer mode** (top-right toggle).
5. Click **Load unpacked** and select this folder.
6. Navigate to any website, click the Web Editor icon, and start editing.

## File Structure

```
manifest.json   — Chrome extension config (Manifest V3)
popup.html      — Extension popup UI and styles
popup.js        — Chat logic, DOM scanning, plan rendering, execution, undo
schema.js       — System prompt, JSON plan extraction and validation
config.js       — API key (gitignored)
.gitignore      — Keeps config.js out of version control
```

## Requirements

- Google Chrome (or any Chromium-based browser)
- A Google Gemini API key
