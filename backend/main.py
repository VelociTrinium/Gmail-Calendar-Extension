"""
Gmail Smart Calendar — FastAPI Backend
Analyzes emails with Groq LLM and creates Google Calendar events.

FIXES:
- GROQ_API_KEY now read fresh per-request (fixes PowerShell 'set' scoping issue)
- Google OAuth triggers on startup via /auth/google endpoint
- Startup event pre-warms Calendar service so the browser popup appears immediately
- Better error messages pinpoint the exact failure
"""

import os
import json
import logging
from datetime import datetime, timedelta
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from groq import Groq
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

# ─── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
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
    sender: str = ""

class EventPayload(BaseModel):
    title: str
    date: str
    start_time: str  = "09:00"
    end_time: str    = ""
    timezone: str    = DEFAULT_TIMEZONE
    description: str = ""
    should_create_event: bool = True

# ─── Google Calendar ──────────────────────────────────────────────────────────

_calendar_service = None   # Module-level cache; re-used across requests

def get_calendar_service():
    """
    Returns an authenticated Google Calendar service.
    If no valid token exists, opens a browser for OAuth.
    Caches the service object so we only authenticate once per server run.
    """
    global _calendar_service

    # Return cached service if it already exists
    if _calendar_service is not None:
        return _calendar_service

    creds = None

    # Load existing token
    if os.path.exists(TOKEN_PATH):
        try:
            creds = Credentials.from_authorized_user_file(TOKEN_PATH, GOOGLE_SCOPES)
            log.info("Loaded existing Google OAuth token.")
        except Exception as e:
            log.warning(f"Could not load token.json: {e} — will re-authenticate.")
            creds = None

    # Refresh or re-authenticate
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            log.info("Refreshing expired Google OAuth token...")
            try:
                creds.refresh(Request())
                log.info("Token refreshed successfully.")
            except Exception as e:
                log.warning(f"Token refresh failed ({e}), re-authenticating...")
                creds = None

        if not creds or not creds.valid:
            if not os.path.exists(CREDENTIALS_PATH):
                raise RuntimeError(
                    f"'{CREDENTIALS_PATH}' not found in the backend directory.\n"
                    "Download it from: Google Cloud Console -> APIs & Services -> Credentials -> "
                    "OAuth 2.0 Client IDs -> Download JSON -> rename to credentials.json"
                )

            log.info("Opening browser for Google OAuth... (a browser window should appear)")
            flow  = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_PATH, GOOGLE_SCOPES)
            creds = flow.run_local_server(port=0, open_browser=True)
            log.info("OAuth completed successfully.")

        # Persist token for future runs
        with open(TOKEN_PATH, "w") as f:
            f.write(creds.to_json())
        log.info(f"Token saved to '{TOKEN_PATH}'.")

    _calendar_service = build("calendar", "v3", credentials=creds)
    log.info("Google Calendar service ready.")
    return _calendar_service

# ─── Startup: trigger Google OAuth proactively ────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Runs on server startup. Triggers Google OAuth if no valid token exists,
    so the browser popup appears immediately when you start the server.
    """
    log.info("=" * 60)
    log.info("Gmail Smart Calendar backend starting...")
    log.info("=" * 60)

    # Check Groq key early
    groq_key = os.environ.get("GROQ_API_KEY", "").strip()
    if not groq_key:
        log.warning(
            "\n"
            "  WARNING: GROQ_API_KEY is not set!\n"
            "  On Windows PowerShell, use:\n"
            "      $env:GROQ_API_KEY = 'your_key_here'\n"
            "  NOT:  set GROQ_API_KEY=your_key_here  (that is cmd.exe syntax)\n"
            "  After setting it, restart uvicorn.\n"
        )
    else:
        log.info(f"GROQ_API_KEY detected (ends ...{groq_key[-6:]})")

    # Trigger Google OAuth now
    if not os.path.exists(CREDENTIALS_PATH):
        log.warning(
            f"\n"
            f"  WARNING: '{CREDENTIALS_PATH}' not found.\n"
            f"  Download from Google Cloud Console and place it in the backend/ folder.\n"
            f"  Then restart the server.\n"
        )
    else:
        try:
            get_calendar_service()
            log.info("Google Calendar authenticated and ready.")
        except Exception as e:
            log.error(f"Google Calendar setup failed: {e}")

    log.info("Server ready.")
    log.info("  API docs:     http://localhost:8000/docs")
    log.info("  Health check: http://localhost:8000/health")
    log.info("=" * 60)

    yield  # Server runs here

    log.info("Server shutting down.")

# ─── FastAPI App ──────────────────────────────────────────────────────────────

app = FastAPI(
    title="Gmail Smart Calendar API",
    description="AI-powered email-to-calendar event extraction",
    version="1.1.0",
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
You are an AI assistant that extracts structured calendar event data from emails.

Analyze the following email and extract event information.
Return ONLY a valid JSON object. No markdown, no explanation, no code fences.

Required JSON format:
{{
  "should_create_event": true or false,
  "title": "Short descriptive event title",
  "date": "YYYY-MM-DD",
  "start_time": "HH:MM",
  "end_time": "HH:MM",
  "timezone": "Asia/Kolkata",
  "description": "Brief summary of the event"
}}

Rules:
- Set should_create_event to false if no specific time-sensitive event is found.
- Use 24-hour format for times (e.g. 14:30 not 2:30 PM).
- If end_time is unknown, set it to empty string "".
- If the year is not mentioned and the date seems upcoming, use the current year {current_year}.
- For relative dates (e.g., "tomorrow", "next Monday"), resolve them relative to today: {today}.
- Title should be concise and informative (max 60 characters).
- Description should be 1-2 sentences summarizing what the student needs to do or attend.

Email:
Subject: {subject}
From: {sender}
Body:
{body}
"""

