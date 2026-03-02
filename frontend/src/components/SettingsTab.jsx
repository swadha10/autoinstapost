import { useEffect, useState } from "react";
import { getMyCredentials, saveCredentials, getInstagramConnectUrl, getGoogleConnectUrl } from "../api/client";

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
  fieldWrap: { marginBottom: "14px" },
  label: { display: "block", fontSize: "13px", fontWeight: 600, color: "#444", marginBottom: "5px" },
  input: {
    width: "100%", padding: "9px 12px",
    border: "1px solid #ddd", borderRadius: "8px",
    fontSize: "13px", outline: "none", boxSizing: "border-box",
    fontFamily: "inherit",
  },
  hint: { fontSize: "11px", color: "#aaa", marginTop: "3px" },
  saveBtn: (loading) => ({
    padding: "10px 24px",
    background: loading ? "#ccc" : "#111",
    color: "#fff", border: "none", borderRadius: "8px",
    cursor: loading ? "not-allowed" : "pointer",
    fontWeight: 700, fontSize: "14px", width: "100%",
  }),
  savedBadge: {
    display: "block", textAlign: "center",
    background: "#e6f9ee", color: "#1a7a40",
    borderRadius: "6px", padding: "8px",
    fontSize: "13px", fontWeight: 600, marginTop: "8px",
  },
  errorBadge: {
    display: "block", textAlign: "center",
    background: "#fff0f0", color: "#c00",
    borderRadius: "6px", padding: "8px",
    fontSize: "12px", fontWeight: 600, marginTop: "8px",
  },
};

const link = (href, text) => (
  <a href={href} target="_blank" rel="noreferrer"
    style={{ color: "#c13584", fontWeight: 600, textDecoration: "none" }}>
    {text}
  </a>
);

const step = (n, text) => (
  <div style={{ display: "flex", gap: "10px", marginBottom: "10px", alignItems: "flex-start" }}>
    <div style={{
      minWidth: "22px", height: "22px", borderRadius: "50%",
      background: "#405de6", color: "#fff",
      fontSize: "12px", fontWeight: 700,
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    }}>{n}</div>
    <div style={{ fontSize: "13px", color: "#444", lineHeight: "1.6" }}>{text}</div>
  </div>
);

function Guide() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: "16px", borderRadius: "12px", border: "1px solid #e8e8ff", overflow: "hidden" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", padding: "14px 16px",
          background: "#f5f5ff", border: "none", cursor: "pointer",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}
      >
        <span style={{ fontWeight: 700, fontSize: "14px", color: "#405de6" }}>
          📖 How to set up your Facebook App (required for OAuth)
        </span>
        <span style={{ color: "#405de6", fontSize: "16px" }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ padding: "16px", background: "#fafafe", borderTop: "1px solid #e8e8ff" }}>

          {/* Part 1 */}
          <div style={{ fontWeight: 700, fontSize: "13px", color: "#111", marginBottom: "10px", marginTop: "4px" }}>
            Part 1 — Create a Facebook App
          </div>
          {step(1, <>{link("https://developers.facebook.com/apps/creation", "Go to developers.facebook.com/apps") } → click <strong>Create App</strong></>)}
          {step(2, <>Choose <strong>Other</strong> → <strong>Business</strong> → give it any name (e.g. "AutoIG")</>)}
          {step(3, <>In your app dashboard, go to <strong>Add Product</strong> → find <strong>Instagram Graph API</strong> → click <strong>Set Up</strong></>)}
          {step(4, <>Under <strong>App Settings → Basic</strong>, copy your <strong>App ID</strong> and <strong>App Secret</strong> — paste them below</>)}

          <div style={{ height: "1px", background: "#e8e8ff", margin: "14px 0" }} />

          {/* Part 2 */}
          <div style={{ fontWeight: 700, fontSize: "13px", color: "#111", marginBottom: "10px" }}>
            Part 2 — Add the OAuth Redirect URI
          </div>
          {step(1, <>In your app dashboard, go to <strong>Facebook Login for Business → Settings</strong></>)}
          {step(2, <>Under <strong>Valid OAuth Redirect URIs</strong>, add:</>)}
          <div style={{
            background: "#1e1e2e", color: "#a6e3a1", borderRadius: "8px",
            padding: "10px 14px", fontSize: "12px", fontFamily: "monospace",
            wordBreak: "break-all", marginBottom: "10px",
          }}>
            {window.location.origin}/auth/instagram/callback
          </div>
          {step(3, <>Click <strong>Save Changes</strong></>)}

          <div style={{ marginTop: "12px", padding: "10px 14px", background: "#fff8e6", borderRadius: "8px", border: "1px solid #f5d88a", fontSize: "12px", color: "#78350f", lineHeight: "1.6" }}>
            ⚠️ Make sure your Instagram account is a <strong>Business</strong> or <strong>Creator</strong> account — Personal accounts won't work.
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, value, onChange, placeholder, type = "text" }) {
  return (
    <div style={s.fieldWrap}>
      <label style={s.label}>{label}</label>
      <input
        type={type}
        style={s.input}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || ""}
        autoComplete="off"
      />
      {hint && <div style={s.hint}>{hint}</div>}
    </div>
  );
}

