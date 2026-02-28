import { photoRawUrl } from "../api/client";

const s = {
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))",
    gap: "10px",
    padding: "10px 0 4px",
  },
  card: (selected, dimmed) => ({
    cursor: "pointer",
    borderRadius: "10px",
    overflow: "hidden",
    border: selected ? "3px solid #e1306c" : "3px solid transparent",
    boxShadow: selected ? "0 0 0 2px #e1306c44" : "0 2px 8px #0001",
    transition: "border 0.15s, box-shadow 0.15s, opacity 0.15s",
    background: "#fff",
    opacity: dimmed ? 0.55 : 1,
    position: "relative",
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
    padding: "5px 8px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  badge: {
    position: "absolute",
    top: "6px",
    right: "6px",
    background: "rgba(0,0,0,0.55)",
    color: "#fff",
    fontSize: "10px",
    fontWeight: 700,
    padding: "2px 7px",
    borderRadius: "20px",
    backdropFilter: "blur(4px)",
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    margin: "16px 0 2px",
  },
  sectionLabel: (fresh) => ({
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: fresh ? "#405de6" : "#aaa",
  }),
  sectionCount: {
    fontSize: "11px",
    color: "#bbb",
    fontWeight: 500,
  },
  divider: {
    flex: 1,
    height: "1px",
    background: "#f0f0f0",
  },
};

function Section({ label, count, fresh, children }) {
  return (
    <>
      <div style={s.sectionHeader}>
        <span style={s.sectionLabel(fresh)}>{label}</span>
        <span style={s.sectionCount}>{count}</span>
        <div style={s.divider} />
      </div>
      <div style={s.grid}>{children}</div>
    </>
  );
}

function PhotoCard({ photo, selected, dimmed, showBadge, onSelect }) {
  return (
    <div style={s.card(selected, dimmed)} onClick={() => onSelect(photo)}>
      <img src={photoRawUrl(photo.id)} alt={photo.name} style={s.img} loading="lazy" />
      {showBadge && <div style={s.badge}>Shared</div>}
      <div style={s.name}>{photo.name}</div>
    </div>
  );
}

export default function PhotoGrid({ photos, postedIds = [], selectedId, onSelect }) {
  if (!photos.length) {
    return <p style={{ color: "#888", padding: "16px 0" }}>No photos found in this folder.</p>;
  }

  const postedSet = new Set(postedIds);
  const fresh = photos.filter((p) => !postedSet.has(p.id));
  const shared = photos.filter((p) => postedSet.has(p.id));

  return (
    <div>
      {fresh.length > 0 && (
        <Section label="Fresh shots" count={fresh.length} fresh={true}>
          {fresh.map((photo) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              selected={photo.id === selectedId}
              dimmed={false}
              showBadge={false}
              onSelect={onSelect}
            />
          ))}
        </Section>
      )}

      {shared.length > 0 && (
        <Section label="Already shared" count={shared.length} fresh={false}>
          {shared.map((photo) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              selected={photo.id === selectedId}
              dimmed={true}
              showBadge={true}
              onSelect={onSelect}
            />
          ))}
        </Section>
      )}
    </div>
  );
}
