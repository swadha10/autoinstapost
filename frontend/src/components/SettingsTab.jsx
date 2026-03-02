import { useEffect, useState } from "react";
import { getMyCredentials, getInstagramConnectUrl, getGoogleConnectUrl } from "../api/client";

const s = {
  card: {
    background: "#fff",
    borderRadius: "12px",
    padding: "20px",
    boxShadow: "0 2px 12px #0001",
    marginBottom: "16px",
  },
  sectionTitle: { fontSize: "15px", fontWeight: 700, color: "#111", marginBottom: "4px" },
  sectionSub: { fontSize: "12px", color: "#999", marginBottom: "16px" },
  errorBadge: {
    display: "block", textAlign: "center",
    background: "#fff0f0", color: "#c00",
    borderRadius: "6px", padding: "8px",
    fontSize: "12px", fontWeight: 600, marginTop: "8px",
  },
};


export default function SettingsTab() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectingGoogle, setConnectingGoogle] = useState(false);

  // Instagram OAuth state
  const [igConnected, setIgConnected] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [igAccountId, setIgAccountId] = useState("");

  // Check for OAuth result in URL params
  const [oauthMsg, setOauthMsg] = useState(null); // { type: "success"|"error", text }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("ig_connected") === "1") {
      setOauthMsg({ type: "success", text: "Instagram connected successfully!" });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("ig_error")) {
      const errMap = {
        cancelled: "Connection cancelled.",
        invalid_state: "Security check failed — please try again.",
        token_exchange_failed: "Could not exchange token with Facebook.",
        longtoken_failed: "Could not get long-lived token.",
      };
      const code = params.get("ig_error");
      setOauthMsg({ type: "error", text: errMap[code] || `OAuth error: ${code}` });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("google_connected") === "1") {
      setOauthMsg({ type: "success", text: "Google Photos connected successfully!" });
      setGoogleConnected(true);
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("google_error")) {
      const errMap = {
        cancelled: "Connection cancelled.",
        invalid_state: "Security check failed — please try again.",
        token_exchange_failed: "Could not exchange token with Google.",
        no_refresh_token: "Google did not return a refresh token. Try disconnecting the app in your Google account and reconnecting.",
      };
      const code = params.get("google_error");
      setOauthMsg({ type: "error", text: errMap[code] || `Google OAuth error: ${code}` });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    getMyCredentials()
      .then((c) => {
        setIgAccountId(c.instagram_account_id || "");
        setIgConnected(!!c.instagram_access_token);
        setGoogleConnected(!!c.google_photos_connected);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleConnectInstagram() {
    setConnecting(true);
    setError("");
    try {
      const data = await getInstagramConnectUrl();
      window.location.href = data.url;
    } catch (e) {
      setError(e.message);
      setConnecting(false);
    }
  }

  async function handleConnectGoogle() {
    setConnectingGoogle(true);
    setError("");
    try {
      const data = await getGoogleConnectUrl();
      window.location.href = data.url;
    } catch (e) {
      setError(e.message);
      setConnectingGoogle(false);
    }
  }

  if (loading) return <div style={{ padding: "40px", color: "#999" }}>Loading…</div>;

  return (
    <div>
      {/* OAuth result banner */}
      {oauthMsg && (
        <div style={{
          marginBottom: "16px",
          padding: "12px 16px",
          borderRadius: "10px",
          background: oauthMsg.type === "success" ? "#e6f9ee" : "#fff0f0",
          border: `1px solid ${oauthMsg.type === "success" ? "#a3d9b1" : "#fcc"}`,
          color: oauthMsg.type === "success" ? "#1a7a40" : "#c00",
          fontWeight: 600,
          fontSize: "13px",
        }}>
          {oauthMsg.type === "success" ? "✓ " : "✗ "}{oauthMsg.text}
        </div>
      )}

      {/* Instagram connect */}
      <div style={s.card}>
        <div style={s.sectionTitle}>Instagram Account</div>
        <div style={s.sectionSub}>Connect your Instagram Business or Creator account</div>

        {igConnected ? (
          <div style={{ marginBottom: "16px" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: "10px",
              padding: "12px 16px",
              background: "#e6f9ee", border: "1px solid #a3d9b1",
              borderRadius: "10px",
            }}>
              <span style={{ fontSize: "20px" }}>✓</span>
              <div>
                <div style={{ fontWeight: 700, color: "#1a7a40", fontSize: "14px" }}>Instagram connected</div>
                {igAccountId && (
                  <div style={{ fontSize: "12px", color: "#555", marginTop: "2px" }}>Account ID: {igAccountId}</div>
                )}
              </div>
            </div>
            <button
              onClick={handleConnectInstagram}
              disabled={connecting}
              style={{
                marginTop: "10px",
                width: "100%",
                padding: "10px",
                background: "#fff",
                border: "1px solid #ddd",
                borderRadius: "8px",
                cursor: connecting ? "not-allowed" : "pointer",
                fontSize: "13px",
                fontWeight: 600,
                color: "#555",
              }}
            >
              {connecting ? "Redirecting…" : "Reconnect / Switch account"}
            </button>
          </div>
        ) : (
          <button
            onClick={handleConnectInstagram}
            disabled={connecting}
            style={{
              width: "100%",
              padding: "12px",
              background: connecting ? "#ccc" : "#1877f2",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              cursor: connecting ? "not-allowed" : "pointer",
              fontSize: "14px",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}
          >
            <span style={{ fontSize: "18px" }}>f</span>
            {connecting ? "Redirecting to Facebook…" : "Connect with Facebook"}
          </button>
        )}
      </div>

      {/* Google Photos Picker */}
      <div style={s.card}>
        <div style={s.sectionTitle}>Google Photos</div>
        <div style={s.sectionSub}>Pick photos directly from your Google Photos library</div>

        {googleConnected ? (
          <div style={{ marginBottom: "12px" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: "10px",
              padding: "12px 16px",
              background: "#e6f9ee", border: "1px solid #a3d9b1",
              borderRadius: "10px",
            }}>
              <span style={{ fontSize: "20px" }}>✓</span>
              <div>
                <div style={{ fontWeight: 700, color: "#1a7a40", fontSize: "14px" }}>Google Photos connected</div>
                <div style={{ fontSize: "12px", color: "#555", marginTop: "2px" }}>
                  Use the <strong>Google Photos</strong> source in the Manual tab to pick photos
                </div>
              </div>
            </div>
            <button
              onClick={handleConnectGoogle}
              disabled={connectingGoogle}
              style={{
                marginTop: "10px", width: "100%", padding: "10px",
                background: "#fff", border: "1px solid #ddd",
                borderRadius: "8px", cursor: connectingGoogle ? "not-allowed" : "pointer",
                fontSize: "13px", fontWeight: 600, color: "#555",
              }}
            >
              {connectingGoogle ? "Redirecting…" : "Reconnect / Switch account"}
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={handleConnectGoogle}
              disabled={connectingGoogle}
              style={{
                width: "100%", padding: "12px",
                background: connectingGoogle ? "#ccc" : "linear-gradient(135deg,#4285f4,#34a853)",
                color: "#fff", border: "none", borderRadius: "8px",
                cursor: connectingGoogle ? "not-allowed" : "pointer",
                fontSize: "14px", fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              }}
            >
              <span style={{ fontSize: "18px" }}>G</span>
              {connectingGoogle ? "Redirecting to Google…" : "Connect Google Photos"}
            </button>
            <div style={{ fontSize: "12px", color: "#aaa", marginTop: "8px", lineHeight: 1.5 }}>
              You'll be asked to grant access to the <strong>Google Photos Picker</strong> — you can pick which photos to share without giving full library access.
            </div>
          </>
        )}
      </div>

      {error && <div style={s.errorBadge}>{error}</div>}
    </div>
  );
}
