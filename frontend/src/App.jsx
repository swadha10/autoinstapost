import { useState } from "react";
import { fetchPhotos, generateCaption, postToInstagram } from "./api/client";
import CaptionEditor from "./components/CaptionEditor";
import PhotoGrid from "./components/PhotoGrid";
import PostPreview from "./components/PostPreview";
import ScheduleTab from "./components/ScheduleTab";

const styles = {
  app: { minHeight: "100vh", background: "#fafafa" },
  header: {
    background: "linear-gradient(90deg, #405de6, #5851db, #833ab4, #c13584, #e1306c, #fd1d1d)",
    padding: "16px 24px",
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  headerTitle: { color: "#fff", fontSize: "22px", fontWeight: 800, letterSpacing: "-0.5px" },
  headerSub: { color: "rgba(255,255,255,0.8)", fontSize: "13px" },
  tabBar: {
    display: "flex",
    gap: "0",
    borderBottom: "2px solid #eee",
    background: "#fff",
    padding: "0 24px",
  },
  tab: (active) => ({
    padding: "12px 24px",
    fontSize: "14px",
    fontWeight: active ? 700 : 500,
    color: active ? "#c13584" : "#666",
    borderBottom: active ? "2px solid #c13584" : "2px solid transparent",
    marginBottom: "-2px",
    cursor: "pointer",
    background: "none",
    border: "none",
    borderBottom: active ? "2px solid #c13584" : "2px solid transparent",
    transition: "color 0.15s",
  }),
  main: { maxWidth: "1100px", margin: "0 auto", padding: "24px 20px", display: "flex", gap: "28px", flexWrap: "wrap" },
  left: { flex: "1 1 520px" },
  right: { flex: "0 0 380px" },
  card: { background: "#fff", borderRadius: "12px", padding: "20px", boxShadow: "0 2px 12px #0001", marginBottom: "20px" },
  sectionTitle: { fontSize: "16px", fontWeight: 700, marginBottom: "14px", color: "#111" },
  folderRow: { display: "flex", gap: "10px" },
  input: {
    flex: 1,
    padding: "10px 14px",
    border: "1px solid #ddd",
    borderRadius: "8px",
    fontSize: "14px",
    outline: "none",
  },
  loadBtn: (loading) => ({
    padding: "10px 20px",
    background: loading ? "#ccc" : "#111",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    cursor: loading ? "not-allowed" : "pointer",
    fontWeight: 600,
    fontSize: "14px",
    whiteSpace: "nowrap",
  }),
  error: {
    background: "#fff0f0",
    border: "1px solid #fcc",
    borderRadius: "8px",
    padding: "10px 14px",
    color: "#c00",
    fontSize: "13px",
    marginTop: "10px",
  },
  hint: { fontSize: "12px", color: "#999", marginTop: "6px" },
  scheduleMain: { maxWidth: "720px", margin: "0 auto", padding: "24px 20px" },
};

export default function App() {
  const [activeTab, setActiveTab] = useState("manual");

  const [folderId, setFolderId] = useState("");
  const [photos, setPhotos] = useState([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [photosError, setPhotosError] = useState("");

  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [caption, setCaption] = useState("");
  const [tone, setTone] = useState("engaging");
  const [generatingCaption, setGeneratingCaption] = useState(false);
  const [captionError, setCaptionError] = useState("");

  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const [postError, setPostError] = useState("");

  async function handleLoadPhotos() {
    if (!folderId.trim()) return;
    setLoadingPhotos(true);
    setPhotosError("");
    setPhotos([]);
    setSelectedPhoto(null);
    setCaption("");
    setPosted(false);
    try {
      const data = await fetchPhotos(folderId.trim());
      setPhotos(data.photos);
    } catch (e) {
      setPhotosError(e.message);
    } finally {
      setLoadingPhotos(false);
    }
  }

  function handleSelectPhoto(photo) {
    setSelectedPhoto(photo);
    setCaption("");
    setPosted(false);
    setPostError("");
  }

  async function handleGenerateCaption() {
    if (!selectedPhoto) return;
    setGeneratingCaption(true);
    setCaptionError("");
    try {
      const data = await generateCaption(selectedPhoto.id, tone);
      setCaption(data.caption);
    } catch (e) {
      setCaptionError(e.message);
    } finally {
      setGeneratingCaption(false);
    }
  }

  async function handlePost() {
    if (!selectedPhoto || !caption.trim()) return;
    setPosting(true);
    setPostError("");
    try {
      await postToInstagram(selectedPhoto.id, caption);
      setPosted(true);
    } catch (e) {
      setPostError(e.message);
    } finally {
      setPosting(false);
    }
  }

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <div>
          <div style={styles.headerTitle}>AutoInstaPost</div>
          <div style={styles.headerSub}>Google Drive → Claude AI caption → Instagram</div>
        </div>
      </header>

      {/* Tab bar */}
      <div style={styles.tabBar}>
        <button style={styles.tab(activeTab === "manual")} onClick={() => setActiveTab("manual")}>
          Manual
        </button>
        <button style={styles.tab(activeTab === "schedule")} onClick={() => setActiveTab("schedule")}>
          Schedule
        </button>
      </div>

      {activeTab === "manual" ? (
        <main style={styles.main}>
          {/* Left column */}
          <div style={styles.left}>
            {/* Step 1: Load photos */}
            <div style={styles.card}>
              <div style={styles.sectionTitle}>1. Connect Google Drive Folder</div>
              <div style={styles.folderRow}>
                <input
                  style={styles.input}
                  placeholder="Paste Google Drive folder ID..."
                  value={folderId}
                  onChange={(e) => setFolderId(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLoadPhotos()}
                />
                <button style={styles.loadBtn(loadingPhotos)} onClick={handleLoadPhotos} disabled={loadingPhotos}>
                  {loadingPhotos ? "Loading..." : "Load Photos"}
                </button>
              </div>
              <p style={styles.hint}>
                Find your folder ID in the Drive URL:{" "}
                <code>drive.google.com/drive/folders/<strong>FOLDER_ID</strong></code>
              </p>
              {photosError && <div style={styles.error}>{photosError}</div>}
            </div>

            {/* Step 2: Pick a photo */}
            {photos.length > 0 && (
              <div style={styles.card}>
                <div style={styles.sectionTitle}>
                  2. Select a Photo{" "}
                  <span style={{ fontWeight: 400, color: "#888", fontSize: "13px" }}>
                    ({photos.length} found)
                  </span>
                </div>
                <PhotoGrid photos={photos} selectedId={selectedPhoto?.id} onSelect={handleSelectPhoto} />
              </div>
            )}

            {/* Step 3: Caption */}
            {selectedPhoto && (
              <div style={styles.card}>
                <div style={styles.sectionTitle}>3. Write a Caption</div>
                <CaptionEditor
                  caption={caption}
                  tone={tone}
                  onChange={setCaption}
                  onToneChange={setTone}
                  onGenerate={handleGenerateCaption}
                  loading={generatingCaption}
                />
                {captionError && <div style={styles.error}>{captionError}</div>}
              </div>
            )}

            {postError && <div style={styles.error}>{postError}</div>}
          </div>

          {/* Right column — preview */}
          <div style={styles.right}>
            <div style={styles.card}>
              <div style={styles.sectionTitle}>4. Preview & Post</div>
              <PostPreview
                photo={selectedPhoto}
                caption={caption}
                onPost={handlePost}
                posting={posting}
                posted={posted}
              />
            </div>
          </div>
        </main>
      ) : (
        <div style={styles.scheduleMain}>
          <ScheduleTab />
        </div>
      )}
    </div>
  );
}
