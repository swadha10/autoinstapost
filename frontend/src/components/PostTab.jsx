import { useEffect, useRef, useState } from "react";
import {
  approvePost,
  getPostHistory,
  getScheduleConfig,
  getScheduleStatus,
  getPendingPosts,
  getServerTimezone,
  photoRawUrl,
  rejectPost,
  runScheduleNow,
  saveScheduleConfig,
  startGooglePicker,
} from "../api/client";
import FolderPicker from "./FolderPicker";
import { useAuth } from "../context/AuthContext";
import { useIsMobile } from "../hooks/useIsMobile";

const TONES = ["engaging", "professional", "funny", "inspirational", "minimal"];
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const TIMEZONES = [
  { label: "Pacific Time (PST/PDT)",    value: "America/Los_Angeles" },
  { label: "Mountain Time (MST/MDT)",   value: "America/Denver" },
  { label: "Central Time (CST/CDT)",    value: "America/Chicago" },
  { label: "Eastern Time (EST/EDT)",    value: "America/New_York" },
  { label: "London (GMT/BST)",          value: "Europe/London" },
  { label: "Central Europe (CET/CEST)", value: "Europe/Berlin" },
  { label: "India (IST)",               value: "Asia/Kolkata" },
  { label: "China (CST)",               value: "Asia/Shanghai" },
  { label: "Japan (JST)",               value: "Asia/Tokyo" },
  { label: "Australia/Sydney (AEST)",   value: "Australia/Sydney" },
  { label: "UTC",                       value: "UTC" },
];

const SOURCE_LABEL = {
  manual:    { text: "Manual",    bg: "#e8f0fe", color: "#3c5fa8" },
  scheduled: { text: "Scheduled", bg: "#f0e6ff", color: "#7b3fa8" },
  approved:  { text: "Approved",  bg: "#fff3e0", color: "#a86a00" },
};

