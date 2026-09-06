\# Nebula Mail



\### A real-time Gmail client with an AI assistant that can actually operate the mail interface.



Nebula Mail is a full-stack mail application built for the \*\*Nebula KnowLab 2027 Hiring Task\*\*.



The idea behind the project is simple: instead of making an AI assistant that only tells the user what to do, the assistant should be able to \*\*understand a request and drive the application itself\*\*.



For example:



> "Compose an email to john@example.com saying I'll send the report tomorrow."



The assistant opens the compose window, fills in the recipient and message, and leaves the email ready for the user to review and send.



The application uses real Gmail data, supports sending and replying to emails, and receives new-message notifications through Gmail Push Notifications and Google Cloud Pub/Sub.



\---



\## What I Built



Nebula Mail combines three parts:



\*\*Gmail\*\* provides the actual mail data and sending capabilities.



\*\*FastAPI\*\* acts as the backend layer, handling Gmail communication, email processing, AI requests, and real-time notifications.



\*\*React\*\* provides the mail interface and gives the AI assistant a set of application actions it can trigger.



The result is a mail client where normal interaction and AI interaction work together instead of existing as two separate features.



\---



\## Core Features



\### Gmail integration



Nebula Mail works with a real Gmail account rather than mock or hard-coded email data.



\- Inbox with real Gmail messages

\- Sent folder

\- Email detail view

\- Real email sending

\- Reply to existing emails

\- Gmail conversation/thread support for replies

\- Email search and filtering



\### AI-assisted mail actions



The assistant accepts natural-language requests and translates them into actions inside the application.



For example:



