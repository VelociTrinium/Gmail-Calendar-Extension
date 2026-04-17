# Gmail Smart Calendar — v3

> AI-powered Chrome Extension + FastAPI backend. Detects time-sensitive academic events from Gmail, extracts structured event data with Groq LLM, and adds them to Google Calendar — with your approval.

---

## System Architecture

```
Gmail (Chrome Tab)
  │
  ├─ Part 1: Rule Engine (unchanged)
  │    └─ Highlights inbox emails with color badges
  │
  └─ Part 2: AI Event Detection Layer (isolated)
       │
       ├─ Email opened → extract Gmail Thread ID from URL hash
       │
       ├─ localStorage check (keyed by Gmail Thread ID)
       │    ├─ APPROVED  → show "Already added" notice
       │    ├─ REJECTED + event cached → show event preview again
       │    └─ NEW → run regex filter
       │
       ├─ Regex: time/date keywords → Stage 1 popup: "Extract event?"
       │
       └─ User clicks YES → POST /extract-event
              │
              └─ Groq LLM (llama3-70b, temp=0)
                     │
                     └─ Structured JSON event
                            │
                     Stage 2 popup: "Add to Calendar?"
                            │
                     User approves → POST /calendar/add
                            │
                     Google Calendar API (events.insert)
                            │
                     localStorage updated: user_action = "approved"
```

---

## Project Structure

```
gmail-calendar-extension/       ← Load this folder as unpacked extension
├── manifest.json
├── content.js                  ← Part 1: highlighting + Part 2: AI layer
├── styles.css
├── popup.html                  ← Extension popup (memory log + scan button)
├── popup.js
└── backend/
    ├── main.py                 ← FastAPI server
    ├── requirements.txt
    ├── credentials.json        ← You add this (Google Cloud Console)
    └── token.json              ← Auto-generated after first OAuth
```

---

## Gmail API Integration — How Gmail IDs Are Obtained

### Strategy

This extension does **not** use the Gmail REST API for ID retrieval, which would require additional OAuth scopes, a service worker, and token management inside the extension context. Instead, it uses two **zero-cost** sources:

#### Source 1: URL Hash Parsing (Primary — 100% reliable)

Gmail updates the URL fragment every time you open an email, even without a page reload (SPA navigation). The thread ID is always the last alphanumeric segment of the hash:

```
https://mail.google.com/mail/u/0/#inbox/FMfcgzQXKBmPqRvTlWsNjHdCyGbVpZnX
                                          └─────────────────────────────────┘
                                            Gmail Thread ID (stable, permanent)
```

Other URL patterns handled:
```
#all/THREAD_ID
#sent/THREAD_ID
#search/query/THREAD_ID
#label/LABEL_NAME/THREAD_ID
```

The extractor scans from right to left across the hash segments and returns the first long alphanumeric token (≥10 chars):

```javascript
function getGmailIdFromUrl() {
    const parts = location.hash.replace('#', '').split('/');
    for (let i = parts.length - 1; i >= 0; i--) {
        if (/^[A-Za-z0-9]{10,}$/.test(parts[i])) return parts[i];
    }
    return null;
}
```

#### Source 2: DOM Attribute (Fallback)

Gmail stamps the thread ID on several DOM elements:

```javascript
document.querySelector('[data-legacy-thread-id]')?.dataset?.legacyThreadId
document.querySelector('[data-thread-id]')?.dataset?.threadId
```

#### Source 3: Subject + Sender Hash (Last Resort)

If neither URL nor DOM yields an ID (e.g., in unusual Gmail embed contexts), a sanitized string from `subject|sender` is used as the key. The popup log shows `⚠ fallback` for these entries so you can identify them.

### Why Gmail Thread IDs Are Reliable

| Property | Detail |
|---|---|
| **Permanent** | Assigned by Google at message creation; never changes |
| **Unique** | No two threads share an ID, even across accounts |
| **Available without API** | Embedded in the page URL and DOM |
| **SPA-safe** | Gmail updates the URL hash on every email open |
| **Cross-session stable** | The same thread ID persists across browser restarts |

---

## Storage Architecture

### Schema

Each email is stored in `localStorage` under the key `gsc_gmail_<THREAD_ID>`:

```json
{
  "gmail_id":        "FMfcgzQXKBmPqRvTlWsNjHdCyGbVpZnX",
  "extracted_event": {
    "should_create_event": true,
    "title":       "CS301 Assignment Submission",
    "date":        "2026-04-10",
    "start_time":  "23:59",
    "end_time":    "",
    "timezone":    "Asia/Kolkata",
    "description": "Submit CS301 assignment by 11:59 PM."
  },
  "user_action": "approved",
  "timestamp":   1712760000000
}
```

### `user_action` Values

| Value | Meaning |
|---|---|
| `"pending"` | Groq extracted an event; user hasn't decided yet |
| `"approved"` | User clicked "Add to Calendar"; event was created |
| `"rejected"` | User clicked "Ignore" OR said "No" at Stage 1 prompt |

---

## Event Caching Logic (The Four Cases)

When an email is opened, the system checks localStorage **before** any API call:

