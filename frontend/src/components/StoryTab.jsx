import { useEffect, useState } from "react";
import {
  fetchPhotos,
  getStoryConfig,
  getStoryHistory,
  getStoryStatus,
  postStory,
  runStoryNow,
  saveStoryConfig,
} from "../api/client";
import { photoRawUrl } from "../api/client";
import FolderPicker from "./FolderPicker";
import { useAuth } from "../context/AuthContext";
import { useIsMobile } from "../hooks/useIsMobile";

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
  input: { padding: "8px 12px", border: "1px solid #ddd", borderRadius: "8px", fontSize: "14px", outline: "none", width: "80px" },
  select: { padding: "8px 12px", border: "1px solid #ddd", borderRadius: "8px", fontSize: "14px", outline: "none", background: "#fff" },
  toggle: (on) => ({
    display: "inline-flex", alignItems: "center", gap: "8px",
    cursor: "pointer", padding: "6px 16px", borderRadius: "20px", border: "none",
    background: on ? "#833ab4" : "#eee", color: on ? "#fff" : "#555",
    fontWeight: 600, fontSize: "13px", transition: "background 0.15s",
  }),
  dayBtn: (active) => ({
    padding: "4px 10px", borderRadius: "6px", border: "1px solid #ddd",
    background: active ? "#833ab4" : "#fff", color: active ? "#fff" : "#555",
    cursor: "pointer", fontSize: "12px", fontWeight: active ? 600 : 400,
  }),
  saveBtn: (loading) => ({
    padding: "10px 28px", background: loading ? "#ccc" : "#111",
    color: "#fff", border: "none", borderRadius: "8px",
    cursor: loading ? "not-allowed" : "pointer", fontWeight: 700, fontSize: "14px",
  }),
  savedBadge: {
    display: "inline-block", background: "#e6f9ee", color: "#1a7a40",
    borderRadius: "6px", padding: "4px 12px", fontSize: "13px", fontWeight: 600, marginLeft: "12px",
  },
  error: {
    background: "#fff0f0", border: "1px solid #fcc", borderRadius: "8px",
    padding: "10px 14px", color: "#c00", fontSize: "13px", marginTop: "10px",
  },
  photoGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: "8px", marginTop: "10px" },
  photoThumb: (selected) => ({
    width: "100%", aspectRatio: "9/16", objectFit: "cover", borderRadius: "8px",
    cursor: "pointer", border: selected ? "3px solid #833ab4" : "3px solid transparent",
    transition: "border 0.15s",
  }),
  postBtn: (disabled) => ({
    marginTop: "14px", width: "100%", padding: "11px",
    background: disabled ? "#ccc" : "linear-gradient(135deg,#833ab4,#c13584)",
    color: "#fff", border: "none", borderRadius: "8px",
    cursor: disabled ? "not-allowed" : "pointer", fontWeight: 700, fontSize: "14px",
  }),
};

function CheckItem({ check }) {
  return (
    <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid #f5f5f5" }}>
      <span style={{ fontSize: "14px", marginTop: "1px", flexShrink: 0 }}>{check.ok ? "✅" : "❌"}</span>
      <div>
        <span style={{ fontSize: "13px", fontWeight: 600, color: "#333" }}>{check.name}</span>
        <span style={{ fontSize: "13px", color: check.ok ? "#555" : "#c00", marginLeft: "8px" }}>{check.message}</span>
      </div>
    </div>
  );
}

function formatNextRun(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const now = new Date();
  const diffMin = (d - now) / 60000;
  const timeStr = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (diffMin < 1) return `in less than a minute`;
  if (diffMin < 60) return `in ${Math.round(diffMin)} min`;
  const today = now.toDateString() === d.toDateString();
  return `${today ? "today" : d.toLocaleDateString([], { weekday: "long" })} at ${timeStr}`;
}

const STATUS_BADGE = {
  success: { text: "✓ Posted", bg: "#e6f9ee", color: "#1a7a40" },
  failed:  { text: "✗ Failed",  bg: "#fff0f0", color: "#c00" },
};

