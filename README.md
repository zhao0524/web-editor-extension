# Web Editor

A Chrome extension that lets you modify any web page using natural language. Describe what you want to change, review the AI's plan, then apply it — all from a chat interface in your browser toolbar.

Web Editor is built for people who don't write code: designers, marketers, product managers, and clients who want to try out new copy, resize a heading, swap an image, or rearrange a layout on a live page without opening DevTools or waiting for a developer. Every AI-proposed change is shown for review before anything touches the page, and every change can be undone.

Powered by Google Gemini 2.5 Flash.

## How It Works

1. **Open the extension** on any web page. It automatically scans the page and builds a map of visible elements (headings, buttons, links, images, and page sections).
2. **Describe a change** in plain English — for example, *"Make the main heading say Welcome Back"* or *"Increase the button font size to 20px"*. Optionally attach or paste a screenshot to give the AI visual context.
3. **Review the plan.** Gemini returns a structured set of proposed changes displayed as cards. Each card shows the target element, a description, and an editable value. You can modify values, remove individual actions, or discard the whole plan.
4. **Apply.** Once you're satisfied, click Apply Changes. The extension executes only the approved actions on the page.
5. **Undo.** Every change is saved to an undo stack. Press the Undo button or Ctrl/Cmd+Z to revert changes one at a time, like Google Docs.

You can also use **Layout mode** (the Layout button in the toolbar) to drag elements around the page directly with your mouse, without using the AI at all. Moves are recorded and can be undone the same way.

The chat answers general questions too; the AI only returns a plan when you ask for a page edit.

## Supported Actions

| Action | What it does |
|---|---|
| **Edit Text** | Changes the text content of an element |
| **Font Size** | Changes the CSS `font-size` of an element |
| **Replace Image** | Swaps an image with one you upload or paste |
| **Drag to Reposition** | Visually move any element around the page in Layout mode |

## Safety

- The AI can only target elements it found during the page scan — it cannot invent selectors.
- Every plan is validated against a strict JSON schema before it's shown to you.
- Plans with low confidence (< 70%) display a warning.
- **Nothing is executed without your explicit approval.**

## Good to Know

- **Edits are local and temporary.** Changes apply only to the page open in your browser tab. They aren't saved to the website, and they disappear when you reload. Use it to preview and prototype changes, then hand them to whoever maintains the site.
- **What is sent to Gemini:** your message, any image you attach, and a summary of up to 40 visible page elements (tag, CSS selector, the first 80 characters of text, font size, and image URL). Nothing else from the page is sent.
- **Permissions:** `activeTab` and `scripting` let the extension read and edit only the tab you open it on; host access is limited to the Gemini API.
- **Pages it can't edit:** Chrome blocks extensions on internal pages such as `chrome://` URLs and the Chrome Web Store.

## Setup

1. Get a [Gemini API key](https://aistudio.google.com/apikey).
2. Clone the repository:

```bash
git clone https://github.com/zhao0524/web-editor-extension.git
```

3. Create a `config.js` file in the project root:

```js
const CONFIG = {
  GEMINI_API_KEY: "your-api-key-here",
};
```

4. Open `chrome://extensions` in Chrome.
5. Enable **Developer mode** (top-right toggle).
6. Click **Load unpacked** and select this folder.
7. Navigate to any website, click the Web Editor icon, and start editing.

`config.js` is gitignored. The key is loaded inside the extension, so only share a packaged build with people you trust with your key.

## Tech Stack

- Chrome Extensions Manifest V3 (`chrome.scripting`, `chrome.tabs`)
- Vanilla JavaScript, HTML, and CSS (no build step or dependencies)
- Google Gemini 2.5 Flash via the Generative Language REST API (multimodal: text and images)

## File Structure

```
manifest.json   — Chrome extension config (Manifest V3)
popup.html      — Extension popup UI and styles
popup.js        — Chat logic, DOM scanning, plan rendering, execution, undo, layout mode
schema.js       — System prompt, JSON plan extraction and validation
config.js       — API key (gitignored)
.gitignore      — Keeps config.js out of version control
```

## Requirements

- Google Chrome (or any Chromium-based browser)
- A Google Gemini API key
