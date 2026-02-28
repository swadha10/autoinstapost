const TONES = ["engaging", "professional", "funny", "inspirational", "minimal"];

const styles = {
  label: { fontSize: "13px", fontWeight: 600, marginBottom: "6px", display: "block" },
  toneRow: { display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" },
  toneBtn: (active) => ({
    padding: "5px 14px",
    borderRadius: "20px",
    border: active ? "none" : "1px solid #ddd",
    background: active ? "#e1306c" : "#fff",
    color: active ? "#fff" : "#333",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: active ? 600 : 400,
    transition: "background 0.15s",
  }),
  textarea: {
    width: "100%",
    minHeight: "140px",
    border: "1px solid #ddd",
    borderRadius: "8px",
    padding: "12px",
    fontSize: "14px",
    lineHeight: "1.5",
    resize: "vertical",
    fontFamily: "inherit",
    outline: "none",
  },
  generateBtn: (loading) => ({
    marginBottom: "10px",
    padding: "8px 18px",
    background: loading ? "#ccc" : "#405de6",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    cursor: loading ? "not-allowed" : "pointer",
    fontSize: "14px",
    fontWeight: 600,
  }),
  charCount: { fontSize: "12px", color: "#999", textAlign: "right", marginTop: "4px" },
};

export default function CaptionEditor({ caption, tone, onChange, onToneChange, onGenerate, loading }) {
  return (
    <div>
      <label style={styles.label}>Caption Tone</label>
      <div style={styles.toneRow}>
        {TONES.map((t) => (
          <button key={t} style={styles.toneBtn(t === tone)} onClick={() => onToneChange(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <button style={styles.generateBtn(loading)} onClick={onGenerate} disabled={loading}>
        {loading ? "Generating..." : "Generate with Claude AI"}
      </button>

      <label style={styles.label}>Caption</label>
      <textarea
        style={styles.textarea}
        value={caption}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Your caption will appear here. Edit as needed before posting."
      />
      <div style={styles.charCount}>{caption.length} / 2200 chars</div>
    </div>
  );
}
