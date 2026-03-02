/**
 * FolderPicker — shows a list of saved Drive folders and an "Add folder" input.
 * Saved folders are persisted to localStorage, scoped by userId to prevent
 * cross-user data leakage on shared devices.
 */
import { useState } from "react";
import { getFolderInfo } from "../api/client";

function lsKey(userId) {
  return `aip_saved_folders_${userId || "guest"}`;
}

function readSaved(userId) {
  try { return JSON.parse(localStorage.getItem(lsKey(userId)) || "[]"); }
  catch { return []; }
}

function writeSaved(userId, list) {
  localStorage.setItem(lsKey(userId), JSON.stringify(list));
}

export function useSavedFolders(userId) {
  const [folders, setFolders] = useState(() => readSaved(userId));

  function _sync(list) { setFolders(list); writeSaved(userId, list); }

  function addFolder(id, name) {
    _sync([...readSaved(userId).filter((f) => f.id !== id), { id, name }]);
  }
  function removeFolder(id) {
    _sync(readSaved(userId).filter((f) => f.id !== id));
  }

  return { folders, addFolder, removeFolder };
}

function parseFolderId(raw) {
  const m = raw.trim().match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : raw.trim().replace(/[^a-zA-Z0-9_-]/g, "") || raw.trim();
}

export default function FolderPicker({ selectedId, onSelect, userId }) {
  const { folders, addFolder, removeFolder } = useSavedFolders(userId);
  const [showInput, setShowInput] = useState(folders.length === 0);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleAdd(e) {
    e.preventDefault();
    const id = parseFolderId(input);
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const info = await getFolderInfo(id);
      addFolder(info.id, info.name);
      setInput("");
      setShowInput(false);
      onSelect(info.id, info.name);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {/* Saved folder chips */}
      {folders.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "10px" }}>
          {folders.map((f) => (
            <div
              key={f.id}
              onClick={() => onSelect(f.id, f.name)}
              style={{
                display: "flex", alignItems: "center", gap: "8px",
                padding: "8px 12px",
                background: f.id === selectedId ? "#f0f0ff" : "#f7f7f7",
                border: `1.5px solid ${f.id === selectedId ? "#833ab4" : "#e0e0e0"}`,
                borderRadius: "8px", cursor: "pointer",
                transition: "border 0.15s, background 0.15s",
              }}
            >
              <span>📁</span>
              <span style={{
                fontSize: "13px", fontWeight: f.id === selectedId ? 700 : 500,
                color: "#333", maxWidth: "200px",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {f.name}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); removeFolder(f.id); }}
                title="Remove from list"
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: "#bbb", fontSize: "13px", padding: "0 0 0 2px", lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>
          ))}

          <button
            onClick={() => { setShowInput((v) => !v); setError(""); }}
            style={{
              padding: "8px 12px", border: "1.5px dashed #ccc", borderRadius: "8px",
              background: "none", cursor: "pointer", fontSize: "13px", color: "#888",
            }}
          >
            {showInput ? "Cancel" : "+ Add folder"}
          </button>
        </div>
      )}

      {/* Add folder input */}
      {(showInput || folders.length === 0) && (
        <form onSubmit={handleAdd} style={{ display: "flex", gap: "8px" }}>
          <input
            style={{
              flex: 1, padding: "9px 12px", border: "1px solid #ddd",
              borderRadius: "8px", fontSize: "13px", outline: "none",
            }}
            placeholder="Paste Drive URL or folder ID…"
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(""); }}
            autoFocus={folders.length === 0}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            style={{
              padding: "9px 16px",
              background: loading || !input.trim() ? "#ccc" : "#111",
              color: "#fff", border: "none", borderRadius: "8px",
              cursor: loading || !input.trim() ? "not-allowed" : "pointer",
              fontWeight: 600, fontSize: "13px", whiteSpace: "nowrap",
            }}
          >
            {loading ? "Loading…" : "Add & Select"}
          </button>
        </form>
      )}

      {error && (
        <div style={{
          marginTop: "8px", fontSize: "13px", color: "#c00",
          background: "#fff0f0", padding: "8px 12px",
          borderRadius: "8px", border: "1px solid #fcc",
        }}>
          {error}
        </div>
      )}

      <p style={{ fontSize: "12px", color: "#999", marginTop: "6px" }}>
        {folders.length > 0
          ? "Click a folder to load it · ✕ to remove from list"
          : <>Paste the full Drive URL or just the folder ID — <code>drive.google.com/drive/folders/<strong>FOLDER_ID</strong></code></>
        }
      </p>
    </div>
  );
}
