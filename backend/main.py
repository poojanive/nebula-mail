from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

from email.mime.text import MIMEText
from email import message_from_bytes
from email.header import decode_header, make_header

from dotenv import load_dotenv
from google import genai
from google.cloud import pubsub_v1

import base64
import os
import json
import re
import threading
import time
from html.parser import HTMLParser
from datetime import date


# ==================================================
# Gemini configuration
# ==================================================

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY is not configured")

gemini_client = genai.Client(
    api_key=GEMINI_API_KEY
)


# ==================================================
# Gmail configuration
# ==================================================


SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
]

TOKEN_FILE = "token.json"
GOOGLE_CLOUD_PROJECT = "nebula-mail-507618"
PUBSUB_TOPIC = "gmail-notifications"
PUBSUB_SUBSCRIPTION = "gmail-notifications-sub"
GMAIL_WATCH_STATE_FILE = "gmail_watch_state.json"

# Real-time Gmail sync state
sync_version = 0
last_gmail_notification = None
pubsub_thread = None

# ==================================================
# FastAPI application
# ==================================================

app = FastAPI(title="Nebula Mail API")


# ==================================================
# CORS
# ==================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://nebula-mail-tau.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================================================
# Request models
# ==================================================

class EmailRequest(BaseModel):
    to: EmailStr
    subject: str
    body: str


class ReplyRequest(BaseModel):
    to: EmailStr
    subject: str
    body: str
    message_id: str | None = None
    thread_id: str | None = None


class AnalyzeEmailRequest(BaseModel):
    email: dict


class AssistantRequest(BaseModel):
    message: str
    context: dict | None = None


# ==================================================
# Gmail connection
# ==================================================

def get_gmail_service():

    try:

        credentials = Credentials.from_authorized_user_file(
            TOKEN_FILE,
            SCOPES
        )

        if credentials.expired and credentials.refresh_token:

            credentials.refresh(Request())

            with open(TOKEN_FILE, "w") as token_file:
                token_file.write(
                    credentials.to_json()
                )

        gmail = build(
            "gmail",
            "v1",
            credentials=credentials
        )

        return gmail

    except Exception as error:

        print(
            "Gmail authentication error:",
            error
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to connect to Gmail"
        )


# ==================================================
# Home
# ==================================================

@app.get("/")
def home():

    return {
        "message": "Nebula Mail backend is running"
    }


# ==================================================
# Health
# ==================================================

@app.get("/api/health")
def health():

    return {
        "status": "ok"
    }

# ==================================================
# Gmail Push Notification Watch
# ==================================================

@app.post("/api/gmail/watch")
def start_gmail_watch():
    try:
        gmail = get_gmail_service()

        topic_name = (
            f"projects/{GOOGLE_CLOUD_PROJECT}"
            f"/topics/{PUBSUB_TOPIC}"
        )

        watch_request = {
            "labelIds": ["INBOX"],
            "labelFilterBehavior": "INCLUDE",
            "topicName": topic_name
        }

        response = gmail.users().watch(
            userId="me",
            body=watch_request
        ).execute()

        watch_state = {
            "historyId": response.get("historyId"),
            "expiration": response.get("expiration"),
            "topic": topic_name
        }

        with open(
            GMAIL_WATCH_STATE_FILE,
            "w"
        ) as state_file:
            json.dump(
                watch_state,
                state_file,
                indent=2
            )

        print("\nGmail Watch started successfully!")
        print("Topic:", topic_name)
        print("History ID:", response.get("historyId"))
        print("Expiration:", response.get("expiration"))

        return {
            "success": True,
            "message": "Gmail push notifications enabled",
            "historyId": response.get("historyId"),
            "expiration": response.get("expiration"),
            "topic": topic_name
        }

    except Exception as error:
        print(
            "Gmail Watch error:",
            error
        )

        raise HTTPException(
            status_code=500,
            detail=str(error)
        )
# ==================================================
# Gmail Pub/Sub real-time listener
# ==================================================

