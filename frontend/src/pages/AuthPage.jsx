import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { loginApi, register } from "../api/client";
import { useAuth } from "../context/AuthContext";

const IG_GRADIENT = "linear-gradient(135deg, #405de6, #5851db, #833ab4, #c13584, #e1306c, #fd1d1d)";

export default function AuthPage() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") === "register" ? "register" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) navigate("/app", { replace: true });
  }, [isAuthenticated]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (tab === "register" && password !== confirm) {
      setError("Passwords don't match");
      return;
    }

    setLoading(true);
    try {
      let data;
      if (tab === "login") {
        data = await loginApi(email, password);
      } else {
        data = await register(email, password);
      }
      await login(data.token);
      navigate(data.setup_complete ? "/app" : "/setup", { replace: true });
    } catch (err) {
      let msg = err.message;
      try { msg = JSON.parse(msg).detail || msg; } catch {}
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    width: "100%", padding: "11px 14px",
    border: "1px solid #ddd", borderRadius: "8px",
    fontSize: "14px", outline: "none", boxSizing: "border-box",
  };
  const labelStyle = { display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px", color: "#444" };
  const fieldStyle = { marginBottom: "18px" };

  return (
    <div style={{ minHeight: "100vh", background: "#fafafa", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      {/* Logo */}
      <div
        style={{ fontWeight: 900, fontSize: "26px", marginBottom: "32px", background: IG_GRADIENT, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", cursor: "pointer" }}
        onClick={() => navigate("/")}
      >
        AutoIG
      </div>

      <div style={{ width: "100%", maxWidth: "420px", background: "#fff", borderRadius: "16px", boxShadow: "0 4px 24px #0002", padding: "clamp(20px, 5vw, 36px)" }}>
        {/* Tab bar */}
        <div style={{ display: "flex", borderBottom: "2px solid #eee", marginBottom: "28px" }}>
          {["login", "register"].map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(""); }}
              style={{
                flex: 1, padding: "10px", background: "none", border: "none",
                fontWeight: tab === t ? 700 : 500, fontSize: "14px",
                color: tab === t ? "#c13584" : "#666", cursor: "pointer",
                borderBottom: tab === t ? "2px solid #c13584" : "2px solid transparent",
                marginBottom: "-2px",
              }}
            >
              {t === "login" ? "Sign In" : "Create Account"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Email</label>
            <input
              style={inputStyle}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Password</label>
            <input
              style={inputStyle}
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={tab === "register" ? "At least 8 characters" : ""}
              autoComplete={tab === "login" ? "current-password" : "new-password"}
            />
          </div>

          {tab === "register" && (
            <div style={fieldStyle}>
              <label style={labelStyle}>Confirm Password</label>
              <input
                style={inputStyle}
                type="password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Same as above"
                autoComplete="new-password"
              />
            </div>
          )}

          {error && (
            <div style={{
              background: "#fff0f0", border: "1px solid #fcc", borderRadius: "8px",
              padding: "10px 14px", color: "#c00", fontSize: "13px", marginBottom: "18px",
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%", padding: "12px",
              background: loading ? "#ccc" : IG_GRADIENT,
              color: "#fff", border: "none", borderRadius: "8px",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 700, fontSize: "15px",
            }}
          >
            {loading ? "Please wait…" : tab === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>
      </div>
    </div>
  );
}
