// ============================================================
// PART 1: EXISTING CLASSIFICATION ENGINE (DO NOT MODIFY)
// ============================================================

// ---------------- 1. THE RULE ENGINE ----------------
const classificationRules = [
    // {
    //     id: "work",
    //     backgroundColor: "#cce5ff8a",
    //     textColor: "inherit",
    //     senders: ["boss@mycompany.com"],
    //     subjects: ["meeting", "project update", "urgent"],
    //     contents: ["zoom link", "google meet"]
    // },
    {
        id: "internship",
        backgroundColor: "#68eb8688",
        textColor: "inherit",
        senders: ["careers@", "jobs@", "hr@"],
        subjects: ["internship", "application status", "offer"],
        contents: ["stipend", "months duration", "role"]
    },
    {
        id: "nptel",
        backgroundColor: "#f8d7da8a",
        textColor: "inherit",
        senders: ["@nptel.iitm.ac.in", "swayam", "onlinecourses@nptel.iitm.ac.in", "support@nptel.iitm.ac.in"],
        subjects: ["certificate", "exam registration"],
        contents: []
    },
    {
        id: "chotadhobi",
        backgroundColor: "#c054f28a",
        textColor: "inherit",
        senders: ["boss@mycompany.com"],
        subjects: ["Chotadhobi", "Laundry ", "Delivery Confirmation"],
        contents: []
    },
    {
        id: "moovit",
        backgroundColor: "#7061f07f",
        textColor: "inherit",
        senders: ["noreply.moovit@vit.ac.in"],
        subjects: ["Moovit", "assignment", "quiz"],
        contents: ["assignment", "quiz"]
    },
    {
        id: "academic",
        backgroundColor: "#7061f07f",
        textColor: "inherit",
        senders: [],
        subjects: ["Lab", "Fat", "Cat"],
        contents: ["assignment", "quiz"]
    },
];

// ---------------- 2. DATA EXTRACTION ----------------
function extractEmailData(row) {
    let senderEl    = row.querySelector('[email]');
    let senderEmail = senderEl ? senderEl.getAttribute('email').toLowerCase() : "";

    // let mailHeaderEl = row.querySelector('.y6');
    // let mailHeader   = mailHeaderEl ? mailHeaderEl.innerText.toLowerCase() : "";

    let snippetEl = row.querySelector('.y2');
    let snippet   = snippetEl ? snippetEl.innerText.toLowerCase() : "";

    let subjectEl = row.querySelector('.bog');
    let subject   = subjectEl ? subjectEl.innerText.toLowerCase() : "";

    return { senderEmail, snippet, subject };
    // return { senderEmail, mailHeader, snippet, subject };
}

// ---------------- 3. CLASSIFICATION LOGIC ----------------
function getEmailCategory(data) {
    const matchesAny = (keywords, targetText) => {
        if (!keywords || keywords.length === 0) return false;
        return keywords.some(keyword => targetText.includes(keyword.toLowerCase()));
    };

    for (let rule of classificationRules) {
        if (matchesAny(rule.senders,   data.senderEmail)) return rule;
        // if (matchesAny(rule.mailHeader, data.mailHeader)) return rule;
        if (matchesAny(rule.contents,  data.snippet))    return rule;
        if (matchesAny(rule.subjects,  data.subject))    return rule;
    }
    return null;
}

// ---------------- 4. HIGHLIGHT FUNCTION ----------------
function highlightEmails() {
    let emails = document.querySelectorAll('tr[jscontroller]:not([data-processed="true"])');

    emails.forEach(row => {
        let emailData   = extractEmailData(row);
        let matchedRule = getEmailCategory(emailData);

        if (matchedRule) {
            row.style.backgroundColor = matchedRule.backgroundColor;
            row.style.color           = matchedRule.textColor;
            row.style.transition      = "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)";
            row.style.position        = "relative";

            let accentColor = matchedRule.backgroundColor.substring(0, 7);
            row.style.borderLeft = `6px solid ${accentColor}`;

            let subjectEl = row.querySelector('.bog');
            if (subjectEl) {
                if (!subjectEl.querySelector('.custom-badge')) {
                    const badge = document.createElement('span');
                    badge.className = 'custom-badge';
                    badge.innerText = matchedRule.id.toUpperCase();

                    Object.assign(badge.style, {
                        backgroundColor: accentColor,
                        color: matchedRule.textColor === "inherit" ? "white" : matchedRule.textColor,
                        fontSize: "10px",
                        fontWeight: "bold",
                        padding: "2px 8px",
                        borderRadius: "10px",
                        marginLeft: "8px",
                        verticalAlign: "middle",
                        display: "inline-block",
                        boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
                    });

                    subjectEl.appendChild(badge);
                }
            }

            row.addEventListener("mouseover", () => {
                row.style.boxShadow = "inset 8px 0 0 0 " + accentColor + ", 0 4px 12px rgba(0,0,0,0.1)";
                row.style.filter    = "brightness(0.95)";
                row.style.cursor    = "pointer";
            });

            row.addEventListener("mouseout", () => {
                row.style.boxShadow = "none";
                row.style.filter    = "none";
            });
        } else {
            row.style.opacity = "1";
        }

        row.dataset.processed = "true";
    });
}

