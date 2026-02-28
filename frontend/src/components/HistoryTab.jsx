import { useEffect, useState } from "react";
import { getPostHistory } from "../api/client";
import { photoRawUrl } from "../api/client";

const SOURCE_LABEL = {
  manual: { text: "Manual", bg: "#e8f0fe", color: "#3c5fa8" },
  scheduled: { text: "Scheduled", bg: "#f0e6ff", color: "#7b3fa8" },
  approved: { text: "Approved", bg: "#fff3e0", color: "#a86a00" },
};

const s = {
  card: {
    background: "#fff",
    borderRadius: "12px",
    padding: "20px",
    boxShadow: "0 2px 12px #0001",
    marginBottom: "20px",
  },
  sectionTitle: { fontSize: "16px", fontWeight: 700, marginBottom: "16px", color: "#111" },
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
  error: {
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

export default function HistoryTab() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function fetchHistory() {
    setLoading(true);
    setError("");
    try {
      const data = await getPostHistory();
      setHistory(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchHistory();
  }, []);

  return (
    <div>
      <div style={s.card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div style={s.sectionTitle} style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#111" }}>
            Post History
          </div>
          <button style={s.refreshBtn} onClick={fetchHistory} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        {error && (
          <div style={{ background: "#fff0f0", border: "1px solid #fcc", borderRadius: "8px", padding: "10px 14px", color: "#c00", fontSize: "13px" }}>
            {error}
          </div>
        )}

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

                {entry.caption && (
                  <div style={s.caption}>{entry.caption}</div>
                )}

                {!ok && entry.error && (
                  <div style={s.error}>{entry.error}</div>
                )}

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
