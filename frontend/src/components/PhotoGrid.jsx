import { useState } from "react";
import { photoRawUrl } from "../api/client";

const MAX_SELECT = 10;

const s = {
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))",
    gap: "10px",
    padding: "10px 0 4px",
  },
  card: (order, dimmed) => ({
    cursor: "pointer",
    borderRadius: "10px",
    overflow: "hidden",
    border: order > 0 ? "3px solid #e1306c" : "3px solid transparent",
    boxShadow: order > 0 ? "0 0 0 2px #e1306c44" : "0 2px 8px #0001",
    transition: "border 0.15s, opacity 0.15s",
    background: "#fff",
    opacity: dimmed ? 0.5 : 1,
    position: "relative",
  }),
  img: { width: "100%", aspectRatio: "1 / 1", objectFit: "cover", display: "block" },
  name: {
    fontSize: "11px", color: "#555", padding: "5px 8px",
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  },
  orderBadge: {
    position: "absolute", top: "6px", left: "6px",
    width: "22px", height: "22px", borderRadius: "50%",
    background: "#e1306c", color: "#fff",
    fontSize: "12px", fontWeight: 800,
    display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: "0 1px 4px #0004",
  },
  sharedBadge: {
    position: "absolute", top: "6px", left: "6px",
    background: "rgba(0,0,0,0.55)", color: "#fff",
    fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "20px",
  },
  markBtn: (shared) => ({
    position: "absolute", top: "6px", right: "6px",
    background: shared ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.45)",
    color: shared ? "#555" : "#fff",
    fontSize: "10px", fontWeight: 700, padding: "3px 8px", borderRadius: "20px",
    border: "none", cursor: "pointer", lineHeight: 1.4, backdropFilter: "blur(4px)",
  }),
  sectionHeader: { display: "flex", alignItems: "center", gap: "8px", margin: "16px 0 2px" },
  sectionLabel: (fresh) => ({
    fontSize: "12px", fontWeight: 700, letterSpacing: "0.06em",
    textTransform: "uppercase", color: fresh ? "#405de6" : "#aaa",
  }),
  sectionCount: { fontSize: "11px", color: "#bbb", fontWeight: 500 },
  divider: { flex: 1, height: "1px", background: "#f0f0f0" },
  selectionHint: {
    fontSize: "12px", color: "#888", marginBottom: "4px",
    display: "flex", alignItems: "center", gap: "6px",
  },
  selectionCount: {
    background: "#e1306c", color: "#fff",
    borderRadius: "20px", padding: "1px 9px", fontSize: "12px", fontWeight: 700,
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

function PhotoCard({ photo, order, dimmed, shared, onToggle, onMark }) {
  const [busy, setBusy] = useState(false);

  async function handleMark(e) {
    e.stopPropagation();
    setBusy(true);
    try { await onMark(photo.id); } finally { setBusy(false); }
  }

  return (
    <div style={s.card(order, dimmed)} onClick={() => onToggle(photo)}>
      <img src={photoRawUrl(photo.id)} alt={photo.name} style={s.img} loading="lazy" />

      {order > 0 && <div style={s.orderBadge}>{order}</div>}
      {!order && shared && <div style={s.sharedBadge}>Shared</div>}

      <button style={s.markBtn(shared)} onClick={handleMark} disabled={busy}
        title={shared ? "Move back to Fresh shots" : "Mark as already shared"}>
        {busy ? "…" : shared ? "↩ Unmark" : "✓ Mark shared"}
      </button>
      <div style={s.name}>{photo.name}</div>
    </div>
  );
}

export default function PhotoGrid({ photos, postedIds = [], selectedIds = [], onToggle, onMarkPosted, onUnmarkPosted }) {
  if (!photos.length) {
    return <p style={{ color: "#888", padding: "16px 0" }}>No photos found in this folder.</p>;
  }

  const postedSet = new Set(postedIds);
  const fresh = photos.filter((p) => !postedSet.has(p.id));
  const shared = photos.filter((p) => postedSet.has(p.id));
  const selectedCount = selectedIds.length;

  return (
    <div>
      {selectedCount > 0 && (
        <div style={s.selectionHint}>
          <span style={s.selectionCount}>{selectedCount}</span>
          <span>{selectedCount === 1 ? "photo selected" : `photos selected — will post as carousel`}</span>
          {selectedCount >= MAX_SELECT && <span style={{ color: "#e1306c", fontWeight: 600 }}>· max reached</span>}
        </div>
      )}

      {fresh.length > 0 && (
        <Section label="Fresh shots" count={fresh.length} fresh={true}>
          {fresh.map((photo) => {
            const order = selectedIds.indexOf(photo.id) + 1; // 0 if not selected
            return (
              <PhotoCard
                key={photo.id}
                photo={photo}
                order={order}
                dimmed={false}
                shared={false}
                onToggle={onToggle}
                onMark={onMarkPosted}
              />
            );
          })}
        </Section>
      )}

      {shared.length > 0 && (
        <Section label="Already shared" count={shared.length} fresh={false}>
          {shared.map((photo) => {
            const order = selectedIds.indexOf(photo.id) + 1;
            return (
              <PhotoCard
                key={photo.id}
                photo={photo}
                order={order}
                dimmed={true}
                shared={true}
                onToggle={onToggle}
                onMark={onUnmarkPosted}
              />
            );
          })}
        </Section>
      )}
    </div>
  );
}