const STATUS_BADGE = {
  success: { text: "✓ Success",          bg: "#e6f9ee", color: "#1a7a40" },
  failed:  { text: "✗ Failed",           bg: "#fff0f0", color: "#c00" },
  queued:  { text: "⏳ Pending approval", bg: "#fff8e6", color: "#92600a" },
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
  historyRow: {
    display: "flex",
    gap: "14px",
    alignItems: "flex-start",
    padding: "14px 0",
    borderBottom: "1px solid #f0f0f0",
  },
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

export default function PostTab() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const cp = isMobile ? "14px" : "20px"; // card padding

  // ── Schedule config state ──────────────────────────────────────────────────
  const [config, setConfig] = useState(null);
  const [configError, setConfigError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pending, setPending] = useState([]);
  const [actioning, setActioning] = useState({});
  const pollRef = useRef(null);

  // ── History / status state ─────────────────────────────────────────────────
  const [history, setHistory] = useState([]);
  const [status, setStatus] = useState(null);
  const [histLoading, setHistLoading] = useState(true);
  const [histError, setHistError] = useState("");
  const [runningNow, setRunningNow] = useState(false);
  const [runMsg, setRunMsg] = useState("");

  // ── Load config on mount ───────────────────────────────────────────────────
  useEffect(() => {
    getScheduleConfig().then(setConfig).catch((e) => setConfigError(e.message));
    getServerTimezone().catch(() => {});
  }, []);

  // ── Poll pending approvals ─────────────────────────────────────────────────
  useEffect(() => {
    if (!config?.require_approval) { setPending([]); return; }
    function poll() { getPendingPosts().then(setPending).catch(() => {}); }
    poll();
    pollRef.current = setInterval(poll, 30_000);
    return () => clearInterval(pollRef.current);
  }, [config?.require_approval]);

  // ── Load history + status ──────────────────────────────────────────────────
  async function fetchHistory() {
    setHistLoading(true);
    setHistError("");
    try {
      const [hist, stat] = await Promise.all([getPostHistory(), getScheduleStatus()]);
      setHistory(hist);
      setStatus(stat);
    } catch (e) {
      setHistError(e.message);
    } finally {
      setHistLoading(false);
    }
  }

  useEffect(() => { fetchHistory(); }, []);

  // ── Config helpers ─────────────────────────────────────────────────────────
  function update(key, value) {
    setConfig((c) => ({ ...c, [key]: value }));
    setSaved(false);
  }

  function toggleWeekday(day) {
    const current = config.weekdays ?? [];
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day].sort((a, b) => a - b);
    update("weekdays", next);
  }

  async function handlePickFromGoogle() {
    setPickerLoading(true);
    try {
      const data = await startGooglePicker();
      window.open(data.pickerUri, "_blank");
      setPickerOpen(true);
    } catch (e) {
      alert("Failed to open picker: " + e.message);
    } finally {
      setPickerLoading(false);
    }
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

  async function handleRunNow() {
    setRunningNow(true);
    setRunMsg("");
    try {
      const res = await runScheduleNow();
      setRunMsg(res.message || "Job triggered — check history in ~30s");
      setTimeout(() => fetchHistory(), 32000);
    } catch (e) {
      setRunMsg(`Error: ${e.message}`);
    } finally {
      setRunningNow(false);
    }
  }

  const nextRun = status?.next_run ? formatNextRun(status.next_run) : null;

  if (!config) {
    return configError
      ? <div style={{ padding: "24px 16px", color: "#c00", background: "#fff0f0", borderRadius: "10px", margin: "16px", fontSize: "14px" }}>Failed to load: {configError}</div>
      : <div style={{ padding: "40px", color: "#999" }}>Loading schedule settings…</div>;
  }

  return (
    <div>
      {/* ── Schedule Settings ──────────────────────────────────────────────── */}
      <div style={{ ...s.card, padding: cp }}>
        <div style={s.sectionTitle}>Schedule Settings</div>

        <div style={s.row}>
          <span style={{ ...s.label, minWidth: isMobile ? "80px" : "110px" }}>Auto-schedule</span>
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
              <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
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
              </div>
            );
          })()}
        </div>

        <div style={s.row}>
          <span style={s.label}>Timezone</span>
          <select
            style={{ ...s.select, fontSize: "13px", flex: 1, minWidth: "160px", maxWidth: "320px" }}
            value={config.timezone || "America/Los_Angeles"}
            onChange={(e) => update("timezone", e.target.value)}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
        </div>

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
                type="number" min={1} max={30}
                style={s.input}
                value={config.every_n_days}
                onChange={(e) => update("every_n_days", Number(e.target.value))}
              />
              <span style={{ color: "#888", fontSize: "13px" }}>days</span>
            </>
          )}
        </div>

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

        <div style={s.row}>
          <span style={s.label}>Photo source</span>
          <button style={s.toggle(config.source !== "gphotos_picker")} onClick={() => update("source", "drive")}>
            Google Drive
          </button>
          <button style={s.toggle(config.source === "gphotos_picker")} onClick={() => update("source", "gphotos_picker")}>
            Google Photos
          </button>
        </div>

        {config.source === "gphotos_picker" ? (
          <div style={{ marginBottom: "14px" }}>
            <span style={{ ...s.label, display: "block", marginBottom: "8px" }}>Google Photos selection</span>
            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <button
                style={{
                  padding: "8px 18px", borderRadius: "8px", border: "none",
                  background: "#4285f4", color: "#fff", fontWeight: 600, fontSize: "13px",
                  cursor: pickerLoading ? "not-allowed" : "pointer",
                  opacity: pickerLoading ? 0.7 : 1,
                }}
                onClick={handlePickFromGoogle}
                disabled={pickerLoading}
              >
                {pickerLoading ? "Opening…" : pickerOpen ? "Re-open Picker" : "Open Google Photos Picker"}
              </button>
              {pickerOpen && (
                <span style={{ fontSize: "12px", color: "#1a7a40", fontWeight: 600 }}>✓ Picker session active</span>
              )}
            </div>
            <div style={{ fontSize: "12px", color: "#888", marginTop: "6px" }}>
              Select photos in the picker — the scheduler will post from that selection each run.
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: "14px" }}>
            <span style={{ ...s.label, display: "block", marginBottom: "8px" }}>Drive folder</span>
            <FolderPicker
              selectedId={config.folder_id}
              onSelect={(id) => update("folder_id", id)}
              userId={user?.id}
            />
          </div>
        )}

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

        <div style={s.row}>
          <span style={s.label}>Approval mode</span>
          <button style={s.toggle(!config.require_approval)} onClick={() => update("require_approval", false)}>
            Auto-post
          </button>
          <button style={s.toggle(config.require_approval)} onClick={() => update("require_approval", true)}>
            Queue for approval
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", marginTop: "8px" }}>
          <button style={s.saveBtn(saving)} onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Schedule"}
          </button>
          {saved && <span style={s.savedBadge}>Saved!</span>}
        </div>
        {saveError && <div style={s.error}>{saveError}</div>}
      </div>

      {/* ── Pending Approvals ─────────────────────────────────────────────── */}
      {config.require_approval && (
        <div style={{ ...s.card, padding: cp }}>
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
                    style={{ ...s.thumb, width: "80px", height: "80px" }}
                    onError={(e) => { e.target.style.display = "none"; }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "12px", color: "#aaa", marginBottom: "4px" }}>
                      {post.file_name} · {new Date(post.created_at).toLocaleString()}
                    </div>
                    <div style={s.captionPreview}>{post.caption}</div>
                    <div style={s.btnRow}>
                      <button style={s.approveBtn} onClick={() => handleApprove(post.id)} disabled={!!busy}>
                        {busy === "approving" ? "Posting…" : "Approve & Post"}
                      </button>
                      <button style={s.rejectBtn} onClick={() => handleReject(post.id)} disabled={!!busy}>
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

      {/* ── Schedule Status ───────────────────────────────────────────────── */}
      <div style={{ ...s.card, padding: cp }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "8px" }}>
          <div style={{ ...s.sectionTitle, marginBottom: 0 }}>Schedule Status</div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              style={{ ...s.refreshBtn, background: runningNow ? "#f5f5f5" : "#1a1a2e", color: runningNow ? "#aaa" : "#fff", borderColor: "#1a1a2e" }}
              onClick={handleRunNow}
              disabled={runningNow || histLoading}
            >
              {runningNow ? "Running…" : "▶ Run Now"}
            </button>
            <button style={s.refreshBtn} onClick={fetchHistory} disabled={histLoading}>
              {histLoading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>

        {histError && (
          <div style={{ background: "#fff0f0", border: "1px solid #fcc", borderRadius: "8px", padding: "10px 14px", color: "#c00", fontSize: "13px", marginBottom: "12px" }}>
            {histError}
          </div>
        )}

        {runMsg && (
          <div style={{
            background: runMsg.startsWith("Error") ? "#fff0f0" : "#f0f7ff",
            border: `1px solid ${runMsg.startsWith("Error") ? "#fcc" : "#b8d4f8"}`,
            borderRadius: "8px", padding: "10px 14px",
            color: runMsg.startsWith("Error") ? "#c00" : "#1a4a80",
            fontSize: "13px", marginBottom: "12px",
          }}>
            {runMsg}
          </div>
        )}

        {status && (
          <div style={{
            background: nextRun ? (status.all_ok ? "#f0f7ff" : "#fffbf0") : "#f5f5f5",
            border: `1px solid ${nextRun ? (status.all_ok ? "#b8d4f8" : "#f5d88a") : "#e0e0e0"}`,
            borderRadius: "10px", padding: "14px 16px", marginBottom: "16px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "24px" }}>{nextRun ? (status.all_ok ? "🕐" : "⚠️") : "💤"}</span>
              <div>
                {nextRun ? (
                  <>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "#111" }}>Next post {nextRun.label}</div>
                    {nextRun.sub && <div style={{ fontSize: "12px", color: "#888", marginTop: "2px" }}>{nextRun.sub}</div>}
                    {!status.all_ok && (
                      <div style={{ fontSize: "12px", color: "#a86000", marginTop: "4px" }}>
                        Fix the issues below before the next run
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "#888" }}>
                    No scheduled post — enable auto-schedule above
                  </div>
                )}
              </div>
            </div>

            {nextRun && status.upcoming_pool?.length > 0 && (
              <div style={{ marginTop: "12px" }}>
                <div style={{ fontSize: "11px", fontWeight: 600, color: "#888", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Will randomly pick 3 from {status.upcoming_pool.length} available
                </div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {status.upcoming_pool.map((photo) => (
                    <img
                      key={photo.id}
                      src={photoRawUrl(photo.id)}
                      alt={photo.name}
                      title={photo.name}
                      style={{ width: "52px", height: "52px", objectFit: "cover", borderRadius: "6px", background: "#e0e0e0" }}
                      onError={(e) => { e.target.style.display = "none"; }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {status?.checks && (
          <div>{status.checks.map((c) => <CheckItem key={c.name} check={c} />)}</div>
        )}
      </div>

      {/* ── Post History ──────────────────────────────────────────────────── */}
      <div style={{ ...s.card, padding: cp }}>
        <div style={{ ...s.sectionTitle, marginBottom: "16px" }}>Post History</div>

        {!histLoading && !histError && history.length === 0 && (
          <div style={s.emptyNote}>No posts yet. Posts will appear here once you start sharing.</div>
        )}

        {history.map((entry) => {
          const src = SOURCE_LABEL[entry.source] ?? SOURCE_LABEL.manual;
          const firstId = entry.file_ids?.[0];
          const multiCount = (entry.file_ids?.length ?? 1) > 1 ? entry.file_ids.length : null;
          const statusStyle = STATUS_BADGE[entry.status] ?? STATUS_BADGE.failed;

          return (
            <div key={entry.id} style={s.historyRow}>
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
                      borderRadius: "4px", fontSize: "10px", fontWeight: 700, padding: "1px 5px",
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
                  <span style={s.badge(statusStyle.bg, statusStyle.color)}>{statusStyle.text}</span>
                  <span style={s.badge(src.bg, src.color)}>{src.text}</span>
                  {multiCount && <span style={s.badge("#f5f5f5", "#555")}>Carousel · {multiCount}</span>}
                </div>
                {entry.caption && <div style={s.caption}>{entry.caption}</div>}
                {entry.status === "failed" && entry.error && (
                  <div style={s.errorMsg}>{entry.error}</div>
                )}
                {entry.status === "queued" && (
                  <div style={{ fontSize: "12px", color: "#92600a", marginTop: "6px" }}>
                    Waiting in Pending Approvals above
                  </div>
                )}
                <div style={s.meta}>
                  {new Date(entry.created_at).toLocaleString()}
                  {entry.status === "success" && entry.media_id && (
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