def start_pubsub_listener():
    """Listen for Gmail push notifications from Pub/Sub."""

    global sync_version
    global last_gmail_notification

    subscriber = pubsub_v1.SubscriberClient()

    subscription_path = subscriber.subscription_path(
        GOOGLE_CLOUD_PROJECT,
        PUBSUB_SUBSCRIPTION
    )

    def callback(message):
        global sync_version
        global last_gmail_notification

        try:
            print("\nGmail notification received!")

            notification_data = message.data.decode("utf-8")
            print("Notification:", notification_data)

            # Increment this value so the frontend can detect that
            # Gmail has changed and refresh the visible mailbox.
            sync_version += 1
            last_gmail_notification = time.time()

            message.ack()

            print("Notification acknowledged")
            print("Sync version:", sync_version)

        except Exception as error:
            print("Pub/Sub callback error:", error)
            message.nack()

    print("\nStarting Gmail Pub/Sub listener...")
    print("Subscription:", subscription_path)

    streaming_pull_future = subscriber.subscribe(
        subscription_path,
        callback=callback
    )

    try:
        streaming_pull_future.result()
    except Exception as error:
        print("Pub/Sub listener stopped:", error)
        streaming_pull_future.cancel()
    finally:
        subscriber.close()


@app.on_event("startup")
def startup_pubsub_listener():
    global pubsub_thread

    if pubsub_thread is None:
        pubsub_thread = threading.Thread(
            target=start_pubsub_listener,
            daemon=True
        )
        pubsub_thread.start()

        print("Gmail real-time listener started")


@app.get("/api/sync-status")
def get_sync_status():
    return {
        "syncVersion": sync_version,
        "lastNotification": last_gmail_notification
    }


# ==================================================
# Get Inbox
# ==================================================

@app.get("/api/emails")
def get_emails(limit: int = 20):

    gmail = get_gmail_service()

    try:

        results = gmail.users().messages().list(
            userId="me",
            labelIds=["INBOX"],
            maxResults=limit
        ).execute()

        messages = results.get(
            "messages",
            []
        )

        emails = []

        for message in messages:

            message_data = gmail.users().messages().get(
                userId="me",
                id=message["id"],
                format="metadata",
                metadataHeaders=[
                    "From",
                    "To",
                    "Subject",
                    "Date",
                    "Message-ID"
                ]
            ).execute()

            headers = message_data[
                "payload"
            ].get(
                "headers",
                []
            )

            email_info = {
                "id": message["id"],
                "threadId": message_data.get(
                    "threadId",
                    ""
                ),
                "messageId": "",
                "from": "",
                "to": "",
                "subject": "",
                "date": "",
                "snippet": message_data.get(
                    "snippet",
                    ""
                ),
                "isRead": "UNREAD" not in message_data.get(
                    "labelIds",
                    []
                )
            }

            for header in headers:

                name = header["name"]
                value = header["value"]

                if name == "From":
                    email_info["from"] = decode_mime_header(value)

                elif name == "To":
                    email_info["to"] = decode_mime_header(value)

                elif name == "Subject":
                    email_info["subject"] = decode_mime_header(value)

                elif name == "Date":
                    email_info["date"] = decode_mime_header(value)

                elif name.lower() == "message-id":
                    email_info["messageId"] = value

            emails.append(email_info)

        return {
            "count": len(emails),
            "emails": emails
        }

    except Exception as error:

        print(
            "Gmail API error:",
            error
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve emails"
        )


# ==================================================
# Get Sent Emails
# ==================================================

@app.get("/api/sent")
def get_sent_emails(limit: int = 20):

    gmail = get_gmail_service()

    try:

        results = gmail.users().messages().list(
            userId="me",
            labelIds=["SENT"],
            maxResults=limit
        ).execute()

        messages = results.get(
            "messages",
            []
        )

        emails = []

        for message in messages:

            message_data = gmail.users().messages().get(
                userId="me",
                id=message["id"],
                format="metadata",
                metadataHeaders=[
                    "From",
                    "To",
                    "Subject",
                    "Date",
                    "Message-ID"
                ]
            ).execute()

            headers = message_data[
                "payload"
            ].get(
                "headers",
                []
            )

            # Gmail header names are case-insensitive.
            # Build a lookup so older/unusual sent messages are
            # parsed reliably as well.
            header_map = {
                header.get("name", "").lower(): decode_mime_header(header.get("value", ""))
                for header in headers
            }

            recipient = header_map.get("to", "")

            # Some sent messages may not contain a To header.
            # Use Cc/Bcc as a useful fallback instead of showing
            # "Unknown" in the frontend.
            if not recipient:
                recipient = header_map.get("cc", "")

            if not recipient:
                recipient = header_map.get("bcc", "")

            email_info = {
                "id": message["id"],
                "from": header_map.get("from", ""),
                "to": recipient,
                "subject": header_map.get("subject", ""),
                "date": header_map.get("date", ""),
                "snippet": message_data.get(
                    "snippet",
                    ""
                ),
                "isRead": True,
                "threadId": message_data.get(
                    "threadId",
                    ""
                ),
                "messageId": header_map.get(
                    "message-id",
                    ""
                )
            }

            emails.append(email_info)

        return {
            "count": len(emails),
            "emails": emails
        }

    except Exception as error:

        print(
            "Gmail Sent API error:",
            error
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve sent emails"
        )


