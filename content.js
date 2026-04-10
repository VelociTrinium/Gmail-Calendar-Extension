/**
 * Gmail Smart Calendar — Content Script
 * Detects time-sensitive emails, extracts events via AI, and prompts for approval.
 */

// ─── Constants ───────────────────────────────────────────────────────────────

const BACKEND_URL = "http://localhost:8000/analyze";
const POPUP_ID    = "gsc-event-popup";

// Tracks the last processed email subject to avoid duplicate processing
let lastProcessedSubject = null;
let observerAttached     = false;

// ─── Regex Patterns for Time-Sensitivity Detection ───────────────────────────

const TIME_SENSITIVE_PATTERNS = [
  // 1. Enhanced Numeric Dates (Added dots and optional year)
  /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/,            // 12.04.2026, 12/04/26
  /\b\d{4}[./-]\d{1,2}[./-]\d{1,2}\b/,            // 2026-04-12

  // 2. Enhanced Textual Dates (Supports "Jan 12, 2026" and abbreviations with dots)
  /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?(?:\s+\d{2,4})?\b/i,
  /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*,?\s+\d{2,4})?\b/i,

  // 3. Robust Times (Added '9pm' style and Time Zones)
  /\b\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)\b/,      // 2pm, 2:30 PM
  /\b(?:[01]?\d|2[0-3]):[0-5]\d\b/,               // 14:30
  /\b(?:UTC|GMT|EST|PST|IST|CST|CET|JST)\b/,      // Timezone abbreviations

  // 4. Natural Language & Durations
  /\b\d+\s*(?:sec|min|hour|hr|day|week|month)s?\s+(?:ago|later|from now|remaining)\b/i, // "2 hours later"
  /\bin\s+\d+\s*(?:min|hour|day|week)s?\b/i,      // "in 5 minutes"

  // 5. Business Shorthand & Urgency
  /\b(?:EOD|COB|ASAP|urgently|immediately|action\s+required|reminder|expiring)\b/i,

  // 6. Relative & Events (Added 'upcoming' and 'quarter')
  /\b(?:today|tomorrow|tonight|yesterday|now)\b/i,
  /\b(?:this|next|last|upcoming|following)\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|week|month|year|quarter|weekend)\b/i,
  /\bMonday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday\b/i,
  
  // 7. Contextual Keywords (Expanded)
  /\b(?:deadline|due|submit(?:ted|ting)?|submission|cutoff|expire[sd]?|valid)\b/i,
  /\b(?:meeting|interview|internship|orientation|exam|test|quiz|assignment|call|webinar|rsvp|booking)\b/i,
  /\bby\s+(?:end\s+of\s+)?(?:day|week|month|semester|year|business)\b/i,
  /\b(?:schedule[d]?|appointment|event|session|workshop|seminar|alert|notification)\b/i,
];

/**
 * Returns true if the email text contains time-sensitive content.
 */
function isTimeSensitive(subject, body) {
  // Added a check for empty inputs to prevent errors
  const combined = `${subject || ''} ${body || ''}`;
  return TIME_SENSITIVE_PATTERNS.some(pattern => pattern.test(combined));
}

// ─── Gmail DOM Extraction ─────────────────────────────────────────────────────

function extractEmailData() {
  const subjectEl = document.querySelector('h2[data-legacy-thread-id], h2.hP');
  const bodyEl    = document.querySelector('.a3s.aiL, .a3s');
  const senderEl  = document.querySelector('.gD');

  const subject = subjectEl?.innerText?.trim()  || "";
  const body    = bodyEl?.innerText?.trim()     || "";
  const sender  = senderEl?.getAttribute("email") || senderEl?.innerText?.trim() || "";

  return { subject, body, sender };
}

// ─── Backend Call ─────────────────────────────────────────────────────────────

async function analyzeEmail(emailData) {
  try {
    const response = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(emailData),
    });

    if (!response.ok) {
      console.error("[GSC] Backend returned error:", response.status);
      return null;
    }

    return await response.json();
  } catch (err) {
    console.error("[GSC] Failed to reach backend:", err.message);
    return null;
  }
}

// ─── Popup UI ─────────────────────────────────────────────────────────────────

function removeExistingPopup() {
  const existing = document.getElementById(POPUP_ID);
  if (existing) existing.remove();
}

