# Nebula Mail

**A Gmail-powered mail client where the AI assistant doesn't just talk about your inbox — it operates it.**

Built for the Nebula KnowLab 2027 Engineering Hiring Task.

---

## The idea

Most "AI email assistants" are a chatbot bolted onto the side of an inbox. Ask it something, it replies in a text bubble, and you're left to do the actual work yourself.

Nebula Mail takes a different position: the assistant *is* the interface.

- *"Show my sent emails"* → the app switches to Sent
- *"Show me emails from LinkedIn"* → the main list updates with matching messages
- *"Open the latest email from LinkedIn"* → the relevant email opens
- *"Compose an email to someone@example.com saying hello"* → Compose opens, fields fill in
- *"Reply to this email saying thank you"* → the currently open email is used as context, and a reply is prepared

The same commands can also be triggered from built-in suggestion prompts — clicking one runs it through the exact same assistant pipeline as typing it. Either way, the user always keeps final control of what actually gets sent.

---

## Demo

- 🎥 **Video walkthrough:** [Watch on Google Drive](https://drive.google.com/file/d/1RenxV_I8TfUepGpMNaUOS7jGLey_BVxV/view?usp=sharing)

The walkthrough covers: AI-assisted composition, natural-language search and filtering, navigation between Inbox and Sent, opening a specific email, a context-aware reply, AI Email Intelligence in the detail view, and a live email arriving with zero manual refresh.

### Screenshots

**Inbox with the AI Assistant panel**

<img width="1662" height="897" alt="image" src="https://github.com/user-attachments/assets/db68c673-f1b7-4564-bceb-5e6c03bfdd1b" />


**AI-controlled navigation — "Open the latest email from LinkedIn"**

<img width="1918" height="897" alt="image" src="https://github.com/user-attachments/assets/6b172bc9-2c6c-45b9-9f28-9ae28155ed34" />


**AI-assisted composition with automatic field population**

<img width="1912" height="832" alt="image" src="https://github.com/user-attachments/assets/62a6e7d1-e993-47dc-99b4-dff23bc2a0ae" />


**AI Email Intelligence — classification, priority, and action analysis**

<img width="1911" height="831" alt="image" src="https://github.com/user-attachments/assets/c5b703f3-01a1-432c-8de6-b819b9cba67f" />



---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Nebula Mail UI                       │
│                     React + Vite                         │
│                                                           │
│  Inbox / Sent / Search / Compose / Reply / AI Assistant  │
└───────────────────────────┬───────────────────────────────┘
                             │ HTTP API
                             ▼
┌─────────────────────────────────────────────────────────┐
│                     FastAPI Backend                       │
│                                                           │
│  Gmail operations │ AI assistant │ Email processing       │
│  AI intelligence  │ Sync handling │ Reply/send logic       │
└───────────────┬───────────────────┬───────────────────────┘
                │                   │
                ▼                   ▼
        ┌───────────────┐   ┌────────────────┐
        │   Gmail API   │   │  Gemini API    │
        │ Inbox / Send  │   │ AI reasoning   │
        │ Reply / Watch │   │ Classification │
        └───────┬───────┘   └────────────────┘
                │
                ▼
        ┌────────────────┐
        │ Google Cloud   │
        │    Pub/Sub     │
        │ Gmail events   │
        └────────────────┘
```

### How AI controls the application

The assistant is built around **actions**, not conversational text:

```
Natural-language request
          ↓
FastAPI /api/assistant
          ↓
Command interpretation
          ↓
Structured UI action
          ↓
React action executor
          ↓
Visible UI change
```

Example — navigation:
```
"Show my sent emails" → action: sent → React changes folder
                       → Sent messages load → user sees the Sent interface
```

Example — composition:
```
"Compose an email to X saying hello" → action: compose → Compose window opens
                                      → To / Subject / Body populate
                                      → user reviews → user clicks Send
```

This keeps the assistant tightly wired into the application itself, rather than acting as an independent chatbot sitting next to it.

### Real-time sync

```
Gmail mailbox change → Gmail Watch → Google Cloud Pub/Sub
   → FastAPI subscriber → synchronization state changes
   → React detects the update → Inbox refreshes
```

New messages appear without a manual browser refresh — implemented specifically to satisfy that requirement rather than relying on periodic polling alone.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite |
| Backend | FastAPI + Python |
| Server | Uvicorn |
| Mail provider | Gmail API |
| Authentication | Google OAuth 2.0 |
| AI | Google Gemini API |
| Real-time events | Gmail Watch + Google Cloud Pub/Sub |
| Styling | CSS |
| Validation | email-validator |

---

## Key features

### Real Gmail integration
Real Inbox and Sent data, email detail view, real sending through the Gmail API, search and filtering against live data, Google OAuth 2.0 authentication, and Gmail message/thread identifiers preserved where required.

### AI assistant
Converts natural-language requests into application actions: open Inbox, open Sent, search/filter, open a specific or latest email, compose (with recipient/subject/body filled in), or prepare a contextual reply. The assistant returns structured action data; the frontend executes the matching UI operation.

### Clickable AI suggestions
Ready-made prompts built into the interface — not decorative. Clicking one sends that exact request through the same assistant pipeline as typed input, giving two equivalent paths into the same system:
```
Typed:      user types → AI interprets → UI action
Suggestion: user clicks → AI interprets → UI action
```

### Human-in-the-loop sending
```
Request → AI interprets → Compose/Reply opens → fields fill in → user reviews → user clicks Send
```
The assistant prepares; it never silently sends.

### Context-aware replies
When an email is open, its context is passed to the assistant, so *"reply to this email saying thank you"* resolves without the user re-stating the sender, subject, or content. Replies use Gmail's threading data (`threadId`, `In-Reply-To`, `References`) to stay part of the original conversation.

### AI Email Intelligence
Individual emails can be analyzed by Gemini directly from the detail view, surfacing:
- Category
- Priority
- Whether action is needed
- A short summary
- The reasoning behind the classification

### Email content processing
Gmail messages arrive in inconsistent MIME shapes. The backend decodes MIME content, handles both plain-text and HTML parts, detects HTML embedded in unexpected payloads, normalizes whitespace/line breaks, and decodes headers (sender, recipient, subject, date) before display — so every message reads consistently regardless of how it was originally encoded.

### Interface
A focused mail application rather than a generic AI dashboard: sidebar navigation, Inbox/Sent views, search, compact email rows, a detail view, Compose and Reply windows, the integrated AI assistant, AI Email Intelligence, a live sync indicator, and responsive styling.

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
- A Google Cloud project with the Gmail API enabled, OAuth credentials, and Pub/Sub configured
- A Gemini API key

### Backend
Create and activate a Python virtual environment, then install:
```
fastapi, uvicorn, google-api-python-client, google-auth-httplib2,
google-auth-oauthlib, google-cloud-pubsub, google-genai,
python-dotenv, email-validator
```
The backend requires local Google credentials and environment configuration (Gemini API key). These are intentionally excluded from version control — see **Security** below.

Run with:
```
uvicorn main:app --reload --port 8000
```

### Frontend
Install Node dependencies and start the Vite dev server. The frontend communicates with the FastAPI backend running locally at `http://127.0.0.1:8000`.

### Gmail OAuth scopes
```
gmail.readonly — reading mailbox data
gmail.send     — sending messages and replies
```
OAuth tokens and credential files are stored locally and excluded from Git.

---

## Design decisions

**React + Vite** — a lightweight, fast frontend with straightforward component-based development.

**FastAPI** — a simple Python API layer that integrates naturally with the Gmail and Gemini Python libraries.

**Real Gmail data, not mocks** — Inbox, Sent, sending, replies, and synchronization all operate against a genuinely connected account, so the behavior being demonstrated is real, not simulated.

**Gemini for reasoning, backend for the deterministic parts** — natural-language understanding and email intelligence run through Gemini; simple, unambiguous navigation commands can be handled directly by the backend where appropriate, reducing unnecessary model dependency and improving reliability.

**Google Cloud Pub/Sub with Gmail Watch** — used to receive mailbox-change notifications and drive real-time sync without polling Gmail directly.

**Human-in-the-loop sending** — the assistant prepares messages but leaves the final Send action to the user, favoring a safer and more transparent interaction model over full automation.

---

## Testing performed

The following flows have been tested against real Gmail data:

- Loading Inbox and Sent messages
- Opening email details
- Sending a real email
- Replying within an existing Gmail thread
- AI-driven navigation to Sent
- AI-driven sender filtering
- AI-driven email opening
- AI-driven Compose field population
- Context-aware AI reply preparation
- AI Email Intelligence analysis
- Real-time arrival of newly received emails
- Clickable assistant suggestions

---

## Security

The following are excluded from the repository via `.gitignore` and are not present anywhere in the commit history:
- Google OAuth credential files (including desktop credentials)
- Gmail OAuth token
- Pub/Sub service-account credentials
- Environment files containing API keys
- Python virtual environments / Node dependencies

API keys and private credentials are never committed.

---

## Current scope

**Implemented:** real Gmail integration, Inbox and Sent, email detail, compose and send, AI-controlled UI actions, AI search/filtering, context-aware replies, Gmail threading, real-time synchronization, AI Email Intelligence, clickable AI command suggestions, human confirmation before sending, and a responsive, professional UI.

**Not currently implemented:** attachments, forwarding, full conversation/thread visualization, multiple mail providers or accounts, rich-text composition, production deployment.

## What I'd build next

- Conversation/thread grouping
- Attachment handling and forwarding
- AI-generated thread summaries
- Semantic email search
- Smarter inbox prioritization
- AI-suggested replies
- Email analytics
- Automatic Gmail Watch renewal
- More comprehensive automated tests
- Production-grade OAuth and secret management
- WebSocket or Server-Sent Events based sync, in place of polling

---

## Why Nebula Mail

The project is built around one practical idea: **AI should help people operate software, not just describe what the software can do.**

That means combining real data, real APIs, AI reasoning, visible UI control, and human confirmation — rather than placing a chatbot beside a mail client and calling it AI-powered.

---

## Author

**Pooja Nivethidha M** — final-year ECE, Sri Ramakrishna Engineering College
Built for the Nebula KnowLab 2027 Engineering Hiring Task.