# ==================================================
# MIME header decoding
# ==================================================

def decode_mime_header(value: str) -> str:
    """Decode Gmail MIME-encoded headers into normal readable text."""

    if not value:
        return ""

    try:
        return str(make_header(decode_header(value))).strip()
    except Exception:
        # Keep the original value if a malformed header is encountered.
        return value.strip()


# ==================================================
# HTML email body cleanup
# ==================================================

class EmailHTMLParser(HTMLParser):

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.ignore_content = False

    def handle_starttag(self, tag, attrs):

        tag = tag.lower()

        if tag in {"script", "style", "head", "title"}:
            self.ignore_content = True
            return

        # <br> is an explicit line break. For block elements, wait until
        # the closing tag so nested containers do not create large gaps.
        if tag == "br":
            self.parts.append("\n")

    def handle_endtag(self, tag):

        tag = tag.lower()

        if tag in {"script", "style", "head", "title"}:
            self.ignore_content = False
            return

        if tag in {
            "p",
            "div",
            "section",
            "article",
            "tr",
            "li",
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6"
        }:
            self.parts.append("\n")

    def handle_data(self, data):

        if not self.ignore_content:
            self.parts.append(data)


def html_to_text(html_content: str) -> str:

    parser = EmailHTMLParser()
    parser.feed(html_content)
    parser.close()

    text = "".join(parser.parts)

    # Normalize whitespace without letting nested HTML containers create
    # large blank spaces in the rendered email.
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"[ \t]*\n[ \t]*", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


def decode_email_part(part) -> str:

    payload = part.get_payload(decode=True)

    if not payload:
        return ""

    charset = part.get_content_charset() or "utf-8"

    try:
        return payload.decode(
            charset,
            errors="replace"
        )
    except LookupError:
        return payload.decode(
            "utf-8",
            errors="replace"
        )


def extract_email_body(email_message) -> str:

    plain_text = ""
    html_text = ""

    if email_message.is_multipart():

        for part in email_message.walk():

            content_type = part.get_content_type()

            # Ignore attachments.
            if part.get_content_disposition() == "attachment":
                continue

            if content_type == "text/plain" and not plain_text:
                plain_text = decode_email_part(part)

            elif content_type == "text/html" and not html_text:
                html_text = decode_email_part(part)

    else:

        content_type = email_message.get_content_type()

        if content_type == "text/plain":
            plain_text = decode_email_part(email_message)

        elif content_type == "text/html":
            html_text = decode_email_part(email_message)

    # Some senders incorrectly label an HTML document as text/plain.
    # If the plain-text part actually contains HTML markup, clean it too.
    if plain_text.strip():
        if re.search(
            r"<\s*(?:!doctype|html|head|body|table|tbody|tr|td|div|p|span|a|img|style|meta)\b",
            plain_text,
            flags=re.IGNORECASE
        ):
            cleaned_plain_text = html_to_text(plain_text)
            if cleaned_plain_text:
                return cleaned_plain_text

        return plain_text.strip()

    # Fall back to readable text extracted from an actual HTML part.
    if html_text.strip():
        return html_to_text(html_text)

    return ""


# ==================================================
# Get Email Detail
# ==================================================


