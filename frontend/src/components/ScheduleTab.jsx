import { useEffect, useRef, useState } from "react";
import {
  approvePost,
  getScheduleConfig,
  getPendingPosts,
  getServerTimezone,
  rejectPost,
  saveScheduleConfig,
} from "../api/client";
import { photoRawUrl } from "../api/client";

const TONES = ["engaging", "professional", "funny", "inspirational", "minimal"];
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const s = {
  card: {
    background: "#fff",
    borderRadius: "12px",
    padding: "20px",
    boxShadow: "0 2px 12px #0001",
    marginBottom: "20px",
  },
  sectionTitle: { fontSize: "16px", fontWeight: 700, marginBottom: "16px", color: "#111" },
  row: { display: "flex", gap: "12px", alignItems: "center", marginBottom: "14px", flexWrap: "wrap" },
  label: { fontSize: "13px", fontWeight: 600, color: "#444", minWidth: "110px" },
  input: {
    padding: "8px 12px",
    border: "1px solid #ddd",
    borderRadius: "8px",
    fontSize: "14px",
    outline: "none",
    width: "80px",
  },
  select: {
    padding: "8px 12px",
    border: "1px solid #ddd",
    borderRadius: "8px",
    fontSize: "14px",
    outline: "none",
    background: "#fff",
  },
  toggle: (on) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    cursor: "pointer",
    padding: "6px 16px",
    borderRadius: "20px",
    border: "none",
    background: on ? "#405de6" : "#eee",
    color: on ? "#fff" : "#555",
    fontWeight: 600,
    fontSize: "13px",
    transition: "background 0.15s",
  }),
  toneBtn: (active) => ({
    padding: "5px 14px",
    borderRadius: "20px",
    border: active ? "none" : "1px solid #ddd",
    background: active ? "#e1306c" : "#fff",
    color: active ? "#fff" : "#333",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: active ? 600 : 400,
  }),
  dayBtn: (active) => ({
    padding: "4px 10px",
    borderRadius: "6px",
    border: "1px solid #ddd",
    background: active ? "#833ab4" : "#fff",
    color: active ? "#fff" : "#555",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: active ? 600 : 400,
  }),
  saveBtn: (loading) => ({
    padding: "10px 28px",
    background: loading ? "#ccc" : "#111",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    cursor: loading ? "not-allowed" : "pointer",
    fontWeight: 700,
    fontSize: "14px",
  }),
  savedBadge: {
    display: "inline-block",
    background: "#e6f9ee",
    color: "#1a7a40",
    borderRadius: "6px",
    padding: "4px 12px",
    fontSize: "13px",
    fontWeight: 600,
    marginLeft: "12px",
  },
  error: {
    background: "#fff0f0",
    border: "1px solid #fcc",
    borderRadius: "8px",
    padding: "10px 14px",
    color: "#c00",
    fontSize: "13px",
    marginTop: "10px",
  },
  pendingItem: {
    display: "flex",
    gap: "14px",
    alignItems: "flex-start",
    padding: "14px 0",
    borderBottom: "1px solid #f0f0f0",
  },
  thumb: {
    width: "80px",
    height: "80px",
    objectFit: "cover",
    borderRadius: "8px",
    flexShrink: 0,
    background: "#f5f5f5",
  },
  captionPreview: {
    fontSize: "13px",
    color: "#333",
    lineHeight: "1.5",
    flex: 1,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  btnRow: { display: "flex", gap: "8px", marginTop: "8px" },
  approveBtn: {
    padding: "6px 16px",
    background: "#1a7a40",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: 600,
  },
  rejectBtn: {
    padding: "6px 16px",
    background: "#fff",
    color: "#c00",
    border: "1px solid #fcc",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: 600,
  },
  emptyNote: { color: "#999", fontSize: "14px", padding: "12px 0" },
  folderInput: {
    padding: "8px 12px",
    border: "1px solid #ddd",
    borderRadius: "8px",
    fontSize: "14px",
    outline: "none",
    flex: 1,
    minWidth: "220px",
  },
};

