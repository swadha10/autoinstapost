import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getFolderInfo, getScheduleConfig, saveCredentials, saveScheduleConfig, getInstagramConnectUrl, getMyCredentials } from "../api/client";

const SA_EMAIL = "insta-auto-post@insta-auto-post-488807.iam.gserviceaccount.com";
const IG_GRADIENT = "linear-gradient(135deg, #405de6, #5851db, #833ab4, #c13584, #e1306c, #fd1d1d)";

const STEPS = [
  { title: "Google Drive", subtitle: "Connect your photo folder" },
  { title: "Instagram", subtitle: "Connect your Instagram account" },
  { title: "All Set!", subtitle: "You're ready to go" },
];

const inputStyle = {
  width: "100%", padding: "10px 14px",
  border: "1px solid #ddd", borderRadius: "8px",
  fontSize: "14px", outline: "none", boxSizing: "border-box",
  fontFamily: "inherit",
};
const labelStyle = { display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px", color: "#444" };
const fieldStyle = { marginBottom: "16px" };
const hintStyle = { fontSize: "12px", color: "#888", marginTop: "4px" };

function parseFolderId(raw) {
  const s = raw.trim();
  const m = s.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : s.replace(/[^a-zA-Z0-9_-]/g, "") || s;
}

function CopyBox({ value }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "#f5f5f5", border: "1px solid #e0e0e0", borderRadius: "8px", padding: "10px 14px", marginBottom: "8px" }}>
      <code style={{ flex: 1, fontSize: "12px", color: "#333", wordBreak: "break-all" }}>{value}</code>
      <button
        onClick={copy}
        style={{ flexShrink: 0, padding: "4px 12px", fontSize: "12px", background: copied ? "#1a7a40" : "#111", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}

export default function SetupWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Step 1 — Google Drive
  const [driveUrl, setDriveUrl] = useState("");
  const [verifiedFolder, setVerifiedFolder] = useState(null); // { id, name }
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState("");

  // Step 2 — Instagram
  const [igConnected, setIgConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [oauthMsg, setOauthMsg] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("ig_connected") === "1") {
      setOauthMsg({ type: "success", text: "Instagram connected!" });
      setIgConnected(true);
      window.history.replaceState({}, "", window.location.pathname);
      setStep(1); // jump to step 2 if redirected back here
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
      setStep(1);
    }
    // Check if already connected
    getMyCredentials().then((c) => {
      if (c.instagram_access_token) setIgConnected(true);
    }).catch(() => {});
  }, []);

  async function handleVerify(e) {
    e.preventDefault();
    const id = parseFolderId(driveUrl);
    if (!id) return;
    setVerifying(true);
    setVerifyError("");
    setVerifiedFolder(null);
    try {
      const info = await getFolderInfo(id);
      setVerifiedFolder(info);
    } catch (err) {
      setVerifyError(err.message);
    } finally {
      setVerifying(false);
    }
  }

  async function handleStep1Next(e) {
    e.preventDefault();
    if (!verifiedFolder) return;
    setSaving(true);
    setError("");
    try {
      let existingConfig = {};
      try { existingConfig = await getScheduleConfig(); } catch {}
      await saveScheduleConfig({ ...existingConfig, folder_id: verifiedFolder.id });
      setStep(1);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

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

  async function handleSkip() {
    // Create an empty credentials row so has_credentials returns true
    try { await saveCredentials({}); } catch {}
    setStep(2);
  }

  const progressPct = (step / (STEPS.length - 1)) * 100;

  return (
    <div style={{ minHeight: "100vh", background: "#fafafa", display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 24px", fontFamily: "system-ui, sans-serif" }}>
      {/* Logo */}
      <div style={{ fontWeight: 900, fontSize: "22px", marginBottom: "32px", background: IG_GRADIENT, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
        AutoIG
      </div>

      {/* Step dots */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
        {STEPS.map((s, i) => (
          <div key={i} style={{
            width: "32px", height: "32px", borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "13px", fontWeight: 700,
            background: i <= step ? IG_GRADIENT : "#eee",
            color: i <= step ? "#fff" : "#999",
          }}>
            {i < step ? "✓" : i + 1}
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div style={{ width: "100%", maxWidth: "480px", height: "4px", background: "#eee", borderRadius: "2px", marginBottom: "32px" }}>
        <div style={{ height: "4px", background: IG_GRADIENT, borderRadius: "2px", width: `${progressPct}%`, transition: "width 0.4s ease" }} />
      </div>

      <div style={{ width: "100%", maxWidth: "480px", background: "#fff", borderRadius: "16px", boxShadow: "0 4px 24px #0002", padding: "36px" }}>
        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "20px", fontWeight: 800, color: "#111", marginBottom: "4px" }}>{STEPS[step].title}</div>
          <div style={{ fontSize: "13px", color: "#888" }}>{STEPS[step].subtitle}</div>
        </div>

        {/* ── Step 1: Google Drive ── */}
        {step === 0 && (
          <form onSubmit={verifiedFolder ? handleStep1Next : handleVerify}>
            <p style={{ fontSize: "13px", color: "#555", lineHeight: "1.6", marginBottom: "16px" }}>
              Share your Google Drive folder with our service account so AutoIG can read your photos.
            </p>

            <div style={fieldStyle}>
              <label style={labelStyle}>Service account email — share your folder with this address</label>
              <CopyBox value={SA_EMAIL} />
              <p style={hintStyle}>
                In Google Drive: open your folder → Share → paste the email above → set role to <strong>Viewer</strong> → Send
              </p>
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Your Google Drive folder URL</label>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  style={{ ...inputStyle, flex: 1 }}
                  placeholder="https://drive.google.com/drive/folders/…"
                  value={driveUrl}
                  onChange={(e) => { setDriveUrl(e.target.value); setVerifiedFolder(null); setVerifyError(""); }}
                />
                {!verifiedFolder && (
                  <button
                    type="button"
                    onClick={handleVerify}
                    disabled={!driveUrl.trim() || verifying}
                    style={{
                      padding: "10px 16px", whiteSpace: "nowrap", fontWeight: 600, fontSize: "13px",
                      background: !driveUrl.trim() || verifying ? "#ccc" : "#111",
                      color: "#fff", border: "none", borderRadius: "8px",
                      cursor: !driveUrl.trim() || verifying ? "not-allowed" : "pointer",
                    }}
                  >
                    {verifying ? "Checking…" : "Verify"}
                  </button>
                )}
              </div>
            </div>

            {verifiedFolder && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px" }}>
                <span>✅</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "14px", color: "#166534" }}>Folder verified!</div>
                  <div style={{ fontSize: "13px", color: "#15803d" }}>📁 {verifiedFolder.name}</div>
                </div>
              </div>
            )}

            {verifyError && (
              <div style={{ background: "#fff8f0", border: "1px solid #f5c18a", borderRadius: "8px", padding: "12px 14px", marginBottom: "16px", fontSize: "13px", color: "#b45309" }}>
                <strong>Folder not accessible.</strong> Make sure you shared it with the service account email above and try verifying again.
              </div>
            )}

            {error && <div style={{ color: "#c00", fontSize: "13px", marginBottom: "12px" }}>{error}</div>}

            <button
              type="submit"
              disabled={!verifiedFolder || saving}
              style={{
                width: "100%", padding: "12px", fontWeight: 700, fontSize: "15px",
                background: !verifiedFolder || saving ? "#ccc" : IG_GRADIENT,
                color: "#fff", border: "none", borderRadius: "10px",
                cursor: !verifiedFolder || saving ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Saving…" : "Next →"}
            </button>
          </form>
        )}

        {/* ── Step 2: Instagram ── */}
        {step === 1 && (
          <div>
            <p style={{ fontSize: "13px", color: "#555", lineHeight: "1.6", marginBottom: "20px" }}>
              Connect your Instagram Business or Creator account via Facebook Login.
            </p>

            {oauthMsg && (
              <div style={{
                marginBottom: "16px", padding: "12px 16px", borderRadius: "10px",
                background: oauthMsg.type === "success" ? "#e6f9ee" : "#fff0f0",
                border: `1px solid ${oauthMsg.type === "success" ? "#a3d9b1" : "#fcc"}`,
                color: oauthMsg.type === "success" ? "#1a7a40" : "#c00",
                fontWeight: 600, fontSize: "13px",
              }}>
                {oauthMsg.type === "success" ? "✓ " : "✗ "}{oauthMsg.text}
              </div>
            )}

            {igConnected ? (
              <div style={{ marginBottom: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "14px 16px", background: "#e6f9ee", border: "1px solid #a3d9b1", borderRadius: "10px" }}>
                  <span style={{ fontSize: "22px" }}>✓</span>
                  <div style={{ fontWeight: 700, color: "#1a7a40", fontSize: "14px" }}>Instagram connected!</div>
                </div>
              </div>
            ) : (
              <button
                onClick={handleConnectInstagram}
                disabled={connecting}
                style={{
                  width: "100%", padding: "14px",
                  background: connecting ? "#ccc" : "#1877f2",
                  color: "#fff", border: "none", borderRadius: "10px",
                  cursor: connecting ? "not-allowed" : "pointer",
                  fontSize: "15px", fontWeight: 700, marginBottom: "12px",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
                }}
              >
                <span style={{ fontSize: "20px" }}>f</span>
                {connecting ? "Redirecting to Facebook…" : "Connect with Facebook"}
              </button>
            )}

            <div style={{ padding: "10px 14px", background: "#fff8e6", borderRadius: "8px", border: "1px solid #f5d88a", fontSize: "12px", color: "#78350f", lineHeight: "1.6", marginBottom: "20px" }}>
              Make sure your Instagram account is a <strong>Business</strong> or <strong>Creator</strong> account — Personal accounts won't work.
            </div>

            {error && <div style={{ color: "#c00", fontSize: "13px", marginBottom: "12px" }}>{error}</div>}

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                type="button"
                onClick={handleSkip}
                style={{ flex: 1, padding: "12px", background: "#f5f5f5", color: "#555", border: "none", borderRadius: "10px", cursor: "pointer", fontWeight: 600, fontSize: "14px" }}
              >
                Skip for now
              </button>
              {igConnected && (
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  style={{ flex: 2, padding: "12px", background: IG_GRADIENT, color: "#fff", border: "none", borderRadius: "10px", cursor: "pointer", fontWeight: 700, fontSize: "15px" }}
                >
                  Continue →
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Step 3: Done ── */}
        {step === 2 && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "56px", marginBottom: "16px" }}>🎉</div>
            <div style={{ fontSize: "18px", fontWeight: 700, color: "#111", marginBottom: "8px" }}>You're all set!</div>
            <p style={{ fontSize: "14px", color: "#666", lineHeight: "1.6", marginBottom: "28px" }}>
              Your Google Drive is connected. Head to your dashboard to browse photos, generate captions, and post to Instagram.
            </p>
            <button
              onClick={() => navigate("/app", { replace: true })}
              style={{ padding: "14px 40px", background: IG_GRADIENT, color: "#fff", border: "none", borderRadius: "10px", cursor: "pointer", fontWeight: 700, fontSize: "15px" }}
            >
              Go to Dashboard →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