// ---------------- OPENED EMAIL HIGHLIGHTER ----------------
function highlightOpenedEmail() {
    let header = document.querySelector('.ha');
    if (!header || header.dataset.processed) return;

    let subject = document.querySelector('h2')?.innerText || "";
    let text    = subject.toLowerCase();

    if (text.includes("internship"))                              header.style.backgroundColor = "#d4edda";
    else if (text.includes("holiday") || text.includes("announcement")) header.style.backgroundColor = "#fff3cd";
    else if (text.includes("assignment") || text.includes("meeting"))   header.style.backgroundColor = "#cce5ff";

    header.dataset.processed = "true";
}

// ---------------- URL CHANGE DETECTOR ----------------
let lastUrl = location.href;

function observeUrlChange() {
    const observer = new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            setTimeout(() => highlightEmails(), 2000);
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

const _headerObserver = new MutationObserver(() => highlightOpenedEmail());
_headerObserver.observe(document.body, { childList: true, subtree: true });

// ---------------- LIVE EMAIL DETECTOR ----------------
function observeEmailChanges() {
    const observer = new MutationObserver(() => highlightEmails());
    observer.observe(document.body, { childList: true, subtree: true });
}

// ---------------- INIT ----------------
function init() {
    highlightEmails();
    observeUrlChange();
    observeEmailChanges();
}

init();


// ============================================================
// PART 2: AI EVENT DETECTION LAYER (SEPARATE — does not touch Part 1)
// ============================================================

const AI = (() => {

    // ── Constants ────────────────────────────────────────────
    const BACKEND         = "http://localhost:8000";
    const POPUP_ID        = "gsc-ai-popup";
    const STORAGE_PREFIX  = "gsc_email_";

    // ── Time-sensitive regex patterns ────────────────────────
    const PATTERNS = [
        /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/,
        /\b\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}\b/,
        /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b/i,
        /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?\b/i,
        /\b\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)\b/,
        /\b(?:[01]?\d|2[0-3]):[0-5]\d\b/,
        /\b(?:today|tomorrow|tonight|yesterday)\b/i,
        /\b(?:this|next|last)\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|week|month)\b/i,
        /\bMonday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday\b/i,
        /\b(?:deadline|due\s+(?:date|by)|submission|submit(?:ting)?)\b/i,
        /\b(?:meeting|interview|exam|test|quiz|workshop|seminar|orientation)\b/i,
        /\bby\s+(?:end\s+of\s+)?(?:today|tomorrow|day|week|month)\b/i,
        /\bschedule[d]?|appointment|session\b/i,
    ];

    // ── Storage helpers ───────────────────────────────────────

    function makeKey(subject, sender) {
        // Simple stable key from first 60 chars of subject + sender domain
        const s = (subject + "|" + sender).substring(0, 80).replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_@.|]/g, "");
        return STORAGE_PREFIX + s;
    }

    function loadRecord(key) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch { return null; }
    }

    function saveRecord(key, record) {
        try {
            localStorage.setItem(key, JSON.stringify({ ...record, timestamp: Date.now() }));
        } catch (e) { console.warn("[GSC] localStorage write failed:", e); }
    }

    // ── DOM extraction (opened email) ─────────────────────────

    function getOpenedEmailData() {
        const subject = document.querySelector('h2.hP, h2[data-legacy-thread-id], h2')?.innerText?.trim() || "";
        const body    = document.querySelector('.a3s.aiL, .a3s')?.innerText?.trim() || "";
        const sender  = document.querySelector('.gD')?.getAttribute("email") || document.querySelector('.gD')?.innerText?.trim() || "";
        return { subject, body, sender };
    }

    // ── Regex fast check ─────────────────────────────────────

    function isTimeSensitive(subject, body) {
        const text = subject + " " + body;
        return PATTERNS.some(p => p.test(text));
    }

    // ── Popup system ─────────────────────────────────────────

    function removePopup() {
        document.getElementById(POPUP_ID)?.remove();
    }

    /**
     * stage: "prompt" | "loading" | "event" | "approved" | "error"
     * data: varies per stage
     */
    function renderPopup(stage, data = {}) {
        removePopup();

        const wrap = document.createElement("div");
        wrap.id = POPUP_ID;

        // Shared wrapper styles injected via class (see style.css)
        // We inject a <style> tag once so we don't need a separate CSS file load
        if (!document.getElementById("gsc-styles")) {
            const style = document.createElement("style");
            style.id = "gsc-styles";
            style.textContent = `
                @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap');

                #gsc-ai-popup {
                    position: fixed;
                    bottom: 24px;
                    right: 24px;
                    z-index: 999999;
                    width: 320px;
                    background: #0f1117;
                    border: 1px solid #2a2d3a;
                    border-radius: 12px;
                    box-shadow: 0 0 0 1px rgba(255,255,255,0.04), 0 24px 48px rgba(0,0,0,0.55);
                    font-family: 'IBM Plex Sans', sans-serif;
                    font-size: 13px;
                    color: #e2e8f0;
                    overflow: hidden;
                    opacity: 0;
                    transform: translateY(12px) scale(0.98);
                    transition: opacity 0.22s ease, transform 0.25s cubic-bezier(0.34,1.56,0.64,1);
                }
                #gsc-ai-popup.gsc-visible {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
                .gsc-top-bar {
                    display: flex;
                    align-items: center;
                    gap: 7px;
                    padding: 10px 14px;
                    background: #161820;
                    border-bottom: 1px solid #1e2130;
                }
                .gsc-dot {
                    width: 7px; height: 7px;
                    border-radius: 50%;
                    background: #4ade80;
                    box-shadow: 0 0 6px #4ade8088;
                    flex-shrink: 0;
                }
                .gsc-dot.amber { background: #fbbf24; box-shadow: 0 0 6px #fbbf2488; }
                .gsc-dot.red   { background: #f87171; box-shadow: 0 0 6px #f8717188; }
                .gsc-top-label {
                    flex: 1;
                    font-family: 'IBM Plex Mono', monospace;
                    font-size: 10px;
                    font-weight: 500;
                    letter-spacing: 0.1em;
                    text-transform: uppercase;
                    color: #64748b;
                }
                .gsc-close-btn {
                    background: none; border: none; cursor: pointer;
                    color: #475569; font-size: 14px; line-height: 1;
                    padding: 2px 4px; border-radius: 4px;
                    transition: color 0.15s, background 0.15s;
                }
                .gsc-close-btn:hover { color: #e2e8f0; background: #1e2130; }
                .gsc-body { padding: 14px 14px 10px; }
                .gsc-message {
                    font-size: 13px;
                    line-height: 1.5;
                    color: #94a3b8;
                    margin-bottom: 12px;
                }
                .gsc-message strong { color: #e2e8f0; font-weight: 600; }
                .gsc-event-title {
                    font-size: 14px;
                    font-weight: 600;
                    color: #f1f5f9;
                    margin-bottom: 10px;
                    line-height: 1.35;
                }
                .gsc-meta { display: flex; flex-direction: column; gap: 5px; margin-bottom: 10px; }
                .gsc-meta-row {
                    display: flex; align-items: center; gap: 8px;
                    font-family: 'IBM Plex Mono', monospace;
                    font-size: 11px; color: #64748b;
                }
                .gsc-meta-row span:last-child { color: #94a3b8; }
                .gsc-actions { display: flex; gap: 8px; padding: 8px 14px 14px; }
                .gsc-btn {
                    flex: 1; padding: 8px 10px;
                    border: none; border-radius: 8px;
                    font-family: 'IBM Plex Sans', sans-serif;
                    font-size: 12px; font-weight: 500;
                    cursor: pointer; transition: all 0.15s;
                    line-height: 1;
                }
                .gsc-btn:disabled { opacity: 0.45; cursor: not-allowed; }
                .gsc-btn-ghost {
                    background: #1e2130; color: #64748b;
                    border: 1px solid #2a2d3a;
                }
                .gsc-btn-ghost:hover:not(:disabled) { background: #252837; color: #94a3b8; }
                .gsc-btn-primary {
                    background: #4ade80; color: #0a0f0d;
                    font-weight: 600;
                    box-shadow: 0 0 16px #4ade8033;
                }
                .gsc-btn-primary:hover:not(:disabled) {
                    background: #86efac; box-shadow: 0 0 20px #4ade8055;
                    transform: translateY(-1px);
                }
                .gsc-btn-danger {
                    background: #1e2130; color: #f87171;
                    border: 1px solid #2a2d3a;
                }
                .gsc-btn-danger:hover:not(:disabled) { background: #2a1a1a; }
                .gsc-loader {
                    display: flex; align-items: center; gap: 10px;
                    padding: 4px 0 8px;
                    font-family: 'IBM Plex Mono', monospace;
                    font-size: 11px; color: #4ade80;
                }
                .gsc-spinner {
                    width: 14px; height: 14px;
                    border: 2px solid #1e2130;
                    border-top-color: #4ade80;
                    border-radius: 50%;
                    animation: gsc-spin 0.7s linear infinite;
                }
                @keyframes gsc-spin { to { transform: rotate(360deg); } }
                .gsc-status { padding: 6px 14px 10px; font-size: 11px; font-weight: 500; }
                .gsc-status.ok  { color: #4ade80; }
                .gsc-status.err { color: #f87171; }
                .gsc-chip {
                    display: inline-block;
                    background: #1e2130; border: 1px solid #2a2d3a;
                    border-radius: 6px; padding: 3px 8px;
                    font-family: 'IBM Plex Mono', monospace;
                    font-size: 10px; color: #4ade80; margin-top: 4px;
                }
            `;
            document.head.appendChild(style);
        }

        // Build inner HTML per stage
        if (stage === "prompt") {
            wrap.innerHTML = `
                <div class="gsc-top-bar">
                    <div class="gsc-dot amber"></div>
                    <span class="gsc-top-label">Smart Calendar · Scan</span>
                    <button class="gsc-close-btn" id="gsc-x">✕</button>
                </div>
                <div class="gsc-body">
                    <div class="gsc-message">
                        <strong>⚡ Time-sensitive content detected.</strong><br>
                        This email may contain an event, deadline, or meeting. Extract it?
                    </div>
                </div>
                <div class="gsc-actions">
                    <button class="gsc-btn gsc-btn-ghost" id="gsc-no">No, skip</button>
                    <button class="gsc-btn gsc-btn-primary" id="gsc-yes">Yes, extract →</button>
                </div>
            `;
            document.body.appendChild(wrap);
            requestAnimationFrame(() => wrap.classList.add("gsc-visible"));

            document.getElementById("gsc-x").onclick  = () => { removePopup(); data.onNo?.(); };
            document.getElementById("gsc-no").onclick = () => { removePopup(); data.onNo?.(); };
            document.getElementById("gsc-yes").onclick = () => { removePopup(); data.onYes?.(); };

        } else if (stage === "loading") {
            wrap.innerHTML = `
                <div class="gsc-top-bar">
                    <div class="gsc-dot"></div>
                    <span class="gsc-top-label">Smart Calendar · Extracting</span>
                </div>
                <div class="gsc-body">
                    <div class="gsc-loader">
                        <div class="gsc-spinner"></div>
                        <span>Calling Groq API…</span>
                    </div>
                    <div class="gsc-message" style="margin:0; font-size:11px;">Analyzing email content for events.</div>
                </div>
            `;
            document.body.appendChild(wrap);
            requestAnimationFrame(() => wrap.classList.add("gsc-visible"));

        } else if (stage === "event") {
            const ev = data.event;
            const timeStr = ev.start_time
                ? `${fmtTime(ev.start_time)}${ev.end_time ? ` – ${fmtTime(ev.end_time)}` : ""}`
                : "Time not specified";

            wrap.innerHTML = `
                <div class="gsc-top-bar">
                    <div class="gsc-dot"></div>
                    <span class="gsc-top-label">Smart Calendar · Review</span>
                    <button class="gsc-close-btn" id="gsc-x">✕</button>
                </div>
                <div class="gsc-body">
                    <div class="gsc-event-title">${esc(ev.title || "Untitled Event")}</div>
                    <div class="gsc-meta">
                        <div class="gsc-meta-row"><span>📅</span><span>${esc(ev.date || "Unknown date")}</span></div>
                        <div class="gsc-meta-row"><span>🕐</span><span>${esc(timeStr)}</span></div>
                        ${ev.description ? `<div class="gsc-meta-row" style="align-items:flex-start"><span>📝</span><span style="color:#64748b">${esc(ev.description.substring(0,110))}${ev.description.length>110?"…":""}</span></div>` : ""}
                    </div>
                </div>
                <div class="gsc-actions">
                    <button class="gsc-btn gsc-btn-danger" id="gsc-reject">✕ Ignore</button>
                    <button class="gsc-btn gsc-btn-primary" id="gsc-approve">Add to Calendar</button>
                </div>
                <div class="gsc-status" id="gsc-st"></div>
            `;
            document.body.appendChild(wrap);
            requestAnimationFrame(() => wrap.classList.add("gsc-visible"));

            document.getElementById("gsc-x").onclick = () => { removePopup(); data.onReject?.(); };
            document.getElementById("gsc-reject").onclick = () => { removePopup(); data.onReject?.(); };
            document.getElementById("gsc-approve").onclick = async () => {
                const btn = document.getElementById("gsc-approve");
                const st  = document.getElementById("gsc-st");
                btn.disabled = true;
                btn.textContent = "Adding…";
                const result = await data.onApprove?.();
                if (result?.success) {
                    st.className = "gsc-status ok";
                    st.textContent = "✓ Added to Google Calendar!";
                    setTimeout(() => removePopup(), 2400);
                } else {
                    st.className = "gsc-status err";
                    st.textContent = result?.error || "Failed — check backend.";
                    btn.disabled = false;
                    btn.textContent = "Retry";
                }
            };

        } else if (stage === "already_added") {
            wrap.innerHTML = `
                <div class="gsc-top-bar">
                    <div class="gsc-dot"></div>
                    <span class="gsc-top-label">Smart Calendar</span>
                    <button class="gsc-close-btn" id="gsc-x">✕</button>
                </div>
                <div class="gsc-body">
                    <div class="gsc-message">
                        <strong>✓ Already added to calendar.</strong><br>
                        <span class="gsc-chip">${esc(data.title || "")}</span>
                    </div>
                </div>
                <div class="gsc-actions">
                    <button class="gsc-btn gsc-btn-ghost" id="gsc-ok">Dismiss</button>
                </div>
            `;
            document.body.appendChild(wrap);
            requestAnimationFrame(() => wrap.classList.add("gsc-visible"));
            document.getElementById("gsc-x").onclick  = removePopup;
            document.getElementById("gsc-ok").onclick = removePopup;
            setTimeout(removePopup, 4000);

        } else if (stage === "error") {
            wrap.innerHTML = `
                <div class="gsc-top-bar">
                    <div class="gsc-dot red"></div>
                    <span class="gsc-top-label">Smart Calendar · Error</span>
                    <button class="gsc-close-btn" id="gsc-x">✕</button>
                </div>
                <div class="gsc-body">
                    <div class="gsc-message" style="color:#f87171">${esc(data.message || "Unexpected error.")}</div>
                </div>
                <div class="gsc-actions">
                    <button class="gsc-btn gsc-btn-ghost" id="gsc-ok">Dismiss</button>
                </div>
            `;
            document.body.appendChild(wrap);
            requestAnimationFrame(() => wrap.classList.add("gsc-visible"));
            document.getElementById("gsc-x").onclick  = removePopup;
            document.getElementById("gsc-ok").onclick = removePopup;
        }
    }

    // ── API calls ─────────────────────────────────────────────

    async function callExtractEvent(subject, body, sender) {
        const res = await fetch(`${BACKEND}/extract-event`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email_id: makeKey(subject, sender), subject, body, sender }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err?.detail || `Backend error ${res.status}`);
        }
        return res.json();
    }

    async function callAddCalendar(event) {
        try {
            const res = await fetch(`${BACKEND}/calendar/add`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(event),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                return { success: false, error: err?.detail || `Server ${res.status}` };
            }
            return res.json();
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    // ── Main pipeline ─────────────────────────────────────────

    async function processOpenedEmail(emailView) {
        // Deduplication guard on the email container element
        if (emailView.dataset.aiChecked) return;
        emailView.dataset.aiChecked = "true";

        const { subject, body, sender } = getOpenedEmailData();
        if (!subject && !body) return;

        const storageKey = makeKey(subject, sender);
        const record     = loadRecord(storageKey);

        // ── Case A: Already approved — show brief confirmation ──
        if (record?.user_action === "approved") {
            renderPopup("already_added", { title: record.extracted_event?.title || subject });
            return;
        }

        // ── Case B: Previously rejected but event was extracted ──
        //    Show the event preview again (allow reconsideration) without re-calling Groq
        if (record?.user_action === "rejected" && record?.extracted_event) {
            emailView.dataset.aiPopupShown = "true";
            renderPopup("event", {
                event: record.extracted_event,
                onReject: () => {
                    // Keep as rejected
                    saveRecord(storageKey, { ...record, user_action: "rejected" });
                },
                onApprove: async () => {
                    const result = await callAddCalendar(record.extracted_event);
                    if (result?.success) {
                        saveRecord(storageKey, { ...record, user_action: "approved" });
                    }
                    return result;
                },
            });
            return;
        }

        // ── Case C: Exists but no extracted event — restart full flow ──
        if (record && !record.extracted_event) {
            runStage1(subject, body, sender, storageKey, emailView);
            return;
        }

        // ── Default: First time seeing this email ──
        runStage1(subject, body, sender, storageKey, emailView);
    }

    function runStage1(subject, body, sender, storageKey, emailView) {
        // Regex check — no API call
        if (!isTimeSensitive(subject, body)) return;

        // Guard: don't show popup twice
        if (emailView.dataset.aiPopupShown) return;
        emailView.dataset.aiPopupShown = "true";

        // Stage 1 prompt popup
        renderPopup("prompt", {
            onNo: () => {
                // User dismissed — save minimal record so we don't re-prompt immediately
                saveRecord(storageKey, {
                    email_id: storageKey,
                    extracted_event: null,
                    user_action: "rejected",
                });
            },
            onYes: () => runStage2(subject, body, sender, storageKey),
        });
    }

    async function runStage2(subject, body, sender, storageKey) {
        // Show loading spinner
        renderPopup("loading");

        let eventData;
        try {
            eventData = await callExtractEvent(subject, body, sender);
        } catch (e) {
            renderPopup("error", { message: `Extraction failed: ${e.message}` });
            return;
        }

        // Groq says no meaningful event
        if (!eventData?.should_create_event) {
            saveRecord(storageKey, {
                email_id: storageKey,
                extracted_event: null,
                user_action: "rejected",
            });
            removePopup();
            return;
        }

        // Save extracted event with pending status
        const record = {
            email_id: storageKey,
            extracted_event: eventData,
            user_action: "pending",
        };
        saveRecord(storageKey, record);

        // Show event preview popup
        renderPopup("event", {
            event: eventData,
            onReject: () => {
                saveRecord(storageKey, { ...record, user_action: "rejected" });
            },
            onApprove: async () => {
                const result = await callAddCalendar(eventData);
                if (result?.success) {
                    saveRecord(storageKey, { ...record, user_action: "approved" });
                }
                return result;
            },
        });
    }

    // ── MutationObserver — watch for email opens ──────────────

    let debounceTimer = null;

    const aiObserver = new MutationObserver(() => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            // An email view is open when .a3s exists
            const emailBody = document.querySelector('.a3s.aiL, .a3s');
            if (!emailBody) return;

            // Walk up to find the closest container we can tag
            const emailView = emailBody.closest('.aHU, .gs, [role="main"]') || emailBody;
            processOpenedEmail(emailView);
        }, 700);
    });

    aiObserver.observe(document.body, { childList: true, subtree: true });

    // ── Helpers ───────────────────────────────────────────────

    function esc(str) {
        const d = document.createElement("div");
        d.appendChild(document.createTextNode(String(str)));
        return d.innerHTML;
    }

    function fmtTime(t) {
        if (!t) return "";
        const [h, m] = t.split(":").map(Number);
        const suffix = h >= 12 ? "PM" : "AM";
        return `${(h % 12) || 12}:${String(m).padStart(2, "0")} ${suffix}`;
    }

    return { removePopup }; // Expose minimal API for debugging
})();
