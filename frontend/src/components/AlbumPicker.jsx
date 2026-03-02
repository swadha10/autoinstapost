/**
 * AlbumPicker — lists the user's Google Photos albums and lets them pick one.
 */
import { useEffect, useState } from "react";
import { fetchAlbums } from "../api/client";

export default function AlbumPicker({ selectedId, onSelect }) {
  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchAlbums()
      .then((data) => setAlbums(data.albums || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p style={{ color: "#888", fontSize: "13px" }}>Loading albums…</p>;
  }

  if (error) {
    return (
      <div style={{
        background: "#fff0f0", border: "1px solid #fcc",
        borderRadius: "8px", padding: "10px 14px",
        color: "#c00", fontSize: "13px",
      }}>
        {error}
      </div>
    );
  }

  if (albums.length === 0) {
    return (
      <p style={{ color: "#888", fontSize: "13px" }}>
        No Google Photos albums found. Make sure your account has albums.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {albums.map((album) => (
        <div
          key={album.id}
          onClick={() => onSelect(album.id, album.title)}
          style={{
            display: "flex", alignItems: "center", gap: "12px",
            padding: "10px 12px",
            border: `1.5px solid ${album.id === selectedId ? "#833ab4" : "#e0e0e0"}`,
            borderRadius: "10px",
            background: album.id === selectedId ? "#f5f0ff" : "#fff",
            cursor: "pointer",
            transition: "border 0.15s, background 0.15s",
          }}
        >
          {album.coverUrl ? (
            <img
              src={album.coverUrl}
              alt=""
              style={{ width: "48px", height: "48px", borderRadius: "6px", objectFit: "cover", flexShrink: 0 }}
              onError={(e) => { e.target.style.display = "none"; }}
            />
          ) : (
            <div style={{
              width: "48px", height: "48px", borderRadius: "6px",
              background: "#f0e0ff", display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: "22px", flexShrink: 0,
            }}>
              🖼️
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontWeight: album.id === selectedId ? 700 : 500,
              fontSize: "13px", color: "#222",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {album.title}
            </div>
            <div style={{ fontSize: "11px", color: "#aaa", marginTop: "2px" }}>
              {album.count} items
            </div>
          </div>
          {album.id === selectedId && (
            <span style={{ fontSize: "16px", color: "#833ab4", flexShrink: 0 }}>✓</span>
          )}
        </div>
      ))}
    </div>
  );
}