export default function ScheduleTab({ savedFolder }) {
  const [config, setConfig] = useState(null);
  const [tzInfo, setTzInfo] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [pending, setPending] = useState([]);
  const [actioning, setActioning] = useState({});
  const pollRef = useRef(null);

  // Load config and timezone on mount
  useEffect(() => {
    getScheduleConfig()
      .then((cfg) => {
        if (!cfg.folder_id && savedFolder?.id) cfg.folder_id = savedFolder.id;
        setConfig(cfg);
      })
      .catch(() => {});
    getServerTimezone().then(setTzInfo).catch(() => {});
  }, []);

  // Poll pending posts every 30s when require_approval is on
  useEffect(() => {
    if (!config?.require_approval) {
      setPending([]);
      return;
    }

    function poll() {
      getPendingPosts()
        .then(setPending)
        .catch(() => {});
    }

    poll();
    pollRef.current = setInterval(poll, 30_000);
    return () => clearInterval(pollRef.current);
  }, [config?.require_approval]);

  function update(key, value) {
    setConfig((c) => ({ ...c, [key]: value }));
    setSaved(false);
  }

  function toggleWeekday(day) {
    const current = config.weekdays ?? [];
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort((a, b) => a - b);
    update("weekdays", next);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError("");
    try {
      await saveScheduleConfig(config);
      setSaved(true);
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove(id) {
    setActioning((a) => ({ ...a, [id]: "approving" }));
    try {
      await approvePost(id);
      setPending((p) => p.filter((post) => post.id !== id));
    } catch (e) {
      alert("Failed to approve: " + e.message);
    } finally {
      setActioning((a) => ({ ...a, [id]: null }));
    }
  }

  async function handleReject(id) {
    setActioning((a) => ({ ...a, [id]: "rejecting" }));
    try {
      await rejectPost(id);
      setPending((p) => p.filter((post) => post.id !== id));
    } catch (e) {
      alert("Failed to reject: " + e.message);
    } finally {
      setActioning((a) => ({ ...a, [id]: null }));
    }
  }

  if (!config) {
    return <div style={{ padding: "40px", color: "#999" }}>Loading schedule settings…</div>;
  }

  return (
    <div>
      {/* ── Schedule Settings ── */}
      <div style={s.card}>
        <div style={s.sectionTitle}>Schedule Settings</div>

        {/* Enable toggle */}
        <div style={s.row}>
          <span style={s.label}>Auto-schedule</span>
          <button style={s.toggle(config.enabled)} onClick={() => update("enabled", !config.enabled)}>
            {config.enabled ? "Enabled" : "Disabled"}
          </button>
        </div>

        {/* Time — 12h AM/PM */}
        <div style={s.row}>
          <span style={s.label}>Post time</span>
          {(() => {
            const h24 = config.hour ?? 8;
            const period = h24 < 12 ? "AM" : "PM";
            const hour12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
            function setTime(newH12, newPeriod) {
              const h = newPeriod === "AM"
                ? (newH12 === 12 ? 0 : newH12)
                : (newH12 === 12 ? 12 : newH12 + 12);
              update("hour", h);
            }
            return (
              <>
                <input
                  type="number" min={1} max={12}
                  style={s.input}
                  value={hour12}
                  onChange={(e) => setTime(Math.min(12, Math.max(1, Number(e.target.value))), period)}
                />
                <span style={{ color: "#888" }}>:</span>
                <input
                  type="number" min={0} max={59}
                  style={s.input}
                  value={String(config.minute).padStart(2, "0")}
                  onChange={(e) => update("minute", Math.min(59, Math.max(0, Number(e.target.value))))}
                />
                <button style={s.toggle(period === "AM")} onClick={() => setTime(hour12, "AM")}>AM</button>
                <button style={s.toggle(period === "PM")} onClick={() => setTime(hour12, "PM")}>PM</button>
              </>
            );
          })()}
          {tzInfo && (
            <span style={{
              fontSize: "12px", color: "#888", background: "#f5f5f5",
              border: "1px solid #e0e0e0", borderRadius: "6px",
              padding: "4px 10px", whiteSpace: "nowrap",
            }}>
              🌐 {tzInfo.timezone} (UTC{tzInfo.utc_offset})
            </span>
          )}
        </div>

        {/* Cadence */}
        <div style={s.row}>
          <span style={s.label}>Cadence</span>
          <select style={s.select} value={config.cadence} onChange={(e) => update("cadence", e.target.value)}>
            <option value="daily">Daily</option>
            <option value="every_n_days">Every N days</option>
            <option value="weekdays">Specific weekdays</option>
          </select>

          {config.cadence === "every_n_days" && (
            <>
              <span style={{ color: "#888", fontSize: "13px" }}>every</span>
              <input
                type="number"
                min={1}
                max={30}
                style={s.input}
                value={config.every_n_days}
                onChange={(e) => update("every_n_days", Number(e.target.value))}
              />
              <span style={{ color: "#888", fontSize: "13px" }}>days</span>
            </>
          )}
        </div>

        {/* Weekday picker */}
        {config.cadence === "weekdays" && (
          <div style={s.row}>
            <span style={s.label}>Days</span>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {WEEKDAY_LABELS.map((label, i) => (
                <button key={i} style={s.dayBtn(config.weekdays?.includes(i))} onClick={() => toggleWeekday(i)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Folder ID */}
        <div style={s.row}>
          <span style={s.label}>Drive folder</span>
          {savedFolder?.name && config.folder_id === savedFolder.id ? (
            <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "#f0f0ff", border: "1px solid #c7c7ff", borderRadius: "8px", padding: "8px 14px" }}>
              <span>📁</span>
              <span style={{ fontWeight: 600, fontSize: "14px", color: "#333" }}>{savedFolder.name}</span>
            </div>
          ) : (
            <input
              style={s.folderInput}
              placeholder="Paste Google Drive folder ID…"
              value={config.folder_id}
              onChange={(e) => update("folder_id", e.target.value)}
            />
          )}
        </div>

        {/* Tone */}
        <div style={s.row}>
          <span style={s.label}>Caption tone</span>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {TONES.map((t) => (
              <button key={t} style={s.toneBtn(t === config.tone)} onClick={() => update("tone", t)}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Default caption */}
        <div style={{ marginBottom: "14px" }}>
          <span style={{ ...s.label, display: "block", marginBottom: "6px" }}>
            Default caption
            <span style={{ fontWeight: 400, color: "#999", fontSize: "12px", marginLeft: "8px" }}>
              used when AI generation fails
            </span>
          </span>
          <textarea
            style={{
              width: "100%", minHeight: "72px", border: "1px solid #ddd", borderRadius: "8px",
              padding: "10px 12px", fontSize: "13px", lineHeight: "1.5", resize: "vertical",
              fontFamily: "inherit", outline: "none", color: "#444", boxSizing: "border-box",
            }}
            value={config.default_caption ?? ""}
            onChange={(e) => update("default_caption", e.target.value)}
          />
        </div>

        {/* Approval mode */}
        <div style={s.row}>
          <span style={s.label}>Approval mode</span>
          <button
            style={s.toggle(!config.require_approval)}
            onClick={() => update("require_approval", false)}
          >
            Auto-post
          </button>
          <button
            style={s.toggle(config.require_approval)}
            onClick={() => update("require_approval", true)}
          >
            Queue for approval
          </button>
        </div>

        {/* Save */}
        <div style={{ display: "flex", alignItems: "center", marginTop: "8px" }}>
          <button style={s.saveBtn(saving)} onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Schedule"}
          </button>
          {saved && <span style={s.savedBadge}>Saved!</span>}
        </div>
        {saveError && <div style={s.error}>{saveError}</div>}
      </div>

      {/* ── Pending Approvals ── */}
      {config.require_approval && (
        <div style={s.card}>
          <div style={s.sectionTitle}>
            Pending Approvals{" "}
            <span style={{ fontWeight: 400, color: "#888", fontSize: "13px" }}>
              ({pending.length} post{pending.length !== 1 ? "s" : ""} · refreshes every 30s)
            </span>
          </div>

          {pending.length === 0 ? (
            <div style={s.emptyNote}>No posts waiting for approval.</div>
          ) : (
            pending.map((post) => {
              const busy = actioning[post.id];
              return (
                <div key={post.id} style={s.pendingItem}>
                  <img
                    src={photoRawUrl(post.file_id)}
                    alt={post.file_name}
                    style={s.thumb}
                    onError={(e) => { e.target.style.display = "none"; }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "12px", color: "#aaa", marginBottom: "4px" }}>
                      {post.file_name} · {new Date(post.created_at).toLocaleString()}
                    </div>
                    <div style={s.captionPreview}>{post.caption}</div>
                    <div style={s.btnRow}>
                      <button
                        style={s.approveBtn}
                        onClick={() => handleApprove(post.id)}
                        disabled={!!busy}
                      >
                        {busy === "approving" ? "Posting…" : "Approve & Post"}
                      </button>
                      <button
                        style={s.rejectBtn}
                        onClick={() => handleReject(post.id)}
                        disabled={!!busy}
                      >
                        {busy === "rejecting" ? "Removing…" : "Reject"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