function SecretInput({ label, hint, savedOnServer, onChange, placeholder }) {
  return (
    <div style={s.fieldWrap}>
      <label style={s.label}>
        {label}
        {savedOnServer && <span style={{ fontWeight: 400, color: "#1a7a40", marginLeft: "8px", fontSize: "11px" }}>✓ saved</span>}
      </label>
      <input
        type="password"
        style={s.input}
        placeholder={savedOnServer ? "••• paste new value to update" : placeholder || ""}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
      {hint && <div style={s.hint}>{hint}</div>}
    </div>
  );
}

export default function SettingsTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectingGoogle, setConnectingGoogle] = useState(false);

  // Instagram OAuth state
  const [igConnected, setIgConnected] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [igAccountId, setIgAccountId] = useState("");

  // Facebook App credentials (needed to run OAuth)
  const [fbAppId, setFbAppId] = useState("");
  const [fbAppSecret, setFbAppSecret] = useState("");
  const [publicBaseUrl, setPublicBaseUrl] = useState("");
  const [serverHas, setServerHas] = useState({});

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
        setFbAppId(c.facebook_app_id || "");
        setPublicBaseUrl(c.public_base_url || "");
        setIgConnected(!!c.instagram_access_token);
        setGoogleConnected(!!c.google_photos_connected);
        setServerHas({
          instagram_access_token: !!c.instagram_access_token,
          facebook_app_secret: !!c.facebook_app_secret,
        });
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

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const updates = {
        facebook_app_id: fbAppId.trim(),
        public_base_url: publicBaseUrl.trim(),
        ...(fbAppSecret ? { facebook_app_secret: fbAppSecret } : {}),
      };
      await saveCredentials(updates);
      setSaved(true);
      setFbAppSecret("");
      if (fbAppSecret) setServerHas((p) => ({ ...p, facebook_app_secret: true }));
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ padding: "40px", color: "#999" }}>Loading…</div>;

  return (
    <div>
      <Guide />

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

      {/* Facebook App setup */}
      <div style={s.card}>
        <div style={s.sectionTitle}>Facebook App</div>
        <div style={s.sectionSub}>Required to connect your Instagram account via OAuth</div>
        <Field
          label="Facebook App ID"
          hint="From App Settings → Basic in your Facebook App"
          value={fbAppId}
          onChange={setFbAppId}
          placeholder="123456789…"
        />
        <SecretInput
          label="Facebook App Secret"
          hint="From App Settings → Basic"
          savedOnServer={serverHas.facebook_app_secret}
          onChange={setFbAppSecret}
        />
        <Field
          label="Public URL (ngrok / tunnel)"
          hint={`Run: ngrok http --domain=your-domain.ngrok-free.dev 8000`}
          value={publicBaseUrl}
          onChange={setPublicBaseUrl}
          placeholder="https://xxxx.ngrok-free.dev"
        />
        <button style={s.saveBtn(saving)} onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save App Settings"}
        </button>
        {saved && <div style={s.savedBadge}>Saved!</div>}
      </div>

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
            disabled={connecting || !fbAppId || !serverHas.facebook_app_secret}
            style={{
              width: "100%",
              padding: "12px",
              background: connecting || !fbAppId || !serverHas.facebook_app_secret ? "#ccc" : "#1877f2",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              cursor: connecting || !fbAppId || !serverHas.facebook_app_secret ? "not-allowed" : "pointer",
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

        {(!fbAppId || !serverHas.facebook_app_secret) && !igConnected && (
          <div style={{ fontSize: "12px", color: "#aaa", marginTop: "8px", textAlign: "center" }}>
            Save your Facebook App ID and Secret above first
          </div>
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
