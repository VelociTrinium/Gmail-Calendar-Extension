const STORAGE_PREFIX = "gsc_email_";

// ── Scan button ───────────────────────────────────────────────
document.getElementById("scan").addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"]
    });
    window.close();
});

// ── Clear memory button ───────────────────────────────────────
document.getElementById("clear").addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Ask content script to clear its localStorage keys
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (prefix) => {
            Object.keys(localStorage)
                .filter(k => k.startsWith(prefix))
                .forEach(k => localStorage.removeItem(k));

            // Also reset data-ai-checked flags so emails can be re-processed
            document.querySelectorAll('[data-ai-checked]').forEach(el => {
                delete el.dataset.aiChecked;
                delete el.dataset.aiPopupShown;
            });
        },
        args: [STORAGE_PREFIX]
    });

    renderLog([]);
});

// ── Read localStorage from the active tab and render log ─────
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
        args: [STORAGE_PREFIX]
    });

    const records = results?.[0]?.result || [];
    renderLog(records);
}

function renderLog(records) {
    const logEl = document.getElementById("log");

    if (records.length === 0) {
        logEl.innerHTML = '<div class="empty">No events processed yet.</div>';
        return;
    }

    logEl.innerHTML = records.map(r => {
        const ev    = r.extracted_event;
        const title = ev?.title || r.email_id?.replace(/^gsc_email_/, "").substring(0, 40) || "Unknown";
        const date  = ev?.date  || "—";
        const action = r.user_action || "pending";
        const ts    = r.timestamp ? new Date(r.timestamp).toLocaleDateString("en-IN", { day:"2-digit", month:"short" }) : "";

        return `
            <div class="log-item">
                <div class="li-title" title="${escHtml(title)}">${escHtml(title)}</div>
                <div class="li-meta">
                    <span class="badge ${action}">${action}</span>
                    <span class="li-date">${escHtml(date)}</span>
                    <span class="li-date" style="margin-left:auto">${ts}</span>
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

// Load on open
loadLog();
