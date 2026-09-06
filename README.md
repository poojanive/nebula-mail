# Nebula Mail — AI-Powered Mail Web Application

An email client where the AI assistant doesn't just answer questions in a chat box — it **drives the interface**: opening Compose, filling in fields, switching views, and surfacing search results directly in the main UI.

Built for the Nebula KnowLab hiring task.

---

## Demo

- 🎥 **Video walkthrough:** `<insert link — Loom/YouTube unlisted/Drive>`
- 📸 **Screenshots:** see `/screenshots` in this repo

The video shows: AI compose → AI search/filter → AI navigation to a specific email → context-aware reply → live real-time sync (an email arriving without a manual refresh).

---

## Architecture

```
                    ┌─────────────┐
   Natural language │   Gemini    │  Structured
   ────────────────▶│  Assistant  │──action JSON──┐
                    └─────────────┘                │
                                                    ▼
┌──────────┐   REST    ┌─────────────┐      ┌─────────────┐
│  React   │◀─────────▶│   FastAPI    │◀────▶│  Gmail API  │
│ Frontend │           │   Backend    │      │             │
└──────────┘           └─────────────┘      └─────────────┘
     ▲                        ▲
     │  syncVersion poll      │  Pub/Sub push
     │                        │
     └────────────────┌───────┴────────┐
                       │  Gmail Watch    │
                       │  + Google       │
                       │  Cloud Pub/Sub  │
                       └─────────────────┘
```

**Flow for an assistant-driven action** (e.g. "compose an email to X saying Y"):

1. User types a natural-language instruction into the assistant panel.
2. Frontend sends it to `POST /api/assistant`.
3. Backend prompts Gemini to return a **structured action** (`compose`, `search`, `filter`, `open_email`, `reply`, `navigate`) rather than free text.
4. React receives the action and updates real UI state — the Compose form visibly fills in, the inbox list re-renders with filtered results, etc.
5. For anything that sends mail, the assistant stops at "prepared" state — the user reviews and clicks Send themselves. Nothing is sent without human confirmation.

**Real-time sync flow:**

Gmail Watch → Google Cloud Pub/Sub topic (`gmail-notifications`) → FastAPI background listener on the subscription → backend increments a `syncVersion` → React polls `/api/sync-status` and refreshes the inbox when the version changes.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React + Vite |
| Backend | FastAPI (Python) |
| Mail provider | Gmail API |
| AI assistant | Google Gemini API (`gemini-3.6-flash`) |
| Real-time | Gmail API Watch + Google Cloud Pub/Sub |
| Styling | Plain CSS |

---

## Setup & Local Run

### Prerequisites
- Node.js 18+
- Python 3.10+
- A Google Cloud project with the **Gmail API** enabled
- A **Gemini API key** (Google AI Studio, free tier)

### 1. Google Cloud / Gmail setup
1. Create a Google Cloud project and enable the Gmail API.
2. Create OAuth 2.0 credentials (Desktop app type) and download as `credentials.json`.
3. Set up a Pub/Sub topic and subscription for real-time notifications, and grant `gmail-api-push@system.gserviceaccount.com` the **Pub/Sub Publisher** role on the topic.
4. Create a service account for the backend to consume Pub/Sub messages, download its key as `pubsub-credentials.json`, and grant it **Pub/Sub Subscriber** on the subscription.

### 2. Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Place these in the backend root (never commit them):
#   credentials.json
#   pubsub-credentials.json
# Create a .env with:
#   GEMINI_API_KEY=your_key_here

uvicorn main:app --reload --host 127.0.0.1 --port 8000
```
First run will open a browser OAuth consent flow and save `token.json` locally.

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```
App runs at `http://localhost:5173`, talking to the backend at `http://127.0.0.1:8000`.

### 4. Start Gmail Watch (enables real-time sync)
```bash
curl -X POST http://127.0.0.1:8000/api/gmail/watch
```
Note: Gmail Watch registrations expire after ~7 days and need renewing.

---

## Architecture Decisions & Trade-offs

- **Structured actions over free-form chat replies.** The assistant endpoint returns a typed action object (`{action: "compose", to, subject, body}` etc.) instead of prose, so the frontend can deterministically drive UI state. This was the central design choice the task was evaluating for, and made every downstream feature (fill-form, search, navigate) implementable the same way.
- **Human confirmation before send.** The AI prepares compose/reply content and opens the relevant view, but never calls the send endpoint itself. This trades a small amount of "wow factor" for safety and matches the bonus criterion explicitly listed in the brief.
- **Polling `syncVersion` instead of WebSockets.** Pub/Sub already pushes to the backend in near-real-time; rather than adding a second real-time channel (WebSocket) to the frontend, the React app does lightweight polling against a version counter. Simpler to implement and debug under a 5-day deadline, at the cost of slightly higher latency than a full push-to-client socket would give.
- **Backend fallback for simple navigation commands** (e.g. "show my inbox / sent"). Added after observing occasional Gemini 503s — keeps basic navigation responsive even if the LLM call fails, without weakening the "AI controls the UI" requirement for the harder cases (compose, search, context-aware reply), which still route through Gemini.
- **HTML email body normalization.** Some Gmail messages return HTML in a `text/plain` payload or vice versa; the backend detects and cleans this so the reading experience stays consistent regardless of how a given message was originally encoded.

---

## What's Implemented

- [x] Real Gmail inbox and sent folder (no mock data)
- [x] Compose and send via real Gmail API
- [x] Reply with correct threading (`threadId`, `In-Reply-To`, `References`)
- [x] AI assistant: compose/fill, search/filter, navigate, context-aware reply
- [x] Human-in-the-loop confirmation before any send
- [x] Real-time inbox sync via Gmail Watch + Pub/Sub (no manual refresh)
- [x] HTML/plain-text email body handling

## What I'd Improve With More Time

- Move from `syncVersion` polling to a proper WebSocket/SSE push to the client for lower-latency updates
- Rich inline previews in the assistant panel (sender avatar, snippet cards) instead of text-only responses
- Thread/conversation view for multi-message email chains
- Automated tests around the assistant's action-parsing logic, since that's the most failure-prone surface
- Renewal automation for the Gmail Watch subscription (currently a manual `curl` call)

---

## Security Notes

The following are excluded via `.gitignore` and are **not** present in this repository:
```
credentials.json
credentials_desktop.json
token.json
pubsub-credentials.json
.env
```
