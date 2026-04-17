const STORAGE_PREFIX = "gsc_gmail_";   // Must match AI.STORAGE_PREFIX in content.js

// ── Scan button ───────────────────────────────────────────────────────────────
document.getElementById("scan").addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    window.close();
});

// ── Clear memory ──────────────────────────────────────────────────────────────
document.getElementById("clear").addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (prefix) => {
            Object.keys(localStorage)
                .filter(k => k.startsWith(prefix))
                .forEach(k => localStorage.removeItem(k));
        },
        args: [STORAGE_PREFIX],
    });

    renderLog([]);
});

// ── Load log from active tab's localStorage ───────────────────────────────────
async function loadLog() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (prefix) => {
            return Object.keys(localStorage)
                .filter(k => k.startsWith(prefix))
                .map(k => {
                    try { return JSON.parse(localStorage.getItem(k)); }
                    catch { return null; }
                })
                .filter(Boolean)
                .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        },
        args: [STORAGE_PREFIX],
    });

    renderLog(results?.[0]?.result || []);
}

function renderLog(records) {
    const logEl = document.getElementById("log");

    if (!records.length) {
        logEl.innerHTML = '<div class="empty">No events processed yet.</div>';
        return;
    }

    logEl.innerHTML = records.map(r => {
        const ev     = r.extracted_event;
        const title  = ev?.title || "No event extracted";
        const date   = ev?.date  || "—";
        const action = r.user_action || "pending";
        const gmailId = (r.gmail_id || "").replace("fallback_", "");
        const isFallback = (r.gmail_id || "").startsWith("fallback_");
        const ts     = r.timestamp
            ? new Date(r.timestamp).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
            : "";

        return `
            <div class="log-item">
                <div class="li-title" title="${escHtml(title)}">${escHtml(title)}</div>
                <div class="li-meta">
                    <span class="badge ${escHtml(action)}">${escHtml(action)}</span>
                    <span class="li-date">${escHtml(date)}</span>
                    <span class="li-date" style="margin-left:auto">${ts}</span>
                </div>
                <div class="li-id" title="${escHtml(gmailId)}">
                    ${isFallback ? "⚠ fallback" : "🔑"} ${escHtml(gmailId.substring(0, 20))}${gmailId.length > 20 ? "…" : ""}
                </div>
            </div>
        `;
    }).join("");
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

loadLog();
