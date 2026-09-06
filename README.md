# Nebula Mail

**An AI-powered mail application where the assistant doesn't just talk about your inbox — it operates it.**



---

## The idea

Most "AI email assistants" are a chatbot bolted onto the side of an inbox. Ask it something, it replies in a text bubble, and you're left to do the actual work yourself.

Nebula Mail takes a different position: the assistant *is* the interface. Say "show my sent emails" and the app switches to Sent. Say "compose an email to John saying I'll send the report tomorrow" and the Compose window opens, populated, ready for review. Say "reply to this" while an email is open, and it knows exactly which email you mean.

Natural language becomes application state. That's the whole premise, and it's what this build is designed to prove.

---

## Demo

- 🎥 **Video walkthrough:** `<insert link — Loom / YouTube unlisted / Drive>`
- 📸 **Screenshots:** `<add screenshots here when available>`

The walkthrough covers: AI-assisted composition, natural-language search and filtering, navigation between Inbox and Sent, opening a specific email, a context-aware reply, and a live email arriving with zero manual refresh.

---

## How it works

```
                    ┌─────────────┐
   Natural language │   Gemini    │  Structured
   ────────────────▶│  Assistant  │──action JSON──┐
                    └─────────────┘                │
                                                    ▼
┌──────────┐   REST    ┌─────────────┐      ┌─────────────┐
│  React   │◀─────────▶│   FastAPI   │◀────▶│  Gmail API  │
│ Frontend │           │   Backend   │      │             │
└──────────┘           └─────────────┘      └─────────────┘
     ▲                        ▲
     │ syncVersion poll       │ Pub/Sub notification
     │                        │
     └────────────────┌───────┴────────┐
                       │  Gmail Watch   │
                       │  + Google      │
                       │  Cloud Pub/Sub │
                       └────────────────┘
```

### The assistant loop

Take a request like *"compose an email to X saying Y"*:

1. The user types the instruction into the assistant panel.
2. React sends it to `POST /api/assistant`.
3. FastAPI hands it to Gemini, which returns a **structured action** — not prose.
4. React reads the action and updates real UI state accordingly.
5. For compose or reply, the relevant form opens, populated and visible.
6. The user reviews the message and clicks **Send** themselves.

The assistant's output is never just an answer — it's an instruction the interface acts on.

### Real-time sync

```
Gmail → Gmail Watch → Google Cloud Pub/Sub → FastAPI listener
      → syncVersion updates → React detects the change → Inbox refreshes
```

When a new message lands in Gmail, a Pub/Sub notification reaches the backend, which bumps a `syncVersion` counter. The frontend polls a lightweight `/api/sync-status` endpoint and refreshes the moment that version changes — no manual reload required. A periodic fallback refresh sits underneath this in case a push notification is ever delayed.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite |
| Backend | FastAPI (Python) + Uvicorn |
| Mail provider | Gmail API |
| Authentication | Google OAuth 2.0 |
| AI assistant | Google Gemini API |
| Real-time notifications | Gmail Watch + Google Cloud Pub/Sub |
| Styling | CSS |

---

## What's implemented

**Gmail integration** — real inbox and sent data (no mocks), email detail view, real sending, reply with correct Gmail threading (`threadId`, `In-Reply-To`, `References`), and search/filtering.

**AI assistant** — understands and acts on instructions such as:

- *"Show my sent emails"* → switches the interface to Sent
- *"Show me emails from LinkedIn"* → filters the main list
- *"Compose an email to poojanivethidha.2302139@srec.ac.in saying hello, this is a test from Nebula Mail"* → opens Compose, fills recipient and body
- *"Open the latest email from David"* → navigates directly to that email
- *"Reply to this email saying thank you for your message"* (with an email already open) → opens Reply, using the currently selected email as context

**Human-in-the-loop sending** — the assistant prepares the message and opens the relevant form, but the send action always belongs to the user:

```
Request → AI interprets → Compose/Reply opens → fields filled → user reviews → user clicks Send
```

No email leaves the account without a person explicitly sending it.

**Context awareness** — the currently open email is passed to the assistant as state, so "reply to this" resolves correctly without the user having to name or re-describe the email.

**Email body normalization** — Gmail messages arrive in inconsistent MIME shapes; the backend detects and cleans HTML-in-plain-text (and the reverse) so every message renders consistently.

---

## Project structure

```
nebula-mail/
├── backend/
│   ├── main.py
│   ├── gmail_test.py
│   └── .gitignore
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── index.css
│   │   └── main.jsx
│   ├── package.json
│   ├── package-lock.json
│   └── vite.config.js
├── .gitignore
└── README.md
```