def call_groq_llm(subject: str, body: str, sender: str) -> dict:
    """Call Groq API to extract structured event data from email."""

    # Read key fresh every call — fixes Windows PowerShell 'set' scoping issue
    groq_key = os.environ.get("GROQ_API_KEY", "").strip()
    if not groq_key:
        raise HTTPException(
            status_code=500,
            detail=(
                "GROQ_API_KEY is not set. "
                "In PowerShell run: $env:GROQ_API_KEY = 'your_key_here'  "
                "then restart uvicorn in the same terminal."
            )
        )

    client       = Groq(api_key=groq_key)
    today        = datetime.now().strftime("%Y-%m-%d")
    current_year = datetime.now().year

    prompt = EXTRACTION_PROMPT.format(
        subject=subject,
        sender=sender,
        body=body[:3000],
        today=today,
        current_year=current_year,
    )

    log.info(f"Calling Groq ({GROQ_MODEL}) for: '{subject[:60]}'")

    try:
        response = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            max_tokens=512,
        )
    except Exception as e:
        log.error(f"Groq API call failed: {e}")
        raise HTTPException(status_code=502, detail=f"Groq API error: {e}")

    raw = response.choices[0].message.content.strip()
    log.info(f"Groq raw response: {raw[:300]}")

    # Strip markdown code fences if the model adds them despite instructions
    if "```" in raw:
        parts = raw.split("```")
        raw = parts[1] if len(parts) >= 2 else raw
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        log.error(f"JSON parse error: {e}\nRaw output was:\n{raw}")
        raise HTTPException(
            status_code=500,
            detail=f"LLM returned invalid JSON. Error: {e}. Raw: {raw[:200]}"
        )

# ─── Calendar Event Builder ───────────────────────────────────────────────────

def build_event_body(event: EventPayload) -> dict:
    """Build the Google Calendar API event payload."""
    try:
        datetime.strptime(event.date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid date '{event.date}'. Expected YYYY-MM-DD."
        )

    start_time_str = event.start_time or "09:00"
    try:
        start_dt = datetime.strptime(f"{event.date} {start_time_str}", "%Y-%m-%d %H:%M")
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid start_time '{start_time_str}'. Expected HH:MM (24-hour)."
        )

    if event.end_time:
        try:
            end_dt = datetime.strptime(f"{event.date} {event.end_time}", "%Y-%m-%d %H:%M")
        except ValueError:
            end_dt = start_dt + timedelta(hours=DEFAULT_EVENT_HOURS)
    else:
        end_dt = start_dt + timedelta(hours=DEFAULT_EVENT_HOURS)

    return {
        "summary": event.title,
        "description": event.description,
        "start": {
            "dateTime": start_dt.isoformat(),
            "timeZone": event.timezone or DEFAULT_TIMEZONE,
        },
        "end": {
            "dateTime": end_dt.isoformat(),
            "timeZone": event.timezone or DEFAULT_TIMEZONE,
        },
        "reminders": {
            "useDefault": False,
            "overrides": [
                {"method": "popup", "minutes": 60},
                {"method": "email", "minutes": 1440},
            ],
        },
    }

# ─── API Endpoints ────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "Gmail Smart Calendar backend running", "version": "1.1.0"}


@app.get("/health")
def health_check():
    """Open this in your browser to verify everything is wired up correctly."""
    groq_key = os.environ.get("GROQ_API_KEY", "").strip()
    return {
        "status": "ok",
        "groq_configured": bool(groq_key),
        "groq_key_preview": f"...{groq_key[-6:]}" if groq_key else "NOT SET — use $env:GROQ_API_KEY in PowerShell",
        "google_credentials_exist": os.path.exists(CREDENTIALS_PATH),
        "google_token_exists": os.path.exists(TOKEN_PATH),
        "google_calendar_ready": _calendar_service is not None,
    }


@app.get("/auth/google")
def auth_google():
    """
    Manually trigger Google OAuth. Navigate to this URL in your browser
    if the startup popup did not appear, or if your token expired.
    """
    global _calendar_service
    _calendar_service = None   # Force fresh authentication

    try:
        get_calendar_service()
        return {"success": True, "message": "Google Calendar authenticated successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/analyze")
async def analyze_email(payload: EmailPayload):
    """
    Analyze an email with Groq LLM to extract calendar event data.
    Returns structured event info, or { should_create_event: false } if nothing found.
    """
    if not payload.subject and not payload.body:
        raise HTTPException(status_code=400, detail="Both subject and body are empty.")

    result = call_groq_llm(
        subject=payload.subject,
        body=payload.body,
        sender=payload.sender,
    )

    # Safety: if LLM says create but forgot the date, don't proceed
    if result.get("should_create_event") and not result.get("date"):
        log.warning("LLM set should_create_event=true but returned no date — overriding to false.")
        result["should_create_event"] = False

    return result


@app.post("/create-event")
async def create_calendar_event(event: EventPayload):
    """
    Create a Google Calendar event. Called only after user approves in the popup.
    """
    if not event.should_create_event:
        raise HTTPException(status_code=400, detail="should_create_event is false.")

    log.info(f"Creating calendar event: '{event.title}' on {event.date}")

    try:
        service    = get_calendar_service()
        event_body = build_event_body(event)
        created    = service.events().insert(calendarId="primary", body=event_body).execute()

        log.info(f"Event created: {created.get('htmlLink')}")
        return {
            "success":    True,
            "event_id":   created.get("id"),
            "event_link": created.get("htmlLink"),
            "message":    f"'{event.title}' added to Google Calendar.",
        }

    except HTTPException:
        raise
    except Exception as e:
        log.error(f"Calendar API error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