export default function StoryTab() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const cp = isMobile ? "14px" : "20px";
  const [config, setConfig] = useState(null);
  const [configError, setConfigError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Manual post state
  const [storyFolderId, setStoryFolderId] = useState("");
  const [photos, setPhotos] = useState([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [selectedPhotoId, setSelectedPhotoId] = useState("");
  const [posting, setPosting] = useState(false);
  const [postMsg, setPostMsg] = useState("");
  const [postError, setPostError] = useState("");

  // Status + history
  const [status, setStatus] = useState(null);
  const [history, setHistory] = useState([]);
  const [runningNow, setRunningNow] = useState(false);
  const [runMsg, setRunMsg] = useState("");
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);

  useEffect(() => {
    getStoryConfig().then((cfg) => {
      setConfig(cfg);
      if (cfg.folder_id) {
        setStoryFolderId(cfg.folder_id);
        loadPhotos(cfg.folder_id);
      }
    }).catch((e) => setConfigError(e.message));
    refreshStatus();
  }, []);

  async function refreshStatus() {
    setLoadingStatus(true);
    try {
      const [stat, hist] = await Promise.all([getStoryStatus(), getStoryHistory()]);
      setStatus(stat);
      setHistory(hist);
    } catch (e) {} finally {
      setLoadingStatus(false);
    }
  }

  async function loadPhotos(folderId) {
    if (!folderId) return;
    setLoadingPhotos(true);
    setPhotos([]);
    setSelectedPhotoId("");
    try {
      const data = await fetchPhotos(folderId);
      setPhotos(data.photos.filter(p => p.mimeType?.startsWith("image/")));
    } catch (e) {} finally {
      setLoadingPhotos(false);
    }
  }

  function update(key, value) {
    setConfig(c => ({ ...c, [key]: value }));
    setSaved(false);
  }

  function toggleWeekday(day) {
    const current = config.weekdays ?? [];
    const next = current.includes(day) ? current.filter(d => d !== day) : [...current, day].sort((a, b) => a - b);
    update("weekdays", next);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError("");
    try {
      await saveStoryConfig(config);
      setSaved(true);
      // If folder changed, sync manual picker
      if (config.folder_id && config.folder_id !== storyFolderId) {
        setStoryFolderId(config.folder_id);
        loadPhotos(config.folder_id);
      }
      refreshStatus();
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handlePostStory() {
    if (!selectedPhotoId) return;
    setPosting(true);
    setPostMsg("");
    setPostError("");
    try {
      await postStory(selectedPhotoId);
      setPostMsg("Story posted!");
      setSelectedPhotoId("");
      setTimeout(refreshStatus, 3000);
    } catch (e) {
      setPostError(e.message);
    } finally {
      setPosting(false);
    }
  }

  async function handleRunNow() {
    setRunningNow(true);
    setRunMsg("");
    try {
      const res = await runStoryNow();
      setRunMsg(res.message || "Story job triggered — check history in ~30s");
      setTimeout(refreshStatus, 32000);
    } catch (e) {
      setRunMsg(`Error: ${e.message}`);
    } finally {
      setRunningNow(false);
    }
  }

  if (!config) return configError
    ? <div style={{ padding: "24px 16px", color: "#c00", background: "#fff0f0", borderRadius: "10px", margin: "16px", fontSize: "14px" }}>Failed to load: {configError}</div>
    : <div style={{ padding: "40px", color: "#999" }}>Loading story settings…</div>;

  const nextRun = status?.next_run ? formatNextRun(status.next_run) : null;

  return (
    <div>
      {/* ── Status ── */}
      <div style={{ ...s.card, padding: cp }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "8px" }}>
          <div style={{ ...s.sectionTitle, marginBottom: 0 }}>Story Status</div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              style={{ padding: "6px 14px", background: runningNow ? "#f5f5f5" : "#1a1a2e", color: runningNow ? "#aaa" : "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}
              onClick={handleRunNow}
              disabled={runningNow || loadingStatus}
            >
              {runningNow ? "Running…" : "▶ Run Now"}
            </button>
            <button
              style={{ padding: "6px 14px", background: "#f5f5f5", border: "1px solid #ddd", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: 600, color: "#444" }}
              onClick={refreshStatus}
              disabled={loadingStatus}
            >
              {loadingStatus ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>

        {runMsg && (
          <div style={{ background: runMsg.startsWith("Error") ? "#fff0f0" : "#f0f7ff", border: `1px solid ${runMsg.startsWith("Error") ? "#fcc" : "#b8d4f8"}`, borderRadius: "8px", padding: "10px 14px", color: runMsg.startsWith("Error") ? "#c00" : "#1a4a80", fontSize: "13px", marginBottom: "12px" }}>
            {runMsg}
          </div>
        )}

        {status && (
          <div style={{ background: "#f9f9f9", borderRadius: "10px", padding: "12px 14px", marginBottom: "14px", fontSize: "14px", fontWeight: 600, color: "#333" }}>
            {nextRun ? `📅 Next story ${nextRun}` : "💤 No story schedule active"}
          </div>
        )}

        {status?.checks?.map(c => <CheckItem key={c.name} check={c} />)}
      </div>

      {/* ── Manual Post ── */}
      <div style={{ ...s.card, padding: cp }}>
        <div style={s.sectionTitle}>Post a Story Now</div>
        <div style={{ marginBottom: "10px" }}>
          <span style={{ ...s.label, display: "block", marginBottom: "8px" }}>Story folder</span>
          <FolderPicker
            selectedId={storyFolderId}
            onSelect={(id) => { setStoryFolderId(id); loadPhotos(id); setSelectedPhotoId(""); }}
            userId={user?.id}
          />
        </div>

        {loadingPhotos && <div style={{ fontSize: "13px", color: "#999", marginTop: "8px" }}>Loading photos…</div>}

        {photos.length > 0 && (
          <>
            <div style={{ fontSize: "13px", color: "#666", marginBottom: "4px" }}>
              Select one photo — it will be cropped to 9:16 portrait for Stories
            </div>
            <div style={s.photoGrid}>
              {photos.map(p => (
                <img
                  key={p.id}
                  src={photoRawUrl(p.id)}
                  alt={p.name}
                  title={p.name}
                  style={s.photoThumb(selectedPhotoId === p.id)}
                  onClick={() => setSelectedPhotoId(prev => prev === p.id ? "" : p.id)}
                  onError={e => { e.target.style.display = "none"; }}
                />
              ))}
            </div>
            <button style={s.postBtn(!selectedPhotoId || posting)} onClick={handlePostStory} disabled={!selectedPhotoId || posting}>
              {posting ? "Posting story…" : selectedPhotoId ? "Post as Story" : "Select a photo above"}
            </button>
            {postMsg && <div style={{ marginTop: "10px", color: "#1a7a40", fontWeight: 600, fontSize: "13px" }}>✅ {postMsg}</div>}
            {postError && <div style={s.error}>{postError}</div>}
          </>
        )}
      </div>

      {/* ── Story Schedule ── */}
      <div style={{ ...s.card, padding: cp }}>
        <div style={s.sectionTitle}>Story Schedule</div>

        <div style={s.row}>
          <span style={s.label}>Auto-schedule</span>
          <button style={s.toggle(config.enabled)} onClick={() => update("enabled", !config.enabled)}>
            {config.enabled ? "Enabled" : "Disabled"}
          </button>
        </div>

        {/* Time */}
        <div style={s.row}>
          <span style={s.label}>Post time</span>
          {(() => {
            const h24 = config.hour ?? 9;
            const period = h24 < 12 ? "AM" : "PM";
            const hour12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
            function setTime(newH12, newPeriod) {
              const h = newPeriod === "AM" ? (newH12 === 12 ? 0 : newH12) : (newH12 === 12 ? 12 : newH12 + 12);
              update("hour", h);
            }
            return (
              <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                <input type="number" min={1} max={12} style={s.input} value={hour12}
                  onChange={e => setTime(Math.min(12, Math.max(1, Number(e.target.value))), period)} />
                <span style={{ color: "#888" }}>:</span>
                <input type="number" min={0} max={59} style={s.input} value={String(config.minute).padStart(2, "0")}
                  onChange={e => update("minute", Math.min(59, Math.max(0, Number(e.target.value))))} />
                <button style={s.toggle(period === "AM")} onClick={() => setTime(hour12, "AM")}>AM</button>
                <button style={s.toggle(period === "PM")} onClick={() => setTime(hour12, "PM")}>PM</button>
              </div>
            );
          })()}
        </div>

        {/* Timezone */}
        <div style={s.row}>
          <span style={s.label}>Timezone</span>
          <select style={{ ...s.select, flex: 1, minWidth: "160px", maxWidth: "320px" }}
            value={config.timezone || "America/Los_Angeles"}
            onChange={e => update("timezone", e.target.value)}>
            {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
          </select>
        </div>

        {/* Cadence */}
        <div style={s.row}>
          <span style={s.label}>Cadence</span>
          <select style={s.select} value={config.cadence} onChange={e => update("cadence", e.target.value)}>
            <option value="daily">Daily</option>
            <option value="every_n_days">Every N days</option>
            <option value="weekdays">Specific weekdays</option>
          </select>
          {config.cadence === "every_n_days" && (
            <>
              <span style={{ color: "#888", fontSize: "13px" }}>every</span>
              <input type="number" min={1} max={30} style={s.input} value={config.every_n_days}
                onChange={e => update("every_n_days", Number(e.target.value))} />
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

        {/* Story folder for scheduler */}
        <div style={{ marginBottom: "14px" }}>
          <span style={{ ...s.label, display: "block", marginBottom: "8px" }}>
            Story folder
            <span style={{ fontWeight: 400, color: "#999", fontSize: "12px", marginLeft: "8px" }}>
              scheduler picks one photo randomly
            </span>
          </span>
          <FolderPicker
            selectedId={config.folder_id}
            onSelect={id => update("folder_id", id)}
            userId={user?.id}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", marginTop: "8px" }}>
          <button style={s.saveBtn(saving)} onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Story Schedule"}
          </button>
          {saved && <span style={s.savedBadge}>Saved!</span>}
        </div>
        {saveError && <div style={s.error}>{saveError}</div>}
      </div>

      {/* ── Story History ── */}
      <div style={{ ...s.card, padding: cp }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div style={{ ...s.sectionTitle, marginBottom: 0 }}>Story History</div>
          {history.length > 3 && (
            <button
              onClick={() => setShowAllHistory(v => !v)}
              style={{ fontSize: "13px", color: "#833ab4", background: "none", border: "none", cursor: "pointer", fontWeight: 600, padding: 0 }}
            >
              {showAllHistory ? "Show less" : `Show all ${history.length}`}
            </button>
          )}
        </div>
        {history.length === 0 ? (
          <div style={{ color: "#999", fontSize: "14px" }}>No stories posted yet.</div>
        ) : (
          (showAllHistory ? history : history.slice(0, 3)).map(entry => {
            const badge = STATUS_BADGE[entry.status] ?? STATUS_BADGE.failed;
            return (
              <div key={entry.id} style={{ display: "flex", gap: "12px", alignItems: "flex-start", padding: "12px 0", borderBottom: "1px solid #f0f0f0" }}>
                <img
                  src={photoRawUrl(entry.file_id)}
                  alt=""
                  style={{ width: "52px", height: "92px", objectFit: "cover", borderRadius: "6px", flexShrink: 0, background: "#f0f0f0" }}
                  onError={e => { e.target.style.display = "none"; }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "inline-block", background: badge.bg, color: badge.color, borderRadius: "5px", padding: "2px 9px", fontSize: "11px", fontWeight: 700, marginBottom: "4px" }}>
                    {badge.text}
                  </span>
                  <span style={{ display: "inline-block", background: entry.source === "manual" ? "#e8f0fe" : "#f0e6ff", color: entry.source === "manual" ? "#3c5fa8" : "#7b3fa8", borderRadius: "5px", padding: "2px 9px", fontSize: "11px", fontWeight: 700, marginLeft: "6px" }}>
                    {entry.source === "manual" ? "Manual" : "Scheduled"}
                  </span>
                  <div style={{ fontSize: "12px", color: "#aaa", marginTop: "4px" }}>
                    {entry.file_name} · {new Date(entry.created_at).toLocaleString()}
                  </div>
                  {entry.status === "failed" && entry.error && (
                    <div style={{ fontSize: "12px", color: "#c00", background: "#fff0f0", borderRadius: "6px", padding: "4px 8px", marginTop: "6px", wordBreak: "break-word" }}>
                      {entry.error}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