---

## Running it locally

### Prerequisites
- Python 3.13+
- Node.js 24+
- Git
- A Google Cloud project with the Gmail API enabled, plus OAuth credentials and a Pub/Sub setup
- A Gemini API key

### 1. Clone
```bash
git clone https://github.com/poojanive/nebula-mail.git
cd nebula-mail
```

### 2. Backend
```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install fastapi uvicorn google-api-python-client google-auth-httplib2 google-auth-oauthlib google-cloud-pubsub google-genai python-dotenv email-validator
```
Place `credentials.json` and `pubsub-credentials.json` in the `backend` directory, and add a `.env` file with your Gemini API key. None of these are committed to Git.

```powershell
uvicorn main:app --reload --port 8000
```
Backend runs at `http://127.0.0.1:8000`.

### 3. Frontend
```powershell
cd frontend
npm install
npm run dev
```
Frontend runs at `http://localhost:5173`.

### 4. Gmail OAuth scopes in use
```
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.send
```
The OAuth token is stored locally and excluded from Git.

### 5. Pub/Sub configuration
```
Topic: gmail-notifications
Subscription: gmail-notifications-sub
```
Gmail's publishing service account is granted permission to publish to the topic; a separate backend service account consumes messages from the subscription. Its key is stored locally and excluded from Git.

### 6. Start Gmail Watch
```powershell
Invoke-RestMethod -Method POST http://127.0.0.1:8000/api/gmail/watch
```
Watch registrations expire periodically and need renewing.

---

## Security

Nothing sensitive lives in this repository. The following are gitignored:
```
credentials.json
credentials_desktop.json
token.json
pubsub-credentials.json
gmail_watch_state.json
.env
venv/
node_modules/
```
No OAuth tokens, Gemini keys, or service-account credentials are committed at any point in the history.

---

## Design decisions

**Structured actions, not free-form replies.** Gemini returns a typed action (`compose`, `search`, `filter`, `open`, `open_latest`, `reply`, `inbox`, `sent`) rather than natural-language text. This gives the frontend a predictable contract to translate AI intent into real UI changes, and makes the assistant straightforward to extend with new actions later.

**Confirmation before sending.** The assistant can fill a form; it cannot press Send. This was a deliberate trade of a small amount of "wow" for keeping the human in control of what actually leaves the account.

**Polling over WebSockets.** Pub/Sub already delivers the real-time event server-side. Rather than standing up a second real-time channel to the browser, the frontend checks a lightweight sync endpoint and reacts to version changes — smaller surface area, easier to reason about, still effectively instant.

**A fallback refresh underneath the push path.** If a Pub/Sub notification is ever delayed, the periodic refresh means the user still isn't stuck looking at stale data.

---

## Testing performed

All of the following were run against a real, connected Gmail account:

| Scenario | Result |
|---|---|
| "Show my sent emails" | Switched to Sent, displayed real messages |
| "Show me emails from LinkedIn" | Filtered the main list correctly |
| AI compose to a real address | Compose opened, fields populated, email sent on review |
| Context-aware reply | Reply opened for the selected email, sent with correct threading |
| Real-time sync | A newly received email appeared automatically, no manual refresh |

---

## Hiring task coverage

| Requirement | Status |
|---|---|
| Real mail provider integration | ✅ Gmail API |
| Inbox / Sent / Detail views | ✅ |
| Compose & real sending | ✅ |
| AI compose & field-filling | ✅ |
| AI search / filtering | ✅ |
| AI navigation | ✅ |
| Context-aware assistant | ✅ |
| Reply with Gmail threading | ✅ |
| Real-time sync | ✅ Gmail Watch + Pub/Sub |
| Human confirmation before sending | ✅ |
| Polished UI | ✅ |

---

## Current scope

Deliberately out of scope for this task: attachments, forwarding, full thread/conversation visualization, multi-provider or multi-account support, rich-text composition, and production deployment. All are natural next steps rather than oversights.

## What I'd build next

- Server-Sent Events or WebSockets for genuinely instant push updates
- Conversation/thread grouping
- Attachment handling and forwarding
- AI-generated thread summaries
- Automated tests around the assistant's action-parsing logic
- Automatic Gmail Watch renewal
- Production-grade OAuth and secret management

---

## Author

**Pooja Nivethidha M** — final-year ECE, Sri Ramakrishna Engineering College
Built for the Nebula KnowLab 2027 Hiring Task.
