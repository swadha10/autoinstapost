import { useEffect, useState } from "react";
import { getPostHistory, getScheduleStatus, photoRawUrl } from "../api/client";

const SOURCE_LABEL = {
  manual: { text: "Manual", bg: "#e8f0fe", color: "#3c5fa8" },
  scheduled: { text: "Scheduled", bg: "#f0e6ff", color: "#7b3fa8" },
  approved: { text: "Approved", bg: "#fff3e0", color: "#a86a00" },
};

function formatNextRun(isoString) {
  if (!isoString) return null;
  const d = new Date(isoString);
  const now = new Date();
  const diffMs = d - now;
  const diffH = diffMs / 3600000;
  const diffMin = diffMs / 60000;

  const timeStr = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const dateStr = d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });

  if (diffMin < 1) return { label: "in less than a minute", sub: timeStr };
  if (diffMin < 60) return { label: `in ${Math.round(diffMin)} min`, sub: timeStr };
  if (diffH < 24) {
    const today = now.toDateString() === d.toDateString();
    return { label: `${today ? "today" : "tomorrow"} at ${timeStr}`, sub: dateStr };
  }
  return { label: `${dateStr} at ${timeStr}`, sub: null };
}

const s = {
  card: {
    background: "#fff",
    borderRadius: "12px",
    padding: "20px",
    boxShadow: "0 2px 12px #0001",
    marginBottom: "20px",
  },
  sectionTitle: { fontSize: "16px", fontWeight: 700, color: "#111" },
  row: {
    display: "flex",
    gap: "14px",
    alignItems: "flex-start",
    padding: "14px 0",
    borderBottom: "1px solid #f0f0f0",
  },
  thumb: {
    width: "72px",
    height: "72px",
    objectFit: "cover",
    borderRadius: "8px",
    flexShrink: 0,
    background: "#f5f5f5",
  },
  thumbPlaceholder: {
    width: "72px",
    height: "72px",
    borderRadius: "8px",
    background: "#f0f0f0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "22px",
    flexShrink: 0,
  },
  badge: (bg, color) => ({
    display: "inline-block",
    background: bg,
    color,
    borderRadius: "5px",
    padding: "2px 9px",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.3px",
    marginRight: "6px",
  }),
  statusBadge: (ok) => ({
    display: "inline-block",
    background: ok ? "#e6f9ee" : "#fff0f0",
    color: ok ? "#1a7a40" : "#c00",
    borderRadius: "5px",
    padding: "2px 9px",
    fontSize: "11px",
    fontWeight: 700,
    marginRight: "6px",
  }),
  caption: {
    fontSize: "13px",
    color: "#333",
    lineHeight: "1.5",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    marginTop: "4px",
    display: "-webkit-box",
    WebkitLineClamp: 3,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  meta: { fontSize: "11px", color: "#aaa", marginTop: "4px" },
  errorMsg: {
    fontSize: "12px",
    color: "#c00",
    background: "#fff0f0",
    borderRadius: "6px",
    padding: "4px 8px",
    marginTop: "6px",
    wordBreak: "break-word",
  },
  emptyNote: { color: "#999", fontSize: "14px", padding: "12px 0" },
  refreshBtn: {
    padding: "6px 14px",
    background: "#f5f5f5",
    border: "1px solid #ddd",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: 600,
    color: "#444",
  },
};

function CheckItem({ check }) {
  return (
    <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid #f5f5f5" }}>
      <span style={{ fontSize: "14px", marginTop: "1px", flexShrink: 0 }}>
        {check.ok ? "✅" : "❌"}
      </span>
      <div>
        <span style={{ fontSize: "13px", fontWeight: 600, color: "#333" }}>{check.name}</span>
        <span style={{ fontSize: "13px", color: check.ok ? "#555" : "#c00", marginLeft: "8px" }}>
          {check.message}
        </span>
      </div>
    </div>
  );
}

export default function HistoryTab() {
  const [history, setHistory] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function fetchAll() {
    setLoading(true);
    setError("");
    try {
      const [hist, stat] = await Promise.all([getPostHistory(), getScheduleStatus()]);
      setHistory(hist);
      setStatus(stat);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAll(); }, []);

  const nextRun = status?.next_run ? formatNextRun(status.next_run) : null;

  return (
    <div>
      {/* ── Schedule Status ── */}
      <div style={s.card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div style={s.sectionTitle}>Schedule Status</div>
          <button style={s.refreshBtn} onClick={fetchAll} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        {error && (
          <div style={{ background: "#fff0f0", border: "1px solid #fcc", borderRadius: "8px", padding: "10px 14px", color: "#c00", fontSize: "13px", marginBottom: "12px" }}>
            {error}
          </div>
        )}

        {/* Next run banner */}
        {status && (
          <div style={{
            background: nextRun ? (status.all_ok ? "#f0f7ff" : "#fffbf0") : "#f5f5f5",
            border: `1px solid ${nextRun ? (status.all_ok ? "#b8d4f8" : "#f5d88a") : "#e0e0e0"}`,
            borderRadius: "10px",
            padding: "14px 16px",
            marginBottom: "16px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "24px" }}>{nextRun ? (status.all_ok ? "🕐" : "⚠️") : "💤"}</span>
              <div>
                {nextRun ? (
                  <>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "#111" }}>
                      Next post {nextRun.label}
                    </div>
                    {nextRun.sub && (
                      <div style={{ fontSize: "12px", color: "#888", marginTop: "2px" }}>{nextRun.sub}</div>
                    )}
                    {!status.all_ok && (
                      <div style={{ fontSize: "12px", color: "#a86000", marginTop: "4px" }}>
                        Fix the issues below before the next run
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "#888" }}>
                    No scheduled post — enable auto-schedule in the Schedule tab
                  </div>
                )}
              </div>
            </div>

            {/* Upcoming photo pool */}
            {nextRun && status.upcoming_pool?.length > 0 && (
              <div style={{ marginTop: "12px" }}>
                <div style={{ fontSize: "11px", fontWeight: 600, color: "#888", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Will randomly pick 3 from {status.upcoming_pool.length} available
                </div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {status.upcoming_pool.map((photo) => (
                    <div key={photo.id} style={{ position: "relative" }}>
                      <img
                        src={photoRawUrl(photo.id)}
                        alt={photo.name}
                        title={photo.name}
                        style={{
                          width: "52px", height: "52px",
                          objectFit: "cover", borderRadius: "6px",
                          background: "#e0e0e0",
                        }}
                        onError={(e) => { e.target.style.background = "#e0e0e0"; e.target.style.display = "none"; }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Validation checklist */}
        {status?.checks && (
          <div>
            {status.checks.map((c) => <CheckItem key={c.name} check={c} />)}
          </div>
        )}
      </div>

      {/* ── Post History ── */}
      <div style={s.card}>
        <div style={{ ...s.sectionTitle, marginBottom: "16px" }}>Post History</div>

        {!loading && !error && history.length === 0 && (
          <div style={s.emptyNote}>No posts yet. Posts will appear here once you start sharing.</div>
        )}

        {history.map((entry) => {
          const ok = entry.status === "success";
          const src = SOURCE_LABEL[entry.source] ?? SOURCE_LABEL.manual;
          const firstId = entry.file_ids?.[0];
          const multiCount = (entry.file_ids?.length ?? 1) > 1 ? entry.file_ids.length : null;

          return (
            <div key={entry.id} style={s.row}>
              {firstId ? (
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <img
                    src={photoRawUrl(firstId)}
                    alt=""
                    style={s.thumb}
                    onError={(e) => {
                      e.target.style.display = "none";
                      e.target.nextSibling.style.display = "flex";
                    }}
                  />
                  <div style={{ ...s.thumbPlaceholder, display: "none", position: "absolute", top: 0, left: 0 }}>📷</div>
                  {multiCount && (
                    <div style={{
                      position: "absolute", bottom: 4, right: 4,
                      background: "rgba(0,0,0,0.6)", color: "#fff",
                      borderRadius: "4px", fontSize: "10px", fontWeight: 700,
                      padding: "1px 5px",
                    }}>
                      {multiCount}
                    </div>
                  )}
                </div>
              ) : (
                <div style={s.thumbPlaceholder}>📷</div>
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div>
                  <span style={s.statusBadge(ok)}>{ok ? "✓ Success" : "✗ Failed"}</span>
                  <span style={s.badge(src.bg, src.color)}>{src.text}</span>
                  {multiCount && (
                    <span style={s.badge("#f5f5f5", "#555")}>Carousel · {multiCount}</span>
                  )}
                </div>

                {entry.caption && <div style={s.caption}>{entry.caption}</div>}

                {!ok && entry.error && <div style={s.errorMsg}>{entry.error}</div>}

                <div style={s.meta}>
                  {new Date(entry.created_at).toLocaleString()}
                  {entry.media_id && (
                    <span style={{ marginLeft: "8px", color: "#bbb" }}>· id {entry.media_id}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
