# Gmail Smart Calendar 🗓

> An AI-powered Chrome Extension + FastAPI backend that detects time-sensitive academic events from Gmail and adds them to Google Calendar — with your approval.

---

## System Architecture

```
Gmail (Chrome) → content.js
    │
    ├── Regex filter (no API call if no dates/times found)
    │
    └── POST /analyze ──▶ FastAPI backend
                              │
                              └── Groq LLM (llama3-70b)
                                    │
                                    └── Structured JSON event data
                                          │
                              ◀── Floating approval popup shown
                                          │
                              User clicks "Add to Calendar"
                                          │
                              POST /create-event ──▶ Google Calendar API
```

---

## Project Structure

```
gmail-calendar-extension/
├── manifest.json          # Chrome Extension Manifest V3
├── content.js             # Gmail DOM watcher + popup logic
├── styles.css             # Floating card UI styles
├── icons/                 # Extension icons (add your own PNGs)
└── backend/
    ├── main.py            # FastAPI server
    ├── requirements.txt   # Python dependencies
    ├── credentials.json   # ← You add this (Google Cloud)
    └── token.json         # ← Auto-generated after first OAuth
```

---

## Setup Instructions

### Step 1 — Get a Groq API Key

1. Go to [https://console.groq.com](https://console.groq.com)
2. Create a free account → API Keys → Create Key
3. Copy the key

---

### Step 2 — Set Up Google Cloud (Calendar API)

1. Go to [https://console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (e.g., "Gmail Smart Calendar")
3. Enable the **Google Calendar API**:
   - APIs & Services → Library → search "Google Calendar API" → Enable
4. Create OAuth credentials:
   - APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
   - Application type: **Desktop app**
   - Name it anything (e.g., "Smart Calendar Desktop")
   - Click **Download JSON** → rename to `credentials.json`
5. Place `credentials.json` inside the `backend/` folder
6. In OAuth consent screen → Test users → add your Gmail address

---

### Step 3 — Run the Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set Groq API key
export GROQ_API_KEY="your_key_here"
# Windows: set GROQ_API_KEY=your_key_here

# Start the server
uvicorn main:app --reload --port 8000
```

On first run, a browser window will open for Google OAuth. Sign in with your Google account to authorize calendar access. This creates `token.json` automatically.

Verify it's running: [http://localhost:8000/health](http://localhost:8000/health)

---

### Step 4 — Load the Chrome Extension

1. Open Chrome → go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `gmail-calendar-extension/` folder (the root, not `backend/`)
5. The extension appears in your toolbar

---

### Step 5 — Add Extension Icons (Optional)

Place PNG icons in `gmail-calendar-extension/icons/`:
- `icon16.png` — 16×16
- `icon48.png` — 48×48
- `icon128.png` — 128×128

You can use any calendar emoji rendered to PNG, or skip icons entirely by removing the `"icons"` block from `manifest.json`.

---

## How It Works

1. **Open Gmail** and click on any email
2. The extension scans the email for dates, times, and keywords
3. If nothing time-sensitive is found → **no API call made** (saves Groq quota)
4. If time-sensitive content is detected → the email is sent to the backend
5. Groq LLM extracts: title, date, start/end time, description
6. A **floating approval card** appears in the bottom-right of Gmail
7. Click **"Add to Calendar"** → event appears in Google Calendar with reminders
8. Click **"Ignore"** → card dismisses, no event created

---

## Supported Email Types

- 📚 Assignment deadlines
- 🏢 Internship interviews / offers
- 📅 Meetings and seminars
- 🎓 Orientation events
- 🎉 Holiday announcements
- 📝 Exam schedules
- 🔔 Workshop registrations

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Popup not appearing | Check Chrome console (F12) for `[GSC]` logs |
| `GROQ_API_KEY not configured` | Ensure env variable is set before running uvicorn |
| `credentials.json not found` | Download from Google Cloud Console |
| `Failed to reach backend` | Make sure `uvicorn` is running on port 8000 |
| CORS errors | Backend already allows all origins — check if server is running |
| Token expired | Delete `token.json` and restart backend to re-authenticate |

---

## API Reference

### `POST /analyze`
Analyzes an email and returns structured event data.

**Request:**
```json
{
  "subject": "CS301 Assignment Due Tomorrow",
  "body": "Please submit your assignment by 11:59 PM on 2026-04-10.",
  "sender": "prof@university.edu"
}
```

**Response:**
```json
{
  "should_create_event": true,
  "title": "CS301 Assignment Submission",
  "date": "2026-04-10",
  "start_time": "23:59",
  "end_time": "",
  "timezone": "Asia/Kolkata",
  "description": "Submit CS301 assignment by 11:59 PM."
}
```

### `POST /create-event`
Creates the event in Google Calendar (called after user approval).

### `GET /health`
Returns backend and credential status.

---

## Security Notes

- **No auto-creation**: Events are NEVER added without explicit user approval
- **Minimal permissions**: Extension only accesses `mail.google.com`
- **Local processing**: Your email content goes to Groq (their privacy policy applies) and your own Google account
- **Token storage**: `token.json` is local to your machine

---

## Built With

- **Chrome Extension** — Manifest V3, MutationObserver, Content Scripts
- **FastAPI** — Async Python web framework
- **Groq API** — Ultra-fast LLM inference (Llama 3 70B)
- **Google Calendar API** — OAuth2 event creation
- **DM Sans** — Clean sans-serif typography for the popup UI
