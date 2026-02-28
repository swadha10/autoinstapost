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
    display: "flex",
    alignItems: "center",
    padding: "12px 14px",
    gap: "10px",
    borderBottom: "1px solid #efefef",
  },
  avatar: {
    width: "34px",
    height: "34px",
    borderRadius: "50%",
    background: "linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)",
  },
  username: { fontWeight: 600, fontSize: "14px" },
  img: { width: "100%", aspectRatio: "1/1", objectFit: "cover", display: "block" },
  captionBox: { padding: "12px 14px" },
  captionText: { fontSize: "14px", lineHeight: "1.5", whiteSpace: "pre-wrap", wordBreak: "break-word" },
  postBtn: (ready) => ({
    margin: "0 14px 14px",
    width: "calc(100% - 28px)",
    padding: "12px",
    background: ready ? "linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)" : "#ccc",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    cursor: ready ? "pointer" : "not-allowed",
    fontSize: "15px",
    fontWeight: 700,
  }),
  success: {
    margin: "0 14px 14px",
    padding: "12px",
    background: "#e8f5e9",
    borderRadius: "8px",
    color: "#2e7d32",
    fontWeight: 600,
    fontSize: "14px",
    textAlign: "center",
  },
};

export default function PostPreview({ photo, caption, onPost, posting, posted }) {
  const ready = photo && caption.trim().length > 0;

  return (
    <div style={styles.wrapper}>
      <div style={styles.header}>
        <div style={styles.avatar} />
        <span style={styles.username}>your_account</span>
      </div>

      {photo ? (
        <img src={photoRawUrl(photo.id)} alt={photo.name} style={styles.img} />
      ) : (
        <div style={{ ...styles.img, background: "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "#aaa", fontSize: "13px" }}>Select a photo</span>
        </div>
      )}

      <div style={styles.captionBox}>
        <span style={styles.captionText}>
          {caption || <span style={{ color: "#aaa" }}>Caption preview...</span>}
        </span>
      </div>

      {posted ? (
        <div style={styles.success}>Posted successfully!</div>
      ) : (
        <button style={styles.postBtn(ready && !posting)} onClick={onPost} disabled={!ready || posting}>
          {posting ? "Posting..." : "Post to Instagram"}
        </button>
      )}
    </div>
  );
}