```
Gmail ID resolved
       │
       ▼
Check localStorage
       │
       ├─── CASE A: user_action = "approved"
       │    → Show "✓ Already added to calendar" notice (4s auto-dismiss)
       │    → Zero API calls
       │
       ├─── CASE B: user_action = "rejected" AND extracted_event exists
       │    → Show the event preview popup again (reconsideration allowed)
       │    → Zero API calls (use cached Groq response)
       │
       ├─── CASE C: Record exists but extracted_event = null
       │    → User previously said "No" at Stage 1 prompt
       │    → Re-run regex check; show Stage 1 prompt again if time-sensitive
       │    → Zero Groq calls
       │
       └─── CASE D: Gmail ID not in storage (brand new email)
            → Run regex filter
            → If match: show Stage 1 prompt
            → If user says YES: call Groq
            → Store result regardless of outcome
```

---

## Duplicate Prevention

Three independent guards prevent redundant processing:

| Guard | Mechanism | Prevents |
|---|---|---|
| `lastProcessedGmailId` | Module-level variable | Re-processing same email on every MutationObserver tick |
| `popupIsShown` | Module-level boolean | Stacking multiple popups from rapid DOM changes |
| `localStorage` lookup | Checked before regex and Groq | API calls for emails already cached |

**Note:** The previous version used `emailView.dataset.aiChecked` as a DOM flag. This was replaced with `lastProcessedGmailId` because Gmail reuses the same container `div` for different emails during SPA navigation. A DOM flag on the container would persist across email changes and block processing of newly opened emails.

---

## Updated System Flow

```
1. User opens email in Gmail
2. MutationObserver detects .a3s element (email body)
3. Gmail Thread ID extracted from URL hash
4. lastProcessedGmailId check → skip if same as last run
5. localStorage lookup by Gmail ID:
     ├─ Approved → "Already added" notice
     ├─ Rejected + event → reconsideration popup
     └─ New → regex scan
6. Regex detects dates/times/keywords → Stage 1 popup
7. User clicks YES → POST /extract-event (gmail_id + email content)
8. Groq returns structured JSON
9. Stored in localStorage with user_action = "pending"
10. Stage 2 popup: event title / date / time
11. User approves → POST /calendar/add
12. Event created in Google Calendar with 1hr + 1day reminders
13. localStorage updated to user_action = "approved"
```

---

## Setup Instructions

### Step 1 — Groq API Key

1. [https://console.groq.com](https://console.groq.com) → API Keys → Create Key

### Step 2 — Google Cloud

1. [Google Cloud Console](https://console.cloud.google.com) → New Project
2. APIs & Services → Library → **Google Calendar API** → Enable
3. Credentials → Create → OAuth 2.0 Client ID → Desktop app → Download JSON
4. Rename downloaded file to `credentials.json` → place in `backend/`
5. OAuth consent screen → Test Users → add your Gmail

### Step 3 — Run Backend

```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate

pip install -r requirements.txt

# Set Groq key (PowerShell syntax)
$env:GROQ_API_KEY = "your_groq_key_here"

uvicorn main:app --reload --port 8000
```

A browser window opens for Google OAuth on first run. Verify at [http://localhost:8000/health](http://localhost:8000/health).

If the OAuth browser popup doesn't appear, navigate to [http://localhost:8000/auth/google](http://localhost:8000/auth/google) manually.

### Step 4 — Load Extension

1. Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select the root extension folder
4. Open Gmail and click any email

---

## Troubleshooting

| Problem | Solution |
|---|---|
| No popup appearing | Check Chrome console for `[GSC]` logs |
| Gmail ID shows as fallback | Gmail URL may not have the thread ID in the hash; DOM extraction also failed — check URL format |
| `GROQ_API_KEY not set` | Use `$env:GROQ_API_KEY = '...'` in PowerShell (not `set`) |
| `credentials.json not found` | Download OAuth JSON from Google Cloud Console |
| Backend 502 error | Groq API issue; check your key is valid at console.groq.com |
| Token expired | Delete `token.json` and restart backend |
| Popup appears but "Add to Calendar" fails | Run `http://localhost:8000/health` to check calendar readiness |

---

## API Reference

### `POST /extract-event`

```json
{
  "gmail_id": "FMfcgzQXKBmPqRvTlWsNjHdCyGbVpZnX",
  "subject":  "CS301 Assignment Due Tomorrow",
  "body":     "Please submit by 11:59 PM on 2026-04-10.",
  "sender":   "prof@university.edu"
}
```

**Response:**
```json
{
  "should_create_event": true,
  "title":       "CS301 Assignment Submission",
  "date":        "2026-04-10",
  "start_time":  "23:59",
  "end_time":    "",
  "timezone":    "Asia/Kolkata",
  "description": "Submit CS301 assignment by 11:59 PM."
}
```

### `POST /calendar/add`
Accepts the same JSON structure as the Groq response. Called only after user approval.

### `GET /health`
Returns backend status including Groq key, credentials, and Calendar service readiness.

### `GET /auth/google`
Triggers Google OAuth flow manually. Use if startup popup didn't appear.

---

## Built With

- **Chrome Extension** — Manifest V3, MutationObserver, localStorage
- **FastAPI** — Async Python web framework  
- **Groq API** — Ultra-fast LLM inference (Llama 3 70B, temperature=0)
- **Google Calendar API** — OAuth2 desktop app flow
- **IBM Plex Mono + IBM Plex Sans** — Extension popup typography