@app.get("/api/emails/{email_id}")
def get_email_detail(email_id: str):

    gmail = get_gmail_service()

    try:

        message_data = gmail.users().messages().get(
            userId="me",
            id=email_id,
            format="raw"
        ).execute()

        raw_data = base64.urlsafe_b64decode(
            message_data["raw"]
        )

        email_message = message_from_bytes(
            raw_data
        )

        # Extract a readable email body.
        # Prefer text/plain, then safely convert HTML emails
        # into normal readable text instead of displaying raw HTML.
        body = extract_email_body(email_message)

        return {
            "id": email_id,
            "threadId": message_data.get(
                "threadId",
                ""
            ),
            "messageId": email_message.get(
                "Message-ID",
                ""
            ),
            "from": decode_mime_header(email_message.get(
                "From",
                ""
            )),
            "to": decode_mime_header(email_message.get(
                "To",
                ""
            )),
            "subject": decode_mime_header(email_message.get(
                "Subject",
                "(No Subject)"
            )),
            "date": decode_mime_header(email_message.get(
                "Date",
                ""
            )),
            "body": body
        }

    except Exception as error:

        print(
            "Gmail detail error:",
            error
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve email"
        )


# ==================================================
# Send New Email
# ==================================================

@app.post("/api/send-email")
def send_email(email: EmailRequest):

    try:

        gmail = get_gmail_service()

        message = MIMEText(
            email.body
        )

        message["To"] = email.to
        message["Subject"] = email.subject

        raw_message = base64.urlsafe_b64encode(
            message.as_bytes()
        ).decode()

        gmail_message = {
            "raw": raw_message
        }

        sent_message = gmail.users().messages().send(
            userId="me",
            body=gmail_message
        ).execute()

        print(
            "\nEmail sent successfully!"
        )

        print(
            "To:",
            email.to
        )

        print(
            "Subject:",
            email.subject
        )

        print(
            "Gmail message ID:",
            sent_message["id"]
        )

        return {
            "message": "Email sent successfully through Gmail",
            "to": email.to,
            "subject": email.subject,
            "id": sent_message["id"]
        }

    except Exception as error:

        print(
            "Gmail send error:",
            error
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to send email through Gmail"
        )


# ==================================================
# Reply to Email
# ==================================================

@app.post("/api/reply-email")
def reply_email(reply: ReplyRequest):

    try:

        gmail = get_gmail_service()

        message = MIMEText(
            reply.body
        )

        message["To"] = reply.to
        message["Subject"] = reply.subject

        # Proper email reply headers
        if reply.message_id:

            message["In-Reply-To"] = reply.message_id
            message["References"] = reply.message_id

        raw_message = base64.urlsafe_b64encode(
            message.as_bytes()
        ).decode()

        gmail_message = {
            "raw": raw_message
        }

        # Keep reply in same Gmail thread
        if reply.thread_id:

            gmail_message["threadId"] = reply.thread_id

        sent_message = gmail.users().messages().send(
            userId="me",
            body=gmail_message
        ).execute()

        print(
            "\nReply sent successfully!"
        )

        print(
            "To:",
            reply.to
        )

        print(
            "Subject:",
            reply.subject
        )

        print(
            "Gmail message ID:",
            sent_message["id"]
        )

        return {
            "message": "Reply sent successfully through Gmail",
            "to": reply.to,
            "subject": reply.subject,
            "id": sent_message["id"]
        }

    except Exception as error:

        print(
            "Gmail reply error:",
            error
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to send reply through Gmail"
        )


# ==================================================
# AI EMAIL INTELLIGENCE
# ==================================================

