from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build


SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
]


# -----------------------------
# Google Authentication
# -----------------------------
flow = InstalledAppFlow.from_client_secrets_file(
    "credentials_desktop.json",
    SCOPES
)

credentials = flow.run_local_server(port=0)

print("\nGoogle authentication successful!")
print("Access token obtained.")


# -----------------------------
# Save credentials
# -----------------------------
with open("token.json", "w") as token_file:
    token_file.write(credentials.to_json())

print("Gmail authorization saved to token.json")


# -----------------------------
# Connect to Gmail API
# -----------------------------
gmail = build(
    "gmail",
    "v1",
    credentials=credentials
)

print("Connected to Gmail API!")


# -----------------------------
# Get Inbox messages
# -----------------------------
results = gmail.users().messages().list(
    userId="me",
    labelIds=["INBOX"],
    maxResults=5
).execute()

messages = results.get("messages", [])

print(f"\nFound {len(messages)} inbox messages.\n")


# -----------------------------
# Display email details
# -----------------------------
for message in messages:

    message_data = gmail.users().messages().get(
        userId="me",
        id=message["id"],
        format="metadata",
        metadataHeaders=["From", "To", "Subject", "Date"]
    ).execute()

    headers = message_data["payload"]["headers"]

    email_info = {}

    for header in headers:
        email_info[header["name"]] = header["value"]

    print("----------------------------------------")
    print("From   :", email_info.get("From", ""))
    print("To     :", email_info.get("To", ""))
    print("Subject:", email_info.get("Subject", ""))
    print("Date   :", email_info.get("Date", ""))
    print("----------------------------------------")