"""
Gmail Smart Calendar — FastAPI Backend v3
Changes from v2:
- /extract-event now accepts and logs gmail_id from the request payload
- /calendar/add unchanged
- All legacy routes preserved
"""

import os
import json
import logging
from datetime import datetime, timedelta
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from groq import Groq
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

# ─── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

# ─── Config ───────────────────────────────────────────────────────────────────

GROQ_MODEL          = "llama-3.3-70b-versatile"
GOOGLE_SCOPES       = ["https://www.googleapis.com/auth/calendar.events"]
CREDENTIALS_PATH    = "credentials.json"
TOKEN_PATH          = "token.json"
DEFAULT_TIMEZONE    = "Asia/Kolkata"
DEFAULT_EVENT_HOURS = 1

# ─── Pydantic Models ──────────────────────────────────────────────────────────

class EmailPayload(BaseModel):
    subject: str
    body: str
    sender: str          = ""
    gmail_id: Optional[str] = None   # Gmail thread ID — passed from extension for logging

class EventPayload(BaseModel):
    title: str
    date: str
    start_time: str      = "09:00"
    end_time: str        = ""
    timezone: str        = DEFAULT_TIMEZONE
    description: str     = ""
    should_create_event: bool = True

# ─── Google Calendar ──────────────────────────────────────────────────────────

_calendar_service = None

def get_calendar_service():
    global _calendar_service
    if _calendar_service is not None:
        return _calendar_service

    creds = None
    if os.path.exists(TOKEN_PATH):
        try:
            creds = Credentials.from_authorized_user_file(TOKEN_PATH, GOOGLE_SCOPES)
            log.info("Loaded existing Google OAuth token.")
        except Exception as e:
            log.warning(f"Could not load token.json: {e}")
            creds = None

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
                log.info("Token refreshed.")
            except Exception as e:
                log.warning(f"Refresh failed: {e}")
                creds = None

        if not creds or not creds.valid:
            if not os.path.exists(CREDENTIALS_PATH):
                raise RuntimeError(
                    f"'{CREDENTIALS_PATH}' not found. "
                    "Download from Google Cloud Console → OAuth 2.0 Client IDs → Download JSON."
                )
            log.info("Opening browser for Google OAuth…")
            flow  = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_PATH, GOOGLE_SCOPES)
            creds = flow.run_local_server(port=0, open_browser=True)
            log.info("OAuth completed.")

        with open(TOKEN_PATH, "w") as f:
            f.write(creds.to_json())
        log.info(f"Token saved to '{TOKEN_PATH}'.")

    _calendar_service = build("calendar", "v3", credentials=creds)
    log.info("Google Calendar service ready.")
    return _calendar_service

# ─── Startup ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("=" * 56)
    log.info("Gmail Smart Calendar backend v3 starting…")
    log.info("=" * 56)

    groq_key = os.environ.get("GROQ_API_KEY", "").strip()
    if not groq_key:
        log.warning(
            "\n  GROQ_API_KEY not set!\n"
            "  PowerShell: $env:GROQ_API_KEY = 'your_key_here'\n"
            "  Then restart uvicorn.\n"
        )
    else:
        log.info(f"GROQ_API_KEY detected (…{groq_key[-6:]})")

    if not os.path.exists(CREDENTIALS_PATH):
        log.warning(f"  '{CREDENTIALS_PATH}' missing — Google auth deferred.")
    else:
        try:
            get_calendar_service()
            log.info("Google Calendar ready.")
        except Exception as e:
            log.error(f"Google auth failed: {e}")

    log.info("Docs:   http://localhost:8000/docs")
    log.info("Health: http://localhost:8000/health")
    log.info("=" * 56)
    yield
    log.info("Shutting down.")

# ─── FastAPI App ──────────────────────────────────────────────────────────────

app = FastAPI(
    title="Gmail Smart Calendar API",
    version="3.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Groq LLM ─────────────────────────────────────────────────────────────────

EXTRACTION_PROMPT = """
You are an AI assistant that extracts structured calendar event data from emails sent to college students.

Analyze the email and return ONLY a valid JSON object. No markdown, no explanation, no code fences.

JSON format:
{{
  "should_create_event": true,
  "title": "Concise event title (max 60 chars)",
  "date": "YYYY-MM-DD",
  "start_time": "HH:MM",
  "end_time": "HH:MM",
  "timezone": "Asia/Kolkata",
  "description": "1-2 sentence summary of what the student must do or attend"
}}

Rules:
- Set should_create_event to false if no specific time-sensitive event exists.
- Use 24-hour time format.
- Set end_time to "" if unknown.
- Resolve relative dates ("tomorrow", "next Monday") relative to today: {today}.
- If year is missing and the date is upcoming, use {current_year}.

Email:
Subject: {subject}
From: {sender}
Body:
{body}
"""

def run_groq(subject: str, body: str, sender: str) -> dict:
    groq_key = os.environ.get("GROQ_API_KEY", "").strip()
    if not groq_key:
        raise HTTPException(
            status_code=500,
            detail="GROQ_API_KEY not set. In PowerShell: $env:GROQ_API_KEY = 'your_key_here'"
        )

    client = Groq(api_key=groq_key)
    prompt = EXTRACTION_PROMPT.format(
        subject=subject,
        sender=sender,
        body=body[:3000],
        today=datetime.now().strftime("%Y-%m-%d"),
        current_year=datetime.now().year,
    )

    try:
        resp = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            max_tokens=512,
        )
    except Exception as e:
        log.error(f"Groq API error: {e}")
        raise HTTPException(status_code=502, detail=f"Groq error: {e}")

    raw = resp.choices[0].message.content.strip()
    log.info(f"Groq raw: {raw[:300]}")

    if "```" in raw:
        parts = raw.split("```")
        raw = parts[1] if len(parts) >= 2 else raw
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        log.error(f"JSON parse fail: {e} | raw: {raw}")
        raise HTTPException(status_code=500, detail=f"LLM returned invalid JSON: {e}")