@app.post("/api/analyze-email")
def analyze_email(request: AnalyzeEmailRequest):

    try:

        email_data = request.email or {}

        # Keep the information sent to Gemini focused on the email itself.
        email_context = {
            "from": email_data.get("from", ""),
            "to": email_data.get("to", ""),
            "subject": email_data.get("subject", ""),
            "date": email_data.get("date", ""),
            "body": email_data.get("body", ""),
            "snippet": email_data.get("snippet", "")
        }

        prompt = f"""
You are the email intelligence engine inside an email application
called Nebula Mail.

Analyze the email below and return ONLY valid JSON.

EMAIL:
{json.dumps(email_context, ensure_ascii=False)}

Classify the email using these rules.

CATEGORY:
Choose exactly ONE:
- Work
- College
- Personal
- Promotion
- Other

PRIORITY:
Choose exactly ONE:
- High
- Medium
- Low

SUMMARY:
Write a concise summary in 1 or 2 sentences.
Do not invent information that is not present in the email.

ACTION NEEDED:
Return true if the recipient appears to need to do something,
reply, confirm, attend, submit, decide, pay, review, or otherwise
take action based on the email. Otherwise return false.

REASON:
Give a short explanation for the priority and whether action is needed.
Only use information supported by the email.

Return exactly this JSON structure:

{{
    "category": "Work",
    "priority": "High",
    "summary": "Short summary of the email.",
    "actionNeeded": true,
    "reason": "The email contains a time-sensitive request requiring a response."
}}

IMPORTANT:
- Return JSON only.
- Do not use markdown.
- Do not add explanations outside the JSON.
- Do not invent dates, deadlines, people, or actions.
- Use boolean true/false for actionNeeded, not strings.
"""

        response = gemini_client.models.generate_content(
            model="gemini-3.6-flash",
            contents=prompt,
            config={
                "response_mime_type": "application/json"
            }
        )

        analysis = json.loads(response.text)

        # Validate the most important fields before returning them.
        valid_categories = {
            "Work",
            "College",
            "Personal",
            "Promotion",
            "Other"
        }

        valid_priorities = {
            "High",
            "Medium",
            "Low"
        }

        if analysis.get("category") not in valid_categories:
            analysis["category"] = "Other"

        if analysis.get("priority") not in valid_priorities:
            analysis["priority"] = "Medium"

        analysis["actionNeeded"] = bool(
            analysis.get("actionNeeded", False)
        )

        if not isinstance(analysis.get("summary"), str):
            analysis["summary"] = ""

        if not isinstance(analysis.get("reason"), str):
            analysis["reason"] = ""

        print("\nAI Email Intelligence")
        print("Subject:", email_data.get("subject", ""))
        print("Analysis:", analysis)

        return {
            "success": True,
            "analysis": analysis
        }

    except json.JSONDecodeError as error:

        print(
            "AI Email Intelligence JSON error:",
            error
        )

        raise HTTPException(
            status_code=500,
            detail="AI email analysis returned invalid JSON"
        )

    except Exception as error:

        print(
            "AI Email Intelligence error:",
            error
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to analyze email"
        )

# ==================================================
# AI ASSISTANT
# ==================================================

