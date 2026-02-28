import { photoRawUrl } from "../api/client";

const styles = {
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
    gap: "12px",
    padding: "16px 0",
  },
  card: (selected) => ({
    cursor: "pointer",
    borderRadius: "10px",
    overflow: "hidden",
    border: selected ? "3px solid #e1306c" : "3px solid transparent",
    boxShadow: selected ? "0 0 0 2px #e1306c44" : "0 2px 8px #0001",
    transition: "border 0.15s, box-shadow 0.15s",
    background: "#fff",
  }),
  img: {
    width: "100%",
    aspectRatio: "1 / 1",
    objectFit: "cover",
    display: "block",
  },
  name: {
    fontSize: "11px",
    color: "#555",
    padding: "6px 8px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
};

export default function PhotoGrid({ photos, selectedId, onSelect }) {
  if (!photos.length) {
    return <p style={{ color: "#888", padding: "16px 0" }}>No photos found in this folder.</p>;
  }

  return (
    <div style={styles.grid}>
      {photos.map((photo) => (
        <div
          key={photo.id}
          style={styles.card(photo.id === selectedId)}
          onClick={() => onSelect(photo)}
        >
          <img src={photoRawUrl(photo.id)} alt={photo.name} style={styles.img} loading="lazy" />
          <div style={styles.name}>{photo.name}</div>
        </div>
      ))}
    </div>
  );
}
