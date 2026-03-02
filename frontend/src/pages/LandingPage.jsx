import { useNavigate } from "react-router-dom";

const IG_GRADIENT = "linear-gradient(135deg, #405de6, #5851db, #833ab4, #c13584, #e1306c, #fd1d1d)";

const features = [
  { icon: "✨", title: "AI Captions", desc: "Gemini & Claude generate human-sounding captions that match your tone — not robotic content-marketing copy." },
  { icon: "📍", title: "GPS Location", desc: "EXIF GPS data is extracted automatically and matched to Instagram location tags for better reach." },
  { icon: "🗓️", title: "Smart Scheduling", desc: "Set a daily, weekday, or every-N-days schedule. Posts go out automatically while you sleep." },
  { icon: "🖼️", title: "Carousel Posts", desc: "Select up to 10 photos from the same location and they're posted as a single carousel." },
  { icon: "📅", title: "EXIF Dates", desc: "Original capture date is pulled from photo metadata and woven naturally into the caption." },
  { icon: "✅", title: "Approval Queue", desc: "Enable approval mode and review each post before it goes live — full control, zero friction." },
];

const steps = [
  { n: "1", title: "Connect Google Drive", desc: "Paste your Drive folder ID. AutoIG reads your photos — no upload needed." },
  { n: "2", title: "AI Generates Caption", desc: "Gemini or Claude analyzes your photo, extracts location and date, and writes the perfect caption." },
  { n: "3", title: "Posted to Instagram", desc: "Single photo or carousel — published to your account, on your schedule, automatically." },
];

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: "100vh", background: "#fafafa", fontFamily: "system-ui, sans-serif" }}>
      {/* Nav */}
      <nav style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "14px 16px", background: "#fff", boxShadow: "0 1px 4px #0001",
        flexWrap: "wrap", gap: "8px",
      }}>
        <div style={{ fontWeight: 800, fontSize: "20px", background: IG_GRADIENT, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          AutoIG
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          <button
            onClick={() => navigate("/auth")}
            style={{ padding: "8px 18px", background: "none", border: "1px solid #ddd", borderRadius: "8px", cursor: "pointer", fontWeight: 600, fontSize: "14px" }}
          >
            Sign In
          </button>
          <button
            onClick={() => navigate("/auth?tab=register")}
            style={{ padding: "8px 18px", background: IG_GRADIENT, color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 600, fontSize: "14px" }}
          >
            Get Started Free
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ background: IG_GRADIENT, padding: "60px 20px", textAlign: "center" }}>
        <h1 style={{ color: "#fff", fontSize: "clamp(36px, 6vw, 64px)", fontWeight: 900, margin: "0 0 16px", lineHeight: 1.1 }}>
          AutoIG
        </h1>
        <p style={{ color: "rgba(255,255,255,0.9)", fontSize: "clamp(18px, 2.5vw, 24px)", margin: "0 0 40px", maxWidth: "600px", marginInline: "auto" }}>
          Your photos. Posted automatically.
        </p>
        <p style={{ color: "rgba(255,255,255,0.8)", fontSize: "16px", margin: "0 0 40px", maxWidth: "520px", marginInline: "auto" }}>
          Connect Google Drive, let AI write the caption, and your Instagram posts itself — on your schedule.
        </p>
        <div style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => navigate("/auth?tab=register")}
            style={{
              padding: "14px 32px", background: "#fff", color: "#c13584",
              border: "none", borderRadius: "10px", cursor: "pointer",
              fontWeight: 800, fontSize: "16px",
            }}
          >
            Get Started Free
          </button>
          <button
            onClick={() => navigate("/auth")}
            style={{
              padding: "14px 32px", background: "rgba(255,255,255,0.15)", color: "#fff",
              border: "2px solid rgba(255,255,255,0.5)", borderRadius: "10px", cursor: "pointer",
              fontWeight: 700, fontSize: "16px",
            }}
          >
            Sign In
          </button>
        </div>
      </section>

      {/* Features */}
      <section style={{ maxWidth: "1100px", margin: "0 auto", padding: "48px 16px" }}>
        <h2 style={{ textAlign: "center", fontSize: "32px", fontWeight: 800, marginBottom: "48px", color: "#111" }}>
          Everything you need to post on autopilot
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "16px" }}>
          {features.map((f) => (
            <div key={f.title} style={{
              background: "#fff", borderRadius: "14px", padding: "28px",
              boxShadow: "0 2px 16px #0001", border: "1px solid #f0f0f0",
            }}>
              <div style={{ fontSize: "32px", marginBottom: "12px" }}>{f.icon}</div>
              <div style={{ fontWeight: 700, fontSize: "18px", marginBottom: "8px", color: "#111" }}>{f.title}</div>
              <div style={{ color: "#666", fontSize: "14px", lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section style={{ background: "#fff", padding: "48px 16px" }}>
        <h2 style={{ textAlign: "center", fontSize: "32px", fontWeight: 800, marginBottom: "56px", color: "#111" }}>
          How it works
        </h2>
        <div style={{ display: "flex", gap: "32px", maxWidth: "900px", margin: "0 auto", flexWrap: "wrap", justifyContent: "center" }}>
          {steps.map((s, i) => (
            <div key={s.n} style={{ display: "flex", alignItems: "flex-start", gap: "16px", flex: "1 1 240px" }}>
              <div style={{
                width: "48px", height: "48px", background: IG_GRADIENT,
                borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontWeight: 900, fontSize: "20px", flexShrink: 0,
              }}>
                {s.n}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: "17px", marginBottom: "6px", color: "#111" }}>{s.title}</div>
                <div style={{ color: "#666", fontSize: "14px", lineHeight: 1.6 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA banner */}
      <section style={{ background: IG_GRADIENT, padding: "48px 16px", textAlign: "center" }}>
        <h2 style={{ color: "#fff", fontSize: "28px", fontWeight: 800, marginBottom: "16px" }}>
          Ready to automate your Instagram?
        </h2>
        <button
          onClick={() => navigate("/auth?tab=register")}
          style={{
            padding: "14px 36px", background: "#fff", color: "#c13584",
            border: "none", borderRadius: "10px", cursor: "pointer",
            fontWeight: 800, fontSize: "16px",
          }}
        >
          Create Free Account
        </button>
      </section>

      {/* Footer */}
      <footer style={{ padding: "32px", textAlign: "center", color: "#999", fontSize: "13px", background: "#111" }}>
        <span style={{ color: "#666" }}>AutoIG — built with Google Drive, Gemini, and Instagram Graph API</span>
      </footer>
    </div>
  );
}
