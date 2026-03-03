const ACTIONS = {
  edit_text: { label: "Edit Text", property: "textContent" },
  change_font_size: { label: "Font Size", property: "fontSize" },
};

function buildSystemPrompt(domSummaryJson) {
  return `You are a web page editor assistant. You help users modify elements on web pages.

You receive a JSON summary of visible DOM elements on the current page. Each element has: tag, selector (CSS), text content, and current font size.

RULES:
1. When the user asks to modify the page, respond with a brief natural-language explanation followed by a JSON plan inside a \`\`\`json code fence.
2. When the user asks a general question (not about page edits), respond normally — no JSON.
3. ONLY use CSS selectors that appear in the DOM summary below. Never invent selectors.
4. ONLY use these actions: "edit_text", "change_font_size".

JSON PLAN SCHEMA — return EXACTLY this structure inside the json fence:
{
  "plan": [
    {
      "action": "edit_text | change_font_size",
      "target": "exact CSS selector from the DOM summary",
      "description": "brief human-readable explanation of this change",
      "proposed_value": "the new value"
    }
  ],
  "confidence": 0.0 to 1.0
}

FIELD RULES:
- action: "edit_text" or "change_font_size" — nothing else.
- target: a selector copied verbatim from the DOM summary.
- description: one sentence explaining what this change does.
- proposed_value: for edit_text the new text content; for change_font_size a CSS value like "24px" or "1.5rem".
- confidence: how certain you are the plan matches the user's intent (0.0–1.0).

CURRENT PAGE DOM SUMMARY:
${domSummaryJson}`;
}

function extractPlan(text) {
  const m = text.match(/```json\s*([\s\S]*?)```/);
  if (!m) return null;
  try {
    return JSON.parse(m[1].trim());
  } catch {
    return null;
  }
}

function validatePlan(plan) {
  if (!plan || typeof plan !== "object") return false;
  if (!Array.isArray(plan.plan) || plan.plan.length === 0) return false;
  if (typeof plan.confidence !== "number" || plan.confidence < 0 || plan.confidence > 1) return false;

  for (const a of plan.plan) {
    if (!ACTIONS[a.action]) return false;
    if (typeof a.target !== "string" || !a.target) return false;
    if (typeof a.proposed_value !== "string") return false;
    if (typeof a.description !== "string") return false;
  }
  return true;
}

function getCleanText(text) {
  return text.replace(/```json\s*[\s\S]*?```/g, "").trim();
}
