const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`;

const chatArea = document.getElementById("chatArea");
const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const undoBtn = document.getElementById("undoBtn");

const conversationHistory = [];
const undoStack = [];
let domSummary = null;

/* ------------------------------------------------------------------ */
/*  Textarea auto-resize                                              */
/* ------------------------------------------------------------------ */

function autoResize() {
  msgInput.style.height = "auto";
  msgInput.style.height = msgInput.scrollHeight + "px";
}
msgInput.addEventListener("input", autoResize);

/* ------------------------------------------------------------------ */
/*  Chat helpers                                                      */
/* ------------------------------------------------------------------ */

function scrollToBottom() {
  chatArea.scrollTop = chatArea.scrollHeight;
}

function addBubble(text, role) {
  const div = document.createElement("div");
  div.classList.add("msg", role);
  div.textContent = text;
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
          out.push({
            tag: el.tagName.toLowerCase(),
            selector: sel,
            text: (el.innerText || "").trim().slice(0, 80),
            fontSize: getComputedStyle(el).fontSize,
          });
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

async function executePlan(actions) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (actions) => {
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
          }
        }
        return { snapshot, applied };
      },
      args: [actions],
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

function renderPlanCard(plan) {
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

    const inp = document.createElement("input");
    inp.type = "text";
    inp.classList.add("action-value-input");
    inp.value = a.proposed_value;

    item.append(topRow, tgt, desc, inp);
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
      proposed_value: it.querySelector(".action-value-input").value,
    }));
    if (actions.length === 0) return;
    await executePlan(actions);
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
  if (!text) return;

  addBubble(text, "user");
  msgInput.value = "";
  msgInput.style.height = "auto";
  sendBtn.disabled = true;
  showTyping();

  await scanPageDOM();

  conversationHistory.push({ role: "user", parts: [{ text }] });

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
      renderPlanCard(plan);
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
