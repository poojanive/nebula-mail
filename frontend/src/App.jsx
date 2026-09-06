import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API_BASE = "http://127.0.0.1:8000";

function App() {
  // =========================================================
  // FOLDER / EMAIL STATE
  // =========================================================

  const [emails, setEmails] = useState([]);
  const [currentFolder, setCurrentFolder] = useState("inbox");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // =========================================================
  // REAL-TIME SYNC STATE
  // =========================================================

  const [syncVersion, setSyncVersion] = useState(0);
  const [liveSync, setLiveSync] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [aiFilterTerm, setAiFilterTerm] = useState("");

  // =========================================================
  // EMAIL DETAIL
  // =========================================================

  const [selectedEmail, setSelectedEmail] = useState(null);
  const [emailBody, setEmailBody] = useState("");
  const [loadingDetail, setLoadingDetail] = useState(false);

  // =========================================================
  // COMPOSE
  // =========================================================

  const [showCompose, setShowCompose] = useState(false);

  const [composeData, setComposeData] = useState({
    to: "",
    subject: "",
    body: "",
  });

  const [isSending, setIsSending] = useState(false);

  // =========================================================
  // AI COMPOSE CONFIRMATION
  // =========================================================

  const [aiComposePending, setAiComposePending] = useState(false);

  // =========================================================
  // REPLY
  // =========================================================

  const [isReplying, setIsReplying] = useState(false);

  const [replyData, setReplyData] = useState({
    to: "",
    subject: "",
    body: "",
    message_id: "",
    thread_id: "",
  });

  const [isSendingReply, setIsSendingReply] = useState(false);

  // =========================================================
  // AI REPLY CONFIRMATION
  // =========================================================

  const [aiReplyPending, setAiReplyPending] = useState(false);

  // =========================================================
  // AI ASSISTANT
  // =========================================================

  const [assistantInput, setAssistantInput] = useState("");
  const [assistantMessages, setAssistantMessages] = useState([]);
  const [assistantLoading, setAssistantLoading] = useState(false);

  // =========================================================
  // FETCH EMAILS
  // =========================================================

  const fetchEmails = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }

      setError("");

      const endpoint =
        currentFolder === "sent"
          ? `${API_BASE}/api/sent`
          : `${API_BASE}/api/emails`;

      const response = await fetch(endpoint);

      if (!response.ok) {
        throw new Error("Failed to fetch emails");
      }

      const data = await response.json();

      setEmails(data.emails || []);
    } catch (err) {
      console.error("Email fetch error:", err);

      if (showLoading) {
        setError("Unable to load emails");
      }
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  // Initial load + folder change
  useEffect(() => {
    fetchEmails(true);
  }, [currentFolder]);

  // =========================================================
  // REAL-TIME GMAIL SYNC
  // =========================================================
  //
  // Gmail -> Pub/Sub -> FastAPI updates syncVersion.
  // The frontend checks only this lightweight status endpoint.
  // When the version changes, the actual email list is refreshed.
  // A slower fallback refresh is kept in case a push notification
  // is delayed or missed.
  // =========================================================

  useEffect(() => {
    let lastKnownSyncVersion = null;

    const checkSyncStatus = async () => {
      try {
        const response = await fetch(
          `${API_BASE}/api/sync-status`
        );

        if (!response.ok) {
          throw new Error("Sync status unavailable");
        }

        const data = await response.json();
        const serverSyncVersion =
          Number(data.syncVersion || 0);

        setLiveSync(true);

        // First response establishes the baseline.
        if (lastKnownSyncVersion === null) {
          lastKnownSyncVersion =
            serverSyncVersion;
          setSyncVersion(serverSyncVersion);
          return;
        }

        // Gmail notification received since the last check.
        if (
          serverSyncVersion !==
          lastKnownSyncVersion
        ) {
          lastKnownSyncVersion =
            serverSyncVersion;

          setSyncVersion(serverSyncVersion);

          console.log(
            "Real-time Gmail update received. Refreshing emails..."
          );

          await fetchEmails(false);
        }
      } catch (err) {
        console.error(
          "Real-time sync status error:",
          err
        );

        setLiveSync(false);
      }
    };

    checkSyncStatus();

    const syncStatusInterval = setInterval(
      checkSyncStatus,
      2000
    );

    const fallbackInterval = setInterval(
      () => {
        fetchEmails(false);
      },
      15000
    );

    return () => {
      clearInterval(syncStatusInterval);
      clearInterval(fallbackInterval);
    };
  }, [currentFolder]);

  // =========================================================
  // NORMAL + AI FILTER
  // =========================================================

  const filteredEmails = useMemo(() => {
    let result = [...emails];

    const normalTerm = searchTerm.trim().toLowerCase();
    const aiTerm = aiFilterTerm.trim().toLowerCase();

    if (normalTerm) {
      result = result.filter((email) => {
        return (
          (email.from || "")
            .toLowerCase()
            .includes(normalTerm) ||
          (email.to || "")
            .toLowerCase()
            .includes(normalTerm) ||
          (email.subject || "")
            .toLowerCase()
            .includes(normalTerm) ||
          (email.snippet || "")
            .toLowerCase()
            .includes(normalTerm)
        );
      });
    }

    if (aiTerm) {
      result = result.filter((email) => {
        return (
          (email.from || "")
            .toLowerCase()
            .includes(aiTerm) ||
          (email.to || "")
            .toLowerCase()
            .includes(aiTerm) ||
          (email.subject || "")
            .toLowerCase()
            .includes(aiTerm) ||
          (email.snippet || "")
            .toLowerCase()
            .includes(aiTerm)
        );
      });
    }

    return result;
  }, [emails, searchTerm, aiFilterTerm]);

  // =========================================================
  // NAVIGATION
  // =========================================================

  const openInbox = () => {
    setCurrentFolder("inbox");
    setSelectedEmail(null);
    setEmailBody("");
    setAiFilterTerm("");
    setSearchTerm("");
    setIsReplying(false);
  };

  const openSent = () => {
    setCurrentFolder("sent");
    setSelectedEmail(null);
    setEmailBody("");
    setAiFilterTerm("");
    setSearchTerm("");
    setIsReplying(false);
  };

  // =========================================================
  // COMPOSE
  // =========================================================

  const openCompose = (data = {}, fromAI = false) => {
    setComposeData({
      to: data.to || "",
      subject: data.subject || "",
      body: data.body || "",
    });

    setAiComposePending(fromAI);
    setShowCompose(true);
  };

  const closeCompose = () => {
    if (isSending) {
      return;
    }

    setShowCompose(false);
    setAiComposePending(false);

    setComposeData({
      to: "",
      subject: "",
      body: "",
    });
  };

  const handleComposeChange = (event) => {
    const { name, value } = event.target;

    setComposeData((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  // =========================================================
  // SEND EMAIL
  // =========================================================

  const handleSend = async () => {
    if (!composeData.to || !composeData.body) {
      alert("Please fill in To and Message.");
      return;
    }

    try {
      setIsSending(true);

      const response = await fetch(
        `${API_BASE}/api/send-email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: composeData.to,
            subject: composeData.subject,
            body: composeData.body,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Failed to send email"
        );
      }

      alert(
        `Email sent successfully through Gmail!\n\nTo: ${
          data.to
        }\nSubject: ${
          data.subject || "(No subject)"
        }`
      );

      setShowCompose(false);
      setAiComposePending(false);

      setComposeData({
        to: "",
        subject: "",
        body: "",
      });

      await fetchEmails(false);
    } catch (err) {
      console.error("Send email error:", err);
      alert("Unable to send email.");
    } finally {
      setIsSending(false);
    }
  };

  // =========================================================
  // OPEN EMAIL DETAIL
  // =========================================================

  const openEmail = async (email) => {
    try {
      setLoadingDetail(true);
      setSelectedEmail(email);
      setEmailBody("");
      setIsReplying(false);
      setAiReplyPending(false);

      const response = await fetch(
        `${API_BASE}/api/emails/${email.id}`
      );

      if (!response.ok) {
        throw new Error("Failed to load email");
      }

      const data = await response.json();

      setSelectedEmail((previous) => ({
        ...previous,
        ...data,
      }));

      setEmailBody(data.body || "");
    } catch (err) {
      console.error("Email detail error:", err);
      setEmailBody("Unable to load this email.");
    } finally {
      setLoadingDetail(false);
    }
  };

  const closeEmailDetail = () => {
    setSelectedEmail(null);
    setEmailBody("");
    setIsReplying(false);
    setAiReplyPending(false);
  };

  // =========================================================
  // REPLY
  // =========================================================

  const extractEmailAddress = (value) => {
    if (!value) {
      return "";
    }

    const match = value.match(/<([^>]+)>/);

    if (match) {
      return match[1];
    }

    return value.trim();
  };

  const startReply = (body = "", fromAI = false) => {
    if (!selectedEmail) {
      return;
    }

    const sender =
      selectedEmail.from ||
      selectedEmail.to ||
      "";

    const senderEmail =
      extractEmailAddress(sender);

    let subject =
      selectedEmail.subject || "";

    if (!subject.toLowerCase().startsWith("re:")) {
      subject = `Re: ${subject}`;
    }

    setReplyData({
      to: senderEmail,
      subject,
      body,
      message_id:
        selectedEmail.messageId ||
        selectedEmail.message_id ||
        "",
      thread_id:
        selectedEmail.threadId ||
        selectedEmail.thread_id ||
        "",
    });

    setAiReplyPending(fromAI);
    setIsReplying(true);
  };

  const handleReplyChange = (event) => {
    const { name, value } = event.target;

    setReplyData((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const cancelReply = () => {
    setIsReplying(false);
    setAiReplyPending(false);

    setReplyData({
      to: "",
      subject: "",
      body: "",
      message_id: "",
      thread_id: "",
    });
  };

  const handleReplySend = async () => {
    if (!replyData.to || !replyData.body) {
      alert("Please enter a reply message.");
      return;
    }

    try {
      setIsSendingReply(true);

      const response = await fetch(
        `${API_BASE}/api/reply-email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(replyData),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Failed to send reply"
        );
      }

      alert(
        `Reply sent successfully!\n\nTo: ${replyData.to}`
      );

      setIsReplying(false);
      setAiReplyPending(false);

      setReplyData({
        to: "",
        subject: "",
        body: "",
        message_id: "",
        thread_id: "",
      });

      await fetchEmails(false);
    } catch (err) {
      console.error("Reply error:", err);
      alert("Unable to send reply.");
    } finally {
      setIsSendingReply(false);
    }
  };

  // =========================================================
  // AI FILTER CLEAR
  // =========================================================

  const clearAiFilter = () => {
    setAiFilterTerm("");
  };

  // =========================================================
  // AI CHAT MESSAGE
  // =========================================================

  const addAssistantMessage = (role, text) => {
    setAssistantMessages((previous) => [
      ...previous,
      {
        role,
        text,
      },
    ]);
  };

  // =========================================================
  // FIND LATEST MATCHING EMAIL
  // =========================================================

  const findLatestMatchingEmail = (term) => {
    const cleanTerm =
      (term || "").toLowerCase().trim();

    if (!cleanTerm) {
      return emails[0] || null;
    }

    const matches = emails.filter((email) => {
      return (
        (email.from || "")
          .toLowerCase()
          .includes(cleanTerm) ||
        (email.to || "")
          .toLowerCase()
          .includes(cleanTerm) ||
        (email.subject || "")
          .toLowerCase()
          .includes(cleanTerm) ||
        (email.snippet || "")
          .toLowerCase()
          .includes(cleanTerm)
      );
    });

    return matches[0] || null;
  };

  // =========================================================
  // EXECUTE AI ACTION
  // =========================================================

  const executeAssistantAction = async (action) => {
    if (!action || !action.action) {
      return;
    }

    const actionType =
      action.action.toLowerCase();

    // =======================================================
    // COMPOSE
    // =======================================================

    if (actionType === "compose") {
      openCompose(
        {
          to: action.to || "",
          subject: action.subject || "",
          body: action.body || "",
        },
        true
      );

      addAssistantMessage(
        "assistant",
        "I opened Compose and filled in the email. Please review it before sending."
      );

      return;
    }

    // =======================================================
    // SEARCH / FILTER
    // =======================================================

    if (
      actionType === "search" ||
      actionType === "filter"
    ) {
      const filterValue =
        action.query ||
        action.keyword ||
        action.from ||
        "";

      setCurrentFolder("inbox");
      setSelectedEmail(null);
      setSearchTerm("");
      setAiFilterTerm(filterValue);

      addAssistantMessage(
        "assistant",
        filterValue
          ? `Showing emails matching "${filterValue}".`
          : "I updated the email filter."
      );

      return;
    }

    // =======================================================
    // OPEN LATEST EMAIL
    // =======================================================

    if (
      actionType === "open_latest" ||
      actionType === "open_latest_email"
    ) {
      const sender =
        action.sender ||
        action.from ||
        action.query ||
        action.keyword ||
        "";

      let emailList = emails;

      if (currentFolder !== "inbox") {
        try {
          const response = await fetch(
            `${API_BASE}/api/emails?limit=50`
          );

          const data = await response.json();

          emailList = data.emails || [];

          setEmails(emailList);
          setCurrentFolder("inbox");
        } catch (err) {
          console.error(err);
        }
      }

      const cleanSender =
        sender.toLowerCase().trim();

      const matches = emailList.filter(
        (email) => {
          if (!cleanSender) {
            return true;
          }

          return (
            (email.from || "")
              .toLowerCase()
              .includes(cleanSender) ||
            (email.subject || "")
              .toLowerCase()
              .includes(cleanSender) ||
            (email.snippet || "")
              .toLowerCase()
              .includes(cleanSender)
          );
        }
      );

      if (matches.length === 0) {
        addAssistantMessage(
          "assistant",
          `I couldn't find an email matching "${
            sender || "that request"
          }".`
        );

        return;
      }

      const latest = matches[0];

      setAiFilterTerm("");
      await openEmail(latest);

      addAssistantMessage(
        "assistant",
        `Opening the latest email from ${
          sender || "your inbox"
        }.`
      );

      return;
    }

    // =======================================================
    // REPLY CURRENT EMAIL
    // =======================================================

    if (
      actionType === "reply_current" ||
      actionType === "reply"
    ) {
      if (!selectedEmail) {
        addAssistantMessage(
          "assistant",
          "Please open an email first so I know which message to reply to."
        );

        return;
      }

      startReply(action.body || "", true);

      addAssistantMessage(
        "assistant",
        "I opened the reply box and filled in your reply. Please review it before sending."
      );

      return;
    }

    // =======================================================
    // SENT
    // =======================================================

    if (
      actionType === "sent" ||
      actionType === "show_sent"
    ) {
      setCurrentFolder("sent");
      setSelectedEmail(null);
      setAiFilterTerm("");
      setSearchTerm("");

      addAssistantMessage(
        "assistant",
        "Showing your sent emails."
      );

      return;
    }

    // =======================================================
    // INBOX
    // =======================================================

    if (
      actionType === "inbox" ||
      actionType === "show_inbox"
    ) {
      setCurrentFolder("inbox");
      setSelectedEmail(null);
      setAiFilterTerm("");
      setSearchTerm("");

      addAssistantMessage(
        "assistant",
        "Showing your inbox."
      );

      return;
    }

    // =======================================================
    // OPEN SPECIFIC EMAIL
    // =======================================================

    if (actionType === "open") {
      if (action.email_id) {
        const matchingEmail =
          emails.find(
            (email) =>
              email.id === action.email_id
          );

        if (matchingEmail) {
          await openEmail(
            matchingEmail
          );

          addAssistantMessage(
            "assistant",
            "I opened the requested email."
          );

          return;
        }
      }
    }
  };

  // =========================================================
  // AI ASSISTANT REQUEST
  // =========================================================

  const handleAssistantSend = async () => {
    const message =
      assistantInput.trim();

    if (!message || assistantLoading) {
      return;
    }

    addAssistantMessage(
      "user",
      message
    );

    setAssistantInput("");
    setAssistantLoading(true);

    try {
      const context = {
        currentFolder,

        selectedEmail: selectedEmail
          ? {
              id: selectedEmail.id,
              from: selectedEmail.from,
              to: selectedEmail.to,
              subject:
                selectedEmail.subject,
              threadId:
                selectedEmail.threadId ||
                selectedEmail.thread_id ||
                "",
              messageId:
                selectedEmail.messageId ||
                selectedEmail.message_id ||
                "",
            }
          : null,
      };

      const response = await fetch(
        `${API_BASE}/api/assistant`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            message,
            context,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
            "Assistant request failed"
        );
      }

      if (data.action) {
        await executeAssistantAction(
          data.action
        );
      } else if (
        data.result &&
        data.result.action
      ) {
        await executeAssistantAction(
          data.result
        );
      } else {
        addAssistantMessage(
          "assistant",
          data.response ||
            data.message ||
            "I processed your request."
        );
      }
    } catch (err) {
      console.error(
        "Assistant error:",
        err
      );

      addAssistantMessage(
        "assistant",
        "Sorry, I couldn't process that request."
      );
    } finally {
      setAssistantLoading(false);
    }
  };

  const handleAssistantKeyDown = (
    event
  ) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleAssistantSend();
    }
  };

  // =========================================================
  // UI
  // =========================================================

  return (
    <div className="app">

      {/* =====================================================
          SIDEBAR
          ===================================================== */}

      <aside className="sidebar">

        <div className="logo">
          <div className="logo-icon">
            ✦
          </div>

          <span>Nebula Mail</span>
        </div>

        <button
          className="compose-button"
          onClick={() =>
            openCompose()
          }
        >
          ✏️ Compose
        </button>

        <nav className="sidebar-nav">

          <button
            className={`nav-item ${
              currentFolder ===
              "inbox"
                ? "active"
                : ""
            }`}
            onClick={openInbox}
          >
            📥 Inbox

            {currentFolder ===
              "inbox" && (
              <span className="count">
                {emails.length}
              </span>
            )}
          </button>

          <button
            className={`nav-item ${
              currentFolder ===
              "sent"
                ? "active"
                : ""
            }`}
            onClick={openSent}
          >
            📤 Sent
          </button>

        </nav>

        <div className="sidebar-bottom">

          <button className="nav-item">
            ⚙️ Settings
          </button>

        </div>

      </aside>

      {/* =====================================================
          MAIN
          ===================================================== */}

      <main className="main">

        {!selectedEmail ? (

          <>
            <div className="header">

              <div>
                <h1>
                  {currentFolder ===
                  "sent"
                    ? "Sent"
                    : "Inbox"}
                </h1>

                <p>
                  {currentFolder ===
                  "sent"
                    ? "Messages you've sent"
                    : "Your messages"}
                </p>
              </div>

              <div className="header-actions">

                <div
                  className="live-sync-indicator"
                  title={
                    liveSync
                      ? `Gmail real-time sync is active (version ${syncVersion})`
                      : "Connecting to Gmail real-time sync..."
                  }
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "13px",
                    fontWeight: "600",
                    whiteSpace: "nowrap",
                  }}
                >
                  <span>
                    {liveSync ? "🟢" : "🟡"}
                  </span>
                  <span>
                    {liveSync ? "Live" : "Connecting"}
                  </span>
                </div>

                <div className="search-box">
                  <span>🔍</span>

                  <input
                    type="text"
                    placeholder="Search emails..."
                    value={
                      searchTerm
                    }
                    onChange={(event) =>
                      setSearchTerm(
                        event.target.value
                      )
                    }
                  />
                </div>

                <div className="profile">
                  P
                </div>

              </div>

            </div>

            {/* AI FILTER */}

            {aiFilterTerm && (
              <div className="ai-filter-bar">

                <span>
                  🤖 AI filter active:
                  {" "}
                  {aiFilterTerm}
                </span>

                <button
                  onClick={
                    clearAiFilter
                  }
                >
                  Clear
                </button>

              </div>
            )}

            {/* EMAILS */}

            {loading ? (

              <div className="email-status">
                Loading emails...
              </div>

            ) : error ? (

              <div className="email-status error">

                {error}

                <button
                  className="retry-button"
                  onClick={() =>
                    fetchEmails(true)
                  }
                >
                  Retry
                </button>

              </div>

            ) : filteredEmails.length ===
              0 ? (

              <div className="email-status">
                No emails found.
              </div>

            ) : (

              <div className="email-list">

                {filteredEmails.map(
                  (email) => (

                    <div
                      className="email-card"
                      key={email.id}
                      onClick={() =>
                        openEmail(
                          email
                        )
                      }
                    >

                      <div className="avatar">

                        {(
                          currentFolder ===
                          "sent"
                            ? email.to
                            : email.from
                        )
                          ?.charAt(0)
                          ?.toUpperCase() ||
                          "?"}

                      </div>

                      <div className="email-content">

                        <div className="email-top">

                          <strong>

                            {currentFolder ===
                            "sent"
                              ? `To: ${
                                  email.to ||
                                  "Unknown"
                                }`
                              : email.from ||
                                "Unknown sender"}

                          </strong>

                          <span>
                            {email.date ||
                              ""}
                          </span>

                        </div>

                        <h3>
                          {email.subject ||
                            "(No subject)"}
                        </h3>

                        <p>
                          {email.snippet ||
                            "No preview available"}
                        </p>

                      </div>

                    </div>

                  )
                )}

              </div>

            )}

          </>

        ) : (

          /* ==================================================
             EMAIL DETAIL
             ================================================== */

          <div className="email-detail">

            <button
              className="back-button"
              onClick={
                closeEmailDetail
              }
            >
              ← Back to{" "}
              {currentFolder ===
              "sent"
                ? "Sent"
                : "Inbox"}
            </button>

            {loadingDetail ? (

              <div className="email-status">
                Loading email...
              </div>

            ) : (

              <>

                <div className="email-detail-header">

                  <div className="detail-avatar">
                    {(
                      selectedEmail.from ||
                      "?"
                    )
                      .charAt(0)
                      .toUpperCase()}
                  </div>

                  <div>

                    <h2>
                      {selectedEmail.subject ||
                        "(No subject)"}
                    </h2>

                    <p>
                      <strong>
                        From:
                      </strong>{" "}
                      {selectedEmail.from ||
                        ""}
                    </p>

                    <p>
                      <strong>
                        To:
                      </strong>{" "}
                      {selectedEmail.to ||
                        ""}
                    </p>

                    <p>
                      <strong>
                        Date:
                      </strong>{" "}
                      {selectedEmail.date ||
                        ""}
                    </p>

                  </div>

                </div>

                {/* REPLY */}

                {currentFolder !==
                  "sent" && (

                  <button
                    className="reply-button"
                    onClick={() =>
                      startReply()
                    }
                  >
                    ↩ Reply
                  </button>

                )}

                {/* REPLY BOX */}

                {isReplying && (

                  <div className="reply-box">

                    {aiReplyPending && (
                      <div className="ai-confirmation">
                        🤖 AI prepared this
                        reply. Please review
                        it before sending.
                      </div>
                    )}

                    <div className="reply-title">
                      Reply
                    </div>

                    <input
                      className="compose-input"
                      name="to"
                      value={
                        replyData.to
                      }
                      onChange={
                        handleReplyChange
                      }
                      placeholder="To"
                    />

                    <input
                      className="compose-input"
                      name="subject"
                      value={
                        replyData.subject
                      }
                      onChange={
                        handleReplyChange
                      }
                      placeholder="Subject"
                    />

                    <textarea
                      className="compose-message"
                      name="body"
                      value={
                        replyData.body
                      }
                      onChange={
                        handleReplyChange
                      }
                      placeholder="Write your reply..."
                    />

                    <div className="reply-actions">

                      <button
                        className="cancel-reply"
                        onClick={
                          cancelReply
                        }
                        disabled={
                          isSendingReply
                        }
                      >
                        Cancel
                      </button>

                      <button
                        className="send-button"
                        onClick={
                          handleReplySend
                        }
                        disabled={
                          isSendingReply
                        }
                      >
                        {isSendingReply
                          ? "Sending..."
                          : "Send Reply ✈️"}
                      </button>

                    </div>

                  </div>

                )}

                {/* BODY */}

                <div className="email-detail-body">
                  {emailBody ||
                    "No message content available."}
                </div>

              </>

            )}

          </div>

        )}

      </main>

      {/* =====================================================
          AI ASSISTANT
          ===================================================== */}

      <aside className="assistant">

        <div className="assistant-header">

          <div className="ai-icon">
            ✦
          </div>

          <div>
            <h2>
              AI Assistant
            </h2>

            <p>
              Ask Nebula
            </p>
          </div>

        </div>

        <div className="assistant-body">

          {assistantMessages.length ===
            0 && (

            <div className="welcome-message">

              <strong>
                Hi! I'm Nebula AI.
              </strong>

              <p>
                I can control your
                mail interface for you.
              </p>

              <div className="suggestion">
                “Compose an email to
                someone@example.com saying
                hello”
              </div>

              <div className="suggestion">
                “Show me emails from LinkedIn”
              </div>

              <div className="suggestion">
                “Open the latest email from
                LinkedIn”
              </div>

              <div className="suggestion">
                “Show my sent emails”
              </div>

              <div className="suggestion">
                “Reply to this email saying
                thank you”
              </div>

            </div>

          )}

          {assistantMessages.map(
            (message, index) => (

              <div
                key={index}
                className={
                  message.role ===
                  "user"
                    ? "assistant-user-message"
                    : "assistant-message"
                }
              >
                {message.text}
              </div>

            )
          )}

          {assistantLoading && (
            <div className="assistant-message">
              Thinking...
            </div>
          )}

        </div>

        <div className="assistant-input">

          <input
            type="text"
            placeholder="Ask your assistant..."
            value={
              assistantInput
            }
            onChange={(event) =>
              setAssistantInput(
                event.target.value
              )
            }
            onKeyDown={
              handleAssistantKeyDown
            }
          />

          <button
            onClick={
              handleAssistantSend
            }
            disabled={
              assistantLoading
            }
          >
            ➤
          </button>

        </div>

      </aside>

      {/* =====================================================
          COMPOSE WINDOW
          ===================================================== */}

      {showCompose && (

        <div className="compose-overlay">

          <div className="compose-window">

            <div className="compose-header">

              <h2>
                New Message
              </h2>

              <button
                className="close-button"
                onClick={
                  closeCompose
                }
              >
                ✕
              </button>

            </div>

            {aiComposePending && (
              <div className="ai-confirmation compose-confirmation">
                🤖 AI prepared this
                email. Please review it
                before sending.
              </div>
            )}

            <input
              className="compose-input"
              name="to"
              value={
                composeData.to
              }
              onChange={
                handleComposeChange
              }
              placeholder="To"
            />

            <input
              className="compose-input"
              name="subject"
              value={
                composeData.subject
              }
              onChange={
                handleComposeChange
              }
              placeholder="Subject"
            />

            <textarea
              className="compose-message"
              name="body"
              value={
                composeData.body
              }
              onChange={
                handleComposeChange
              }
              placeholder="Write your message..."
            />

            <div className="compose-footer">

              <button
                className="send-button"
                onClick={
                  handleSend
                }
                disabled={
                  isSending
                }
              >
                {isSending
                  ? "Sending..."
                  : "Send ✈️"}
              </button>

            </div>

          </div>

        </div>

      )}

    </div>
  );
}

export default App;