function showApprovalPopup(eventData, onApprove, onReject) {
  removeExistingPopup();

  const {
    title       = "Untitled Event",
    date        = "Unknown date",
    start_time  = "",
    end_time    = "",
    description = "",
    timezone    = "Asia/Kolkata",
  } = eventData;

  const timeStr = start_time
    ? `${formatTime(start_time)}${end_time ? ` – ${formatTime(end_time)}` : ""}`
    : "Time not specified";

  const popup = document.createElement("div");
  popup.id = POPUP_ID;
  popup.className = "gsc-popup";

  popup.innerHTML = `
    <div class="gsc-popup-header">
      <span class="gsc-icon">🗓</span>
      <span class="gsc-label">Event Detected</span>
      <button class="gsc-close" aria-label="Dismiss">✕</button>
    </div>
    <div class="gsc-popup-body">
      <div class="gsc-event-title">${escapeHtml(title)}</div>
      <div class="gsc-meta">
        <div class="gsc-meta-item">
          <span class="gsc-meta-icon">📅</span>
          <span>${escapeHtml(date)}</span>
        </div>
        <div class="gsc-meta-item">
          <span class="gsc-meta-icon">🕐</span>
          <span>${escapeHtml(timeStr)}</span>
        </div>
        ${description ? `
        <div class="gsc-meta-item gsc-description">
          <span class="gsc-meta-icon">📝</span>
          <span>${escapeHtml(description.substring(0, 120))}${description.length > 120 ? "…" : ""}</span>
        </div>` : ""}
      </div>
    </div>
    <div class="gsc-popup-actions">
      <button class="gsc-btn gsc-btn-reject">Ignore</button>
      <button class="gsc-btn gsc-btn-approve">Add to Calendar</button>
    </div>
    <div class="gsc-status" id="gsc-status"></div>
  `;

  document.body.appendChild(popup);

  // Wire up buttons
  popup.querySelector(".gsc-close").addEventListener("click", () => {
    removeExistingPopup();
    onReject?.();
  });

  popup.querySelector(".gsc-btn-reject").addEventListener("click", () => {
    removeExistingPopup();
    onReject?.();
  });

  popup.querySelector(".gsc-btn-approve").addEventListener("click", async () => {
    const statusEl = popup.querySelector("#gsc-status");
    const approveBtn = popup.querySelector(".gsc-btn-approve");

    approveBtn.disabled = true;
    approveBtn.textContent = "Adding…";
    statusEl.textContent = "";
    statusEl.className = "gsc-status";

    const result = await onApprove?.();

    if (result?.success) {
      statusEl.textContent = "✓ Added to Google Calendar!";
      statusEl.className = "gsc-status gsc-status-success";
      setTimeout(() => removeExistingPopup(), 2500);
    } else {
      statusEl.textContent = result?.error || "Failed to add event. Check backend.";
      statusEl.className = "gsc-status gsc-status-error";
      approveBtn.disabled = false;
      approveBtn.textContent = "Retry";
    }
  });

  // Animate in
  requestAnimationFrame(() => popup.classList.add("gsc-popup-visible"));
}

// ─── Calendar Event Creation ──────────────────────────────────────────────────

async function createCalendarEvent(eventData) {
  try {
    const response = await fetch("http://localhost:8000/create-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(eventData),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { success: false, error: err?.detail || `Server error ${response.status}` };
    }

    return await response.json();
  } catch (err) {
    return { success: false, error: `Network error: ${err.message}` };
  }
}

// ─── Main Processing Pipeline ─────────────────────────────────────────────────

async function processCurrentEmail() {
  const { subject, body, sender } = extractEmailData();

  if (!subject && !body) return;   // Nothing to process
  if (subject === lastProcessedSubject) return;  // Already processed

  if (!isTimeSensitive(subject, body)) {
    console.log("[GSC] Skipping — no time-sensitive content detected.");
    return;
  }

  console.log("[GSC] Time-sensitive email detected. Subject:", subject);
  lastProcessedSubject = subject;

  const eventData = await analyzeEmail({ subject, body, sender });
  if (!eventData) return;

  if (!eventData.should_create_event) {
    console.log("[GSC] LLM decided no meaningful event found.");
    return;
  }

  console.log("[GSC] Event extracted:", eventData);

  showApprovalPopup(
    eventData,
    async () => createCalendarEvent(eventData),   // onApprove
    () => console.log("[GSC] User rejected event.") // onReject
  );
}

// ─── SPA Navigation Observer ─────────────────────────────────────────────────

function setupObserver() {
  if (observerAttached) return;
  observerAttached = true;

  let debounceTimer = null;

  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      // Only trigger when an email thread appears to be open
      const emailOpen = document.querySelector(".a3s, .a3s.aiL");
      if (emailOpen) processCurrentEmail();
    }, 600);
  });

  observer.observe(document.body, { childList: true, subtree: true });
  console.log("[GSC] MutationObserver attached.");
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

function formatTime(timeStr) {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour   = ((h % 12) || 12);
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

setupObserver();
console.log("[GSC] Gmail Smart Calendar extension loaded.");
