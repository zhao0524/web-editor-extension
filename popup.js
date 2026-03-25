const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`;

const chatArea = document.getElementById("chatArea");
const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const undoBtn = document.getElementById("undoBtn");
const layoutBtn = document.getElementById("layoutBtn");

const attachBtn = document.getElementById("attachBtn");
const fileInput = document.getElementById("fileInput");
const imagePreview = document.getElementById("imagePreview");
const previewThumb = document.getElementById("previewThumb");
const previewName = document.getElementById("previewName");
const previewRemove = document.getElementById("previewRemove");

const conversationHistory = [];
const undoStack = [];
let domSummary = null;
let pendingImage = null;
let layoutModeActive = false;

/* ------------------------------------------------------------------ */
/*  Textarea auto-resize                                              */
/* ------------------------------------------------------------------ */

function autoResize() {
  msgInput.style.height = "auto";
  msgInput.style.height = msgInput.scrollHeight + "px";
}
msgInput.addEventListener("input", autoResize);

/* ------------------------------------------------------------------ */
/*  Image attach — file picker + clipboard paste                      */
/* ------------------------------------------------------------------ */

function stageImage(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result;
    const base64 = dataUrl.split(",")[1];
    pendingImage = { base64, mimeType: file.type, dataUrl };
    previewThumb.src = dataUrl;
    previewName.textContent = file.name || "pasted image";
    imagePreview.classList.add("visible");
  };
  reader.readAsDataURL(file);
}

function clearImage() {
  pendingImage = null;
  previewThumb.src = "";
  previewName.textContent = "";
  imagePreview.classList.remove("visible");
  fileInput.value = "";
}

attachBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) stageImage(fileInput.files[0]);
});
previewRemove.addEventListener("click", clearImage);

msgInput.addEventListener("paste", (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      e.preventDefault();
      stageImage(item.getAsFile());
      return;
    }
  }
});

/* ------------------------------------------------------------------ */
/*  Chat helpers                                                      */
/* ------------------------------------------------------------------ */

function scrollToBottom() {
  chatArea.scrollTop = chatArea.scrollHeight;
}

function addBubble(text, role, imageDataUrl) {
  const div = document.createElement("div");
  div.classList.add("msg", role);
  if (text) div.textContent = text;
  if (imageDataUrl) {
    const img = document.createElement("img");
    img.src = imageDataUrl;
    img.alt = "attached screenshot";
    div.appendChild(img);
  }
  chatArea.appendChild(div);
  scrollToBottom();
}

function showTyping() {
  const el = document.createElement("div");
  el.classList.add("typing");
  el.id = "typingIndicator";
  el.textContent = "Thinking…";
  chatArea.appendChild(el);
  scrollToBottom();
}

function removeTyping() {
  document.getElementById("typingIndicator")?.remove();
}

/* ------------------------------------------------------------------ */
/*  DOM Scanner — injected into the active tab                        */
/* ------------------------------------------------------------------ */

async function scanPageDOM() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const out = [];
        const seen = new Set();

        function selector(el) {
          if (el.id) return "#" + el.id;
          let s = el.tagName.toLowerCase();
          if (el.className && typeof el.className === "string") {
            const cls = el.className.trim().split(/\s+/).filter(Boolean);
            if (cls.length) s += "." + cls.join(".");
          }
          const parent = el.parentElement;
          if (parent) {
            const same = Array.from(parent.children).filter(c => c.tagName === el.tagName);
            if (same.length > 1) s += ":nth-of-type(" + (same.indexOf(el) + 1) + ")";
          }
          let anc = el.parentElement;
          while (anc && anc !== document.body) {
            if (anc.id) { s = "#" + anc.id + " " + s; break; }
            anc = anc.parentElement;
          }
          return s;
        }

        const query = "h1,h2,h3,button,a[href],img,nav,section,header,footer,main";
        document.querySelectorAll(query).forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) return;
          const sel = selector(el);
          if (seen.has(sel)) return;
          seen.add(sel);
          const entry = {
            tag: el.tagName.toLowerCase(),
            selector: sel,
            text: (el.innerText || "").trim().slice(0, 80),
            fontSize: getComputedStyle(el).fontSize,
          };
          if (el.tagName.toLowerCase() === "img") {
            entry.src = el.src.slice(0, 120);
          }
          out.push(entry);
        });
        return out.slice(0, 40);
      },
    });
    domSummary = results[0].result;
  } catch {
    domSummary = [];
  }
}

/* ------------------------------------------------------------------ */
/*  Undo stack                                                        */
/* ------------------------------------------------------------------ */

function updateUndoBtn() {
  const n = undoStack.length;
  undoBtn.textContent = n > 0 ? `Undo (${n})` : "Undo";
  undoBtn.disabled = n === 0;
}

async function undo() {
  if (undoStack.length === 0) return;
  const changes = undoStack.pop();

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (changes) => {
        for (const c of changes) {
          const el = document.querySelector(c.selector);
          if (!el) continue;
          if (c.prop === "textContent") el.textContent = c.old;
          else if (c.prop === "src") el.src = c.old;
          else el.style[c.prop] = c.old;
        }
      },
      args: [changes],
    });
    addBubble("Change undone.", "system");
  } catch (e) {
    addBubble("Undo failed: " + e.message, "system");
  }
  updateUndoBtn();
}

/* ------------------------------------------------------------------ */
/*  Execute approved plan actions                                     */
/* ------------------------------------------------------------------ */

async function executePlan(actions, uploadedImageDataUrl) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (actions, uploadedImageDataUrl) => {
        const snapshot = [];
        let applied = 0;

        for (const a of actions) {
          const el = document.querySelector(a.target);
          if (!el) continue;

          if (a.action === "edit_text") {
            snapshot.push({ selector: a.target, prop: "textContent", old: el.textContent });
            el.textContent = a.proposed_value;
            applied++;
          } else if (a.action === "change_font_size") {
            snapshot.push({ selector: a.target, prop: "fontSize", old: el.style.fontSize || "" });
            el.style.fontSize = a.proposed_value;
            applied++;
          } else if (a.action === "replace_image") {
            if (!uploadedImageDataUrl) continue;
            snapshot.push({ selector: a.target, prop: "src", old: el.src });
            el.src = uploadedImageDataUrl;
            applied++;
          }
        }
        return { snapshot, applied };
      },
      args: [actions, uploadedImageDataUrl || null],
    });

    const { snapshot, applied } = results[0].result;
    if (snapshot.length > 0) {
      undoStack.push(snapshot);
      updateUndoBtn();
    }
    addBubble(`Applied ${applied} change${applied !== 1 ? "s" : ""}.`, "system");
    domSummary = null;
  } catch (e) {
    addBubble("Execution failed: " + e.message, "system");
  }
}

/* ------------------------------------------------------------------ */
/*  Plan preview card                                                 */
/* ------------------------------------------------------------------ */

function renderPlanCard(plan, uploadedImage) {
  document.querySelectorAll(".plan-card.active").forEach(c => {
    c.classList.remove("active");
    c.classList.add("expired");
  });

  const card = document.createElement("div");
  card.classList.add("plan-card", "active");

  const pct = Math.round(plan.confidence * 100);

  // Header
  const hdr = document.createElement("div");
  hdr.classList.add("plan-header");
  const title = document.createElement("span");
  title.textContent = "Proposed Changes";
  const conf = document.createElement("span");
  conf.classList.add("plan-confidence");
  if (plan.confidence < 0.7) conf.classList.add("low");
  conf.textContent = `Confidence: ${pct}%`;
  hdr.append(title, conf);
  card.appendChild(hdr);

  if (plan.confidence < 0.7) {
    const warn = document.createElement("div");
    warn.classList.add("plan-warning");
    warn.textContent = "Low confidence — review carefully or try a more specific request.";
    card.appendChild(warn);
  }

  // Action items
  const list = document.createElement("div");
  plan.plan.forEach(a => {
    const item = document.createElement("div");
    item.classList.add("plan-action-item");
    item.dataset.actionType = a.action;
    item.dataset.target = a.target;

    const topRow = document.createElement("div");
    topRow.classList.add("action-top-row");
    const lbl = document.createElement("span");
    lbl.classList.add("action-type-label");
    lbl.textContent = ACTIONS[a.action]?.label || a.action;
    const rm = document.createElement("button");
    rm.classList.add("action-remove");
    rm.textContent = "\u2715";
    rm.addEventListener("click", () => item.remove());
    topRow.append(lbl, rm);

    const tgt = document.createElement("div");
    tgt.classList.add("action-target");
    tgt.textContent = a.target;

    const desc = document.createElement("div");
    desc.classList.add("action-desc");
    desc.textContent = a.description;

    if (a.action === "replace_image") {
      const imgLbl = document.createElement("div");
      imgLbl.classList.add("action-image-label");
      if (uploadedImage?.dataUrl) {
        const thumb = document.createElement("img");
        thumb.src = uploadedImage.dataUrl;
        thumb.classList.add("action-image-thumb");
        imgLbl.appendChild(thumb);
      }
      const note = document.createElement("span");
      note.textContent = uploadedImage ? "Your uploaded image" : "⚠ No image attached";
      imgLbl.appendChild(note);
      item.append(topRow, tgt, desc, imgLbl);
    } else {
      const inp = document.createElement("input");
      inp.type = "text";
      inp.classList.add("action-value-input");
      inp.value = a.proposed_value;
      item.append(topRow, tgt, desc, inp);
    }
    list.appendChild(item);
  });
  card.appendChild(list);

  // Buttons
  const btnRow = document.createElement("div");
  btnRow.classList.add("plan-btn-row");

  const applyBtn = document.createElement("button");
  applyBtn.classList.add("plan-apply");
  applyBtn.textContent = "Apply Changes";

  const discardBtn = document.createElement("button");
  discardBtn.classList.add("plan-discard");
  discardBtn.textContent = "Discard";

  applyBtn.addEventListener("click", async () => {
    const items = card.querySelectorAll(".plan-action-item");
    const actions = Array.from(items).map(it => ({
      action: it.dataset.actionType,
      target: it.dataset.target,
      proposed_value: it.querySelector(".action-value-input")?.value ?? "__uploaded__",
    }));
    if (actions.length === 0) return;
    await executePlan(actions, uploadedImage?.dataUrl);
    card.classList.remove("active");
    card.classList.add("applied");
    applyBtn.disabled = true;
    discardBtn.disabled = true;
    applyBtn.textContent = "Applied \u2713";
  });

  discardBtn.addEventListener("click", () => {
    card.classList.remove("active");
    card.classList.add("discarded");
    applyBtn.disabled = true;
    discardBtn.disabled = true;
    discardBtn.textContent = "Discarded";
  });

  btnRow.append(applyBtn, discardBtn);
  card.appendChild(btnRow);

  chatArea.appendChild(card);
  scrollToBottom();
}

/* ------------------------------------------------------------------ */
/*  Send message to Gemini                                            */
/* ------------------------------------------------------------------ */

async function sendMessage() {
  const text = msgInput.value.trim();
  if (!text && !pendingImage) return;

  const sentImage = pendingImage;
  addBubble(text, "user", sentImage?.dataUrl);
  clearImage();
  msgInput.value = "";
  msgInput.style.height = "auto";
  sendBtn.disabled = true;
  showTyping();

  await scanPageDOM();

  const parts = [];
  if (text) parts.push({ text });
  if (sentImage) parts.push({ inlineData: { mimeType: sentImage.mimeType, data: sentImage.base64 } });
  conversationHistory.push({ role: "user", parts });

  try {
    const sysPrompt = buildSystemPrompt(JSON.stringify(domSummary || [], null, 2));

    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sysPrompt }] },
        contents: conversationHistory,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || res.statusText);
    }

    const data = await res.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "(no response)";

    conversationHistory.push({ role: "model", parts: [{ text: reply }] });
    removeTyping();

    const plan = extractPlan(reply);
    const clean = getCleanText(reply);

    if (clean) addBubble(clean, "ai");

    if (plan && validatePlan(plan)) {
      renderPlanCard(plan, sentImage);
    } else if (plan) {
      addBubble("Received a plan but it failed validation. Try rephrasing your request.", "system");
    }
  } catch (e) {
    removeTyping();
    addBubble("Error: " + e.message, "system");
  } finally {
    sendBtn.disabled = false;
    msgInput.focus();
  }
}

/* ------------------------------------------------------------------ */
/*  Layout drag mode — injected into the active tab                  */
/* ------------------------------------------------------------------ */

function startDragModeOnPage() {
  if (window.__webEditorDragMode) return;
  window.__webEditorDragMode = true;
  window.__webEditorDragHistory = [];

  const style = document.createElement("style");
  style.id = "__webEditorDragStyle";
  style.textContent = `
    .__drag-hover { outline: 2px dashed rgba(123,47,247,0.8) !important; cursor: grab !important; }
    .__drag-active { outline: 2px solid #7b2ff7 !important; cursor: grabbing !important;
      opacity: 0.85; position: relative; z-index: 99999; box-shadow: 0 8px 24px rgba(0,0,0,0.4) !important; }
  `;
  document.head.appendChild(style);

  let dragEl = null, startX = 0, startY = 0, origTx = 0, origTy = 0;

  function getTranslate(el) {
    const m = (el.style.transform || "").match(/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/);
    return m ? [parseFloat(m[1]), parseFloat(m[2])] : [0, 0];
  }

  function uniqueSelector(el) {
    if (el.id) return "#" + el.id;
    const path = [];
    let cur = el;
    while (cur && cur !== document.body) {
      let seg = cur.tagName.toLowerCase();
      if (cur.parentElement) {
        const siblings = Array.from(cur.parentElement.children).filter(c => c.tagName === cur.tagName);
        if (siblings.length > 1) seg += ":nth-of-type(" + (siblings.indexOf(cur) + 1) + ")";
      }
      path.unshift(seg);
      cur = cur.parentElement;
    }
    return path.join(" > ");
  }

  const onMouseDown = (e) => {
    const el = e.target.closest("div,section,article,header,footer,nav,aside,main");
    if (!el || el === document.body || el === document.documentElement) return;
    e.preventDefault();
    e.stopPropagation();
    dragEl = el;
    [origTx, origTy] = getTranslate(el);
    startX = e.clientX - origTx;
    startY = e.clientY - origTy;
    el.classList.add("__drag-active");
    el.classList.remove("__drag-hover");
  };

  const onMouseMove = (e) => {
    if (dragEl) {
      dragEl.style.transform = `translate(${e.clientX - startX}px, ${e.clientY - startY}px)`;
    } else {
      const el = e.target.closest("div,section,article,header,footer,nav,aside,main");
      document.querySelectorAll(".__drag-hover").forEach(x => { if (x !== el) x.classList.remove("__drag-hover"); });
      if (el && el !== document.body) el.classList.add("__drag-hover");
    }
  };

  const onMouseUp = () => {
    if (!dragEl) return;
    dragEl.classList.remove("__drag-active");
    const [tx, ty] = getTranslate(dragEl);
    window.__webEditorDragHistory.push({
      selector: uniqueSelector(dragEl),
      oldTransform: origTx === 0 && origTy === 0 ? "" : `translate(${origTx}px, ${origTy}px)`,
    });
    dragEl = null;
  };

  document.addEventListener("mousedown", onMouseDown, true);
  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("mouseup", onMouseUp, true);
  window.__webEditorDragHandlers = { onMouseDown, onMouseMove, onMouseUp };
}

function stopDragModeOnPage() {
  if (!window.__webEditorDragMode) return { changes: [] };
  const h = window.__webEditorDragHandlers || {};
  document.removeEventListener("mousedown", h.onMouseDown, true);
  document.removeEventListener("mousemove", h.onMouseMove, true);
  document.removeEventListener("mouseup", h.onMouseUp, true);
  document.querySelectorAll(".__drag-hover, .__drag-active").forEach(el => {
    el.classList.remove("__drag-hover", "__drag-active");
  });
  document.getElementById("__webEditorDragStyle")?.remove();
  window.__webEditorDragMode = false;
  const changes = (window.__webEditorDragHistory || []).map(c => ({
    selector: c.selector,
    prop: "transform",
    old: c.oldTransform,
  }));
  window.__webEditorDragHistory = [];
  return { changes };
}

async function toggleLayoutMode() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!layoutModeActive) {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: startDragModeOnPage });
      layoutModeActive = true;
      layoutBtn.textContent = "Exit Layout";
      layoutBtn.classList.add("active");
      addBubble("Layout mode on — drag any element to move it. Click Exit Layout when done.", "system");
    } else {
      const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: stopDragModeOnPage });
      const { changes } = results[0].result;
      if (changes.length > 0) {
        undoStack.push(changes);
        updateUndoBtn();
      }
      layoutModeActive = false;
      layoutBtn.textContent = "Layout";
      layoutBtn.classList.remove("active");
      addBubble(`Layout mode off — ${changes.length} move${changes.length !== 1 ? "s" : ""} recorded. Use Undo to revert.`, "system");
    }
  } catch (e) {
    addBubble("Layout mode error: " + e.message, "system");
  }
}

/* ------------------------------------------------------------------ */
/*  Traffic light buttons                                             */
/* ------------------------------------------------------------------ */

document.querySelector(".tl.close").addEventListener("click", () => window.close());

// Minimize: shrink the panel height briefly as a visual cue (Chrome extensions can't truly minimize)
document.querySelector(".tl.min").addEventListener("click", () => {
  document.body.style.transition = "height 0.2s ease";
  document.body.style.height = "44px";
  document.body.style.overflow = "hidden";
  setTimeout(() => {
    document.body.style.height = "580px";
    document.body.style.overflow = "";
  }, 600);
});

// Maximize: flash a brief scale pulse (Chrome popups can't be resized)
document.querySelector(".tl.max").addEventListener("click", () => {
  document.body.style.transition = "transform 0.15s ease";
  document.body.style.transform = "scale(1.02)";
  setTimeout(() => { document.body.style.transform = ""; }, 200);
});

/* ------------------------------------------------------------------ */
/*  Event listeners                                                   */
/* ------------------------------------------------------------------ */

sendBtn.addEventListener("click", sendMessage);

msgInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

undoBtn.addEventListener("click", undo);
layoutBtn.addEventListener("click", toggleLayoutMode);

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "z") {
    e.preventDefault();
    undo();
  }
});

/* ------------------------------------------------------------------ */
/*  Init                                                              */
/* ------------------------------------------------------------------ */

updateUndoBtn();
scanPageDOM().then(() => {
  if (domSummary && domSummary.length > 0) {
    addBubble(`Scanned page — ${domSummary.length} elements found. Describe what you'd like to change.`, "system");
  } else {
    addBubble("Couldn't scan this page. Navigate to a regular website and reopen.", "system");
  }
});