@app.post("/api/assistant")
def assistant(request: AssistantRequest):

    try:

        # --------------------------------------------------
        # Get frontend context
        # --------------------------------------------------

        context = request.context or {}

        # --------------------------------------------------
        # Handle simple navigation commands directly
        # --------------------------------------------------
        # These commands do not need Gemini. Handling them
        # directly also prevents a temporary Gemini 503 error
        # from breaking Inbox/Sent navigation.

        command_lower = request.message.lower().strip()

        if (
            "sent" in command_lower
            and (
                "show" in command_lower
                or "open" in command_lower
                or "go" in command_lower
                or "mail" in command_lower
                or "email" in command_lower
            )
        ):
            print("\nAI Assistant Command:", request.message)
            print("Direct Action: sent")

            return {
                "success": True,
                "action": {
                    "action": "sent"
                }
            }

        if (
            "inbox" in command_lower
            and (
                "show" in command_lower
                or "open" in command_lower
                or "go" in command_lower
            )
        ):
            print("\nAI Assistant Command:", request.message)
            print("Direct Action: inbox")

            return {
                "success": True,
                "action": {
                    "action": "inbox"
                }
            }

        current_email = context.get(
            "selectedEmail"
        ) or {}

        current_folder = context.get(
            "currentFolder",
            "inbox"
        )

        today = date.today().isoformat()


        # --------------------------------------------------
        # Gemini prompt
        # --------------------------------------------------

        prompt = f"""
You are the AI assistant inside a Gmail-like web application
called Nebula Mail.

Your job is to understand the user's natural language command
and convert it into EXACTLY ONE UI action.

Today's date is:
{today}

Current folder:
{current_folder}

User command:
{request.message}

Currently opened email:
{json.dumps(current_email)}

Return ONLY valid JSON.

Do not use markdown.
Do not add explanations.
Do not wrap the JSON in code fences.


==================================================
ACTION 1: compose
==================================================

Use this when the user wants to write or compose an email.

Example:

"Send an email to john@example.com saying the meeting is tomorrow"

Return:

{{
    "action": "compose",
    "to": "john@example.com",
    "subject": "",
    "body": "The meeting is tomorrow"
}}

If the user provides a subject, include it.

If the user does not provide a subject,
leave subject as an empty string.


==================================================
ACTION 2: search
==================================================

Use this when the user wants to find or filter emails.

Return:

{{
    "action": "search",
    "query": "",
    "from": "",
    "after": "",
    "before": ""
}}

Examples:

"Find emails from Sarah"

Return:

{{
    "action": "search",
    "query": "",
    "from": "Sarah",
    "after": "",
    "before": ""
}}

"Find emails about internship"

Return:

{{
    "action": "search",
    "query": "internship",
    "from": "",
    "after": "",
    "before": ""
}}

"Show emails from LinkedIn"

Return:

{{
    "action": "search",
    "query": "LinkedIn",
    "from": "",
    "after": "",
    "before": ""
}}

"Show emails from the last 10 days"

Calculate the date 10 days before today
and put it in the "after" field using YYYY-MM-DD.

Example:

{{
    "action": "search",
    "query": "",
    "from": "",
    "after": "YYYY-MM-DD",
    "before": ""
}}


==================================================
ACTION 3: open_latest
==================================================

Use this when the user wants to open the latest/recent
email from a particular person or keyword.

Example:

"Open the latest email from David"

Return:

{{
    "action": "open_latest",
    "sender": "David"
}}

Example:

"Open the latest email from LinkedIn"

Return:

{{
    "action": "open_latest",
    "sender": "LinkedIn"
}}


==================================================
ACTION 4: reply_current
==================================================

Use this when the user wants to reply to the email
that is currently open.

Example:

"Reply to this saying I will attend"

Return:

{{
    "action": "reply_current",
    "body": "I will attend"
}}

Use the currently opened email information when
understanding the context.


==================================================
ACTION 5: sent
==================================================

Use this when the user wants to see sent emails.

Examples:

"Show my sent emails"

"Open sent"

"Go to sent"

Return:

{{
    "action": "sent"
}}


==================================================
ACTION 6: inbox
==================================================

Use this when the user wants to go to the inbox.

Examples:

"Show my inbox"

"Go to inbox"

"Open inbox"

Return:

{{
    "action": "inbox"
}}


==================================================
ACTION 7: none
==================================================

Use this when the command does not match
any supported action.

Return:

{{
    "action": "none"
}}


==================================================
IMPORTANT RULES
==================================================

1. NEVER send an email yourself.

2. When the user asks to send, write, or compose
   an email, ALWAYS return the "compose" action.

3. The frontend will visibly open the Compose window
   and fill the fields.

4. Do not silently send emails.

5. When the user says "reply to this",
   use "reply_current" if an email is currently open.

6. When searching by date, calculate the correct
   date relative to today's date.

7. For "show sent emails", use "sent".

8. For "show inbox", use "inbox".

9. Return exactly ONE action.

10. Return valid JSON only.
"""


        # --------------------------------------------------
        # Call Gemini
        # --------------------------------------------------

        response = gemini_client.models.generate_content(
            model="gemini-3.6-flash",
            contents=prompt,
            config={
                "response_mime_type": "application/json"
            }
        )


        # --------------------------------------------------
        # Parse Gemini response
        # --------------------------------------------------

        action = json.loads(
            response.text
        )


        # --------------------------------------------------
        # Debug logging
        # --------------------------------------------------

        print(
            "\nAI Assistant Command:",
            request.message
        )

        print(
            "Current Folder:",
            current_folder
        )

        print(
            "Current Email:",
            current_email
        )

        print(
            "AI Assistant Action:",
            action
        )


        # --------------------------------------------------
        # Return action to frontend
        # --------------------------------------------------

        return {
            "success": True,
            "action": action
        }


    except json.JSONDecodeError as error:

        print(
            "Gemini JSON error:",
            error
        )

        raise HTTPException(
            status_code=500,
            detail="AI assistant returned invalid JSON"
        )


    except Exception as error:

        print(
            "Gemini assistant error:",
            error
        )

        raise HTTPException(
            status_code=500,
            detail="AI assistant failed"
        )