```text

Show my sent emails



switches the main view to Sent.



Show me emails from LinkedIn



filters the email list.



Compose an email to john@example.com saying

I'll send the report tomorrow.



opens the compose interface and fills the relevant fields.



When an email is already open, the assistant can use that email as context:



Reply to this email saying thank you for your message.



The important part is that these requests change the actual application state and UI. The assistant is not simply returning instructions in a chat response.



Real-Time Email Updates



One of the requirements of the task was to avoid relying entirely on manual refresh.



Nebula Mail uses Gmail's push notification mechanism together with Google Cloud Pub/Sub.



The flow is:



&#x20;                   Gmail

&#x20;                     │

&#x20;                     │ Gmail Watch

&#x20;                     ▼

&#x20;            Google Cloud Pub/Sub

&#x20;                     │

&#x20;                     │ Notification

&#x20;                     ▼

&#x20;               FastAPI Backend

&#x20;                     │

&#x20;                     │ Sync Event

&#x20;                     ▼

&#x20;               React Frontend

&#x20;                     │

&#x20;                     ▼

&#x20;             Updated Mail List



When Gmail receives a new message, Gmail publishes a notification to the configured Pub/Sub topic.



The FastAPI backend listens for these notifications and updates its synchronization state. The React application detects the change and refreshes the mail data automatically.



A lightweight polling fallback is also kept on the frontend so that the interface remains resilient if a push event is delayed.



This gives the application a live-mail experience without repeatedly relying on a full manual page refresh.



How the AI Assistant Works



The assistant follows an action-oriented approach.



Instead of treating every request as a text-generation problem, the backend first determines what the user is trying to do and returns a structured action.



Conceptually:



User request

&#x20;    │

&#x20;    ▼

Gemini

&#x20;    │

&#x20;    ▼

Structured action

&#x20;    │

&#x20;    ├── compose

&#x20;    ├── search / filter

&#x20;    ├── open email

&#x20;    ├── open latest email

&#x20;    ├── inbox

&#x20;    ├── sent

&#x20;    └── reply

&#x20;    │

&#x20;    ▼

React action executor

&#x20;    │

&#x20;    ▼

Visible UI change



This separation is intentional.



The model decides what should happen, while the frontend is responsible for actually performing the application action.



That makes the assistant much closer to an interface controller than a conventional chatbot.



Context-Aware Actions



The assistant also receives information about the current application state.



For example, when a user is reading an email and says:



Reply to this saying thank you.



the assistant does not need the user to repeat the sender, subject, or message information.



The currently selected email is passed as context, allowing the assistant to prepare a reply for that specific message.



Replies are sent using Gmail's threading information, including the relevant threadId, In-Reply-To, and References headers.



Architecture

┌─────────────────────────────────────────────────────────┐

│                     React Frontend                      │

│                                                         │

│  Inbox   Sent   Search   Compose   Email Detail         │

│                                                         │

│                    AI Assistant                         │

│                         │                               │

│                 Action Executor                         │

└─────────────────────────┼───────────────────────────────┘

&#x20;                         │

&#x20;                         │ REST API

&#x20;                         ▼

┌─────────────────────────────────────────────────────────┐

│                    FastAPI Backend                       │

│                                                         │

│  Gmail API       Email Processing       AI Assistant    │

│                                                         │

│                  Pub/Sub Listener                       │

└──────────────┬──────────────────────┬───────────────────┘

&#x20;              │                      │

&#x20;              │                      │

&#x20;              ▼                      ▼

&#x20;       ┌─────────────┐       ┌────────────────┐

&#x20;       │ Gmail API   │       │ Gemini API     │

&#x20;       │             │       │                │

&#x20;       │ Read        │       │ Understand     │

&#x20;       │ Send        │       │ requests       │

&#x20;       │ Reply       │       │ Return actions │

&#x20;       └──────┬──────┘       └────────────────┘

&#x20;              │

&#x20;              │ Gmail Watch

&#x20;              ▼

&#x20;       ┌─────────────────┐

&#x20;       │ Google Cloud    │

&#x20;       │ Pub/Sub         │

&#x20;       └─────────────────┘

Technology Stack

Layer	Technology

Frontend	React + Vite

Backend	Python + FastAPI

Server	Uvicorn

Email	Gmail API

Authentication	Google OAuth 2.0

AI	Google Gemini

Real-time events	Gmail Watch + Google Cloud Pub/Sub

Styling	CSS

Version control	Git + GitHub

Project Structure

nebula-mail/

│

├── backend/

│   ├── main.py

│   ├── gmail\_test.py

│   └── .gitignore

│

├── frontend/

│   ├── public/

│   │

│   ├── src/

│   │   ├── App.jsx

│   │   ├── App.css

│   │   ├── index.css

│   │   └── main.jsx

│   │

│   ├── package.json

│   ├── package-lock.json

│   └── vite.config.js

│

├── .gitignore

└── README.md

Running the Project Locally

Prerequisites



You will need:



Python 3.13+

Node.js

A Google Cloud project

Gmail API enabled

Gmail OAuth credentials

Google Cloud Pub/Sub configured

A Gemini API key

1\. Clone the repository

git clone https://github.com/poojanive/nebula-mail.git

cd nebula-mail

2\. Set up the backend

cd backend

python -m venv venv

venv\\Scripts\\activate



Install the required Python packages:



pip install fastapi uvicorn google-api-python-client google-auth-httplib2 google-auth-oauthlib google-cloud-pubsub google-genai python-dotenv email-validator

3\. Configure Gmail



Create a Google Cloud project and enable the Gmail API.



Create OAuth credentials and place the local credential file at:



backend/credentials.json



On the first authentication, the application creates a local OAuth token:



backend/token.json



The application uses the following Gmail scopes:



https://www.googleapis.com/auth/gmail.readonly

https://www.googleapis.com/auth/gmail.send

4\. Configure Gemini



Create a local environment file:



backend/.env



Add the Gemini API key using the environment variable expected by the backend.



Do not commit this file.



5\. Configure Gmail Push Notifications



Create a Google Cloud Pub/Sub topic and subscription for Gmail notifications.



The backend expects:



Topic:

gmail-notifications



Subscription:

gmail-notifications-sub



The Gmail publishing service account must have permission to publish to the topic, while the application's subscriber service account needs permission to consume messages from the subscription.



The Pub/Sub service-account key is kept locally and is intentionally excluded from Git.



6\. Start the backend



From the backend directory:



uvicorn main:app --reload --port 8000



The backend will be available at:



http://127.0.0.1:8000

7\. Start the frontend



Open another terminal:



cd frontend

npm install

npm run dev



Open the local Vite URL shown in the terminal, normally:



http://localhost:5173

Security



Credentials are deliberately kept outside the repository.



The following files are ignored by Git:



backend/credentials.json

backend/credentials\_desktop.json

backend/token.json

backend/pubsub-credentials.json

backend/gmail\_watch\_state.json

backend/.env

backend/venv/

frontend/node\_modules/



No Gmail OAuth tokens, API keys, or Google Cloud service-account private keys should be committed to the repository.



For a production deployment, the local credential approach would be replaced with a proper server-side OAuth flow and managed secrets.



Tested Workflows



The main workflows required for the hiring task have been tested against real Gmail data.



1\. Navigate to Sent



Request



Show my sent emails



Result



The application switches from Inbox to Sent and loads the user's actual sent messages.



2\. Search using natural language



Request



Show me emails from LinkedIn



Result



The main email list is filtered to matching messages.



3\. Compose using natural language



Request



Compose an email to

poojanivethidha.2302139@srec.ac.in

saying hello, this is a test from Nebula Mail



Result



The Compose interface opens and the assistant fills the recipient and message.



The user can review the message before sending it.



4\. Context-aware reply



With an email open:



Request



Reply to this email saying thank you for your message.



Result



The Reply interface opens using the currently selected email as context.



The reply is sent through Gmail using the original conversation thread.



5\. Real-time synchronization



A new email received in Gmail is reflected in the Nebula Mail interface without requiring a manual browser refresh.



The update path is:



Gmail

&#x20; → Gmail Watch

&#x20; → Google Cloud Pub/Sub

&#x20; → FastAPI

&#x20; → React

Hiring Task Coverage

Requirement	Status

Real Gmail integration	✓

Inbox with real data	✓

Sent with real data	✓

Email detail view	✓

Real email sending	✓

AI-assisted compose	✓

AI-assisted search/filter	✓

AI navigation	✓

Open latest email	✓

Context-aware reply	✓

Gmail reply threading	✓

Real-time synchronization	✓

Responsive / polished UI	✓

Design Decisions

Why React?



The task requires the AI assistant to affect the visible mail interface.



React makes application state explicit, which makes it straightforward for assistant actions such as:



compose

search

open

reply

inbox

sent



to update the interface.



Why FastAPI?



FastAPI provides a lightweight Python backend and works well with the Google APIs and the Python Gemini SDK used in the project.



It also keeps Gmail credentials and API interactions away from the browser.



Why Pub/Sub?



Polling Gmail continuously would be inefficient and would not provide a true push-based synchronization path.



Gmail Watch + Pub/Sub allows Gmail to notify the backend when mailbox activity occurs.



Why keep a polling fallback?



Push notifications are the primary real-time mechanism, but a small fallback polling interval makes the UI more tolerant of delayed or missed synchronization events.



Current Limitations



This version focuses on the requirements of the hiring task rather than trying to reproduce every feature of a production mail client.



Some areas that could be extended include:



Attachment handling

Email thread grouping

Forwarding

Rich HTML email composition

More advanced Gmail search operators

Multiple Gmail account support

Outlook / Microsoft 365 support

Production OAuth flow

Automated test coverage

Production deployment and managed secrets

Possible Next Steps



If this were taken beyond the hiring task, I would focus on:



Proper email thread visualization

Attachments and rich-text composition

More robust Gmail history synchronization

Streaming AI responses

AI-generated email summaries

Smarter search and ranking

Automated frontend and backend tests

Production authentication and secret management

Author



Pooja Nivethidha M



Built as part of the Nebula KnowLab 2027 Hiring Task.



A note on the implementation



The goal of Nebula Mail was not to build another chatbot sitting beside an email client.



The goal was to make the assistant part of the application itself — where a natural-language request can result in a visible, meaningful change to the mail interface.



That distinction shaped the architecture of the project.