# ─── Calendar event builder ────────────────────────────────────────────────────

def build_gcal_event(event: EventPayload) -> dict:
    try:
        datetime.strptime(event.date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid date '{event.date}'.")

    start_str = event.start_time or "09:00"
    try:
        start_dt = datetime.strptime(f"{event.date} {start_str}", "%Y-%m-%d %H:%M")
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid start_time '{start_str}'.")

    if event.end_time:
        try:
            end_dt = datetime.strptime(f"{event.date} {event.end_time}", "%Y-%m-%d %H:%M")
        except ValueError:
            end_dt = start_dt + timedelta(hours=DEFAULT_EVENT_HOURS)
    else:
        end_dt = start_dt + timedelta(hours=DEFAULT_EVENT_HOURS)

    tz = event.timezone or DEFAULT_TIMEZONE
    return {
        "summary":     event.title,
        "description": event.description,
        "start": {"dateTime": start_dt.isoformat(), "timeZone": tz},
        "end":   {"dateTime": end_dt.isoformat(),   "timeZone": tz},
        "reminders": {
            "useDefault": False,
            "overrides": [
                {"method": "popup", "minutes": 60},
                {"method": "email", "minutes": 1440},
            ],
        },
    }

# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "Gmail Smart Calendar v3 running"}


@app.get("/health")
def health():
    groq_key = os.environ.get("GROQ_API_KEY", "").strip()
    return {
        "status": "ok",
        "groq_configured": bool(groq_key),
        "groq_key_preview": f"…{groq_key[-6:]}" if groq_key else "NOT SET",
        "google_credentials_exist": os.path.exists(CREDENTIALS_PATH),
        "google_token_exists":      os.path.exists(TOKEN_PATH),
        "google_calendar_ready":    _calendar_service is not None,
    }


@app.get("/auth/google")
def auth_google():
    """Force Google OAuth. Navigate to this in browser if startup popup didn't appear."""
    global _calendar_service
    _calendar_service = None
    try:
        get_calendar_service()
        return {"success": True, "message": "Google Calendar authenticated."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/extract-event")
async def extract_event(payload: EmailPayload):
    """
    Stage 2: Called ONLY after user clicks YES in the extension prompt.
    Accepts an optional gmail_id for logging/tracing.
    Returns structured event JSON from Groq.
    """
    if not payload.subject and not payload.body:
        raise HTTPException(status_code=400, detail="Subject and body both empty.")

    gid_label = payload.gmail_id or "no-id"
    log.info(f"[{gid_label}] Groq extraction requested: '{payload.subject[:60]}'")

    result = run_groq(payload.subject, payload.body, payload.sender)

    if result.get("should_create_event") and not result.get("date"):
        log.warning(f"[{gid_label}] Groq returned should_create_event=true but no date — overriding.")
        result["should_create_event"] = False

    log.info(f"[{gid_label}] Extraction result: should_create={result.get('should_create_event')}, date={result.get('date')}")
    return result


@app.post("/calendar/add")
async def calendar_add(event: EventPayload):
    """
    Called ONLY after user approves the event in the popup.
    Creates the event in Google Calendar.
    """
    if not event.should_create_event:
        raise HTTPException(status_code=400, detail="should_create_event is false.")

    log.info(f"Creating event: '{event.title}' on {event.date}")

    try:
        service  = get_calendar_service()
        body     = build_gcal_event(event)
        created  = service.events().insert(calendarId="primary", body=body).execute()

        log.info(f"Created: {created.get('htmlLink')}")
        return {
            "success":    True,
            "event_id":   created.get("id"),
            "event_link": created.get("htmlLink"),
            "message":    f"'{event.title}' added to Google Calendar.",
        }
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"Calendar error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Legacy aliases (backward compatibility) ───────────────────────────────────

@app.post("/analyze")
async def analyze_legacy(payload: EmailPayload):
    return await extract_event(payload)

@app.post("/create-event")
async def create_event_legacy(event: EventPayload):
    return await calendar_add(event)
