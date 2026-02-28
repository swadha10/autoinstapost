import { useEffect, useState } from "react";
import { photoRawUrl } from "../api/client";

const styles = {
  wrapper: {
    background: "#fff",
    border: "1px solid #dbdbdb",
    borderRadius: "12px",
    maxWidth: "380px",
    overflow: "hidden",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  header: {
    display: "flex", alignItems: "center", padding: "12px 14px",
    gap: "10px", borderBottom: "1px solid #efefef",
  },
  avatar: {
    width: "34px", height: "34px", borderRadius: "50%",
    background: "linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)",
  },
  username: { fontWeight: 600, fontSize: "14px", flex: 1 },
  carouselType: {
    fontSize: "11px", color: "#aaa", fontWeight: 500,
  },
  imgWrap: { position: "relative", overflow: "hidden", background: "#f0f0f0" },
  img: { width: "100%", aspectRatio: "1/1", objectFit: "cover", display: "block" },
  placeholder: {
    width: "100%", aspectRatio: "1/1", background: "#f0f0f0",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  navBtn: (side) => ({
    position: "absolute", top: "50%", transform: "translateY(-50%)",
    [side]: "8px",
    background: "rgba(255,255,255,0.85)", border: "none", borderRadius: "50%",
    width: "30px", height: "30px", cursor: "pointer",
    fontSize: "14px", fontWeight: 700, color: "#333",
    display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: "0 1px 4px #0002",
  }),
  dots: {
    display: "flex", justifyContent: "center", gap: "5px",
    padding: "8px 0 4px",
  },
  dot: (active) => ({
    width: active ? "16px" : "6px", height: "6px",
    borderRadius: "3px",
    background: active ? "#e1306c" : "#ddd",
    transition: "width 0.2s, background 0.2s",
  }),
  counter: {
    position: "absolute", bottom: "8px", right: "10px",
    background: "rgba(0,0,0,0.5)", color: "#fff",
    fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "20px",
  },
  captionBox: { padding: "12px 14px" },
  captionText: { fontSize: "14px", lineHeight: "1.5", whiteSpace: "pre-wrap", wordBreak: "break-word" },
  postBtn: (ready) => ({
    margin: "0 14px 14px", width: "calc(100% - 28px)", padding: "12px",
    background: ready ? "linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)" : "#ccc",
    color: "#fff", border: "none", borderRadius: "8px",
    cursor: ready ? "pointer" : "not-allowed", fontSize: "15px", fontWeight: 700,
  }),
  success: {
    margin: "0 14px 14px", padding: "12px", background: "#e8f5e9",
    borderRadius: "8px", color: "#2e7d32", fontWeight: 600,
    fontSize: "14px", textAlign: "center",
  },
};

export default function PostPreview({ photos = [], caption, onPost, posting, posted }) {
  const [idx, setIdx] = useState(0);
  const isCarousel = photos.length > 1;
  const photo = photos[idx] ?? null;
  const ready = photos.length > 0 && caption.trim().length > 0;

  // Reset slide index whenever the photo selection changes
  useEffect(() => { setIdx(0); }, [photos.length]);

  function prev(e) { e.stopPropagation(); setIdx((i) => (i - 1 + photos.length) % photos.length); }
  function next(e) { e.stopPropagation(); setIdx((i) => (i + 1) % photos.length); }

  return (
    <div style={styles.wrapper}>
      <div style={styles.header}>
        <div style={styles.avatar} />
        <span style={styles.username}>your_account</span>
        {isCarousel && <span style={styles.carouselType}>📷 Carousel · {photos.length}</span>}
      </div>

      <div style={styles.imgWrap}>
        {photo ? (
          <img src={photoRawUrl(photo.id)} alt={photo.name} style={styles.img} />
        ) : (
          <div style={styles.placeholder}>
            <span style={{ color: "#aaa", fontSize: "13px" }}>Select a photo</span>
          </div>
        )}

        {isCarousel && photos.length > 1 && (
          <>
            <button style={styles.navBtn("left")} onClick={prev}>‹</button>
            <button style={styles.navBtn("right")} onClick={next}>›</button>
            <div style={styles.counter}>{idx + 1} / {photos.length}</div>
          </>
        )}
      </div>

      {isCarousel && (
        <div style={styles.dots}>
          {photos.map((_, i) => (
            <div key={i} style={styles.dot(i === idx)} onClick={() => setIdx(i)} />
          ))}
        </div>
      )}

      <div style={styles.captionBox}>
        <span style={styles.captionText}>
          {caption || <span style={{ color: "#aaa" }}>Caption preview...</span>}
        </span>
      </div>

      {posted ? (
        <div style={styles.success}>
          {isCarousel ? `Carousel of ${photos.length} posted!` : "Posted successfully!"}
        </div>
      ) : (
        <button style={styles.postBtn(ready && !posting)} onClick={onPost} disabled={!ready || posting}>
          {posting
            ? (isCarousel ? "Posting carousel…" : "Posting…")
            : (isCarousel ? `Post Carousel (${photos.length})` : "Post to Instagram")}
        </button>
      )}
    </div>
  );
}
