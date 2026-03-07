import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "../hooks/useIsMobile";
import { fetchAlbumPhotos, fetchPhotos, generateCaption, getInstagramAccount, getPickerPhotos, getPostedIds, getScheduleConfig, markAsPosted, pickerThumbUrl, postToInstagram, startGooglePicker, unmarkAsPosted } from "../api/client";
import AlbumPicker from "../components/AlbumPicker";
import CaptionEditor from "../components/CaptionEditor";
import FolderPicker from "../components/FolderPicker";
import HistoryTab from "../components/HistoryTab";
import PhotoGrid from "../components/PhotoGrid";
import PostPreview from "../components/PostPreview";
import ScheduleTab from "../components/ScheduleTab";
import SettingsTab from "../components/SettingsTab";
import StoryTab from "../components/StoryTab";
import { useAuth } from "../context/AuthContext";

const styles = {
  app: { minHeight: "100vh", background: "#fafafa" },
  header: {
    background: "linear-gradient(90deg, #405de6, #5851db, #833ab4, #c13584, #e1306c, #fd1d1d)",
    padding: "12px 16px",
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  headerTitle: { color: "#fff", fontSize: "20px", fontWeight: 800, letterSpacing: "-0.5px" },
  headerSub: { color: "rgba(255,255,255,0.8)", fontSize: "12px" },
  tabBar: {
    display: "flex",
    borderBottom: "2px solid #eee",
    background: "#fff",
    padding: "0 8px",
    overflowX: "auto",
    WebkitOverflowScrolling: "touch",
  },
  tab: (active) => ({
    padding: "11px 16px",
    fontSize: "13px",
    fontWeight: active ? 700 : 500,
    color: active ? "#c13584" : "#666",
    borderBottom: active ? "2px solid #c13584" : "2px solid transparent",
    marginBottom: "-2px",
    cursor: "pointer",
    background: "none",
    border: "none",
    whiteSpace: "nowrap",
    flexShrink: 0,
  }),
  main: { maxWidth: "1100px", margin: "0 auto", padding: "16px 12px", display: "flex", gap: "20px", flexWrap: "wrap" },
  left: { flex: "1 1 300px", minWidth: 0 },
  right: { flex: "1 1 340px", minWidth: 0 },
  card: { background: "#fff", borderRadius: "12px", padding: "16px", boxShadow: "0 2px 12px #0001", marginBottom: "16px" },
  sectionTitle: { fontSize: "15px", fontWeight: 700, marginBottom: "12px", color: "#111" },
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
  scheduleMain: { maxWidth: "720px", margin: "0 auto", padding: "16px 12px" },
};

function loadFolderFromStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function FolderError({ message }) {
  // Detect "not shared" errors and pull out the service account email if present
  const isAccessError = /not shared|notFound|not found/i.test(message);
  const emailMatch = message.match(/Share the folder with ([^\s(]+)/);
  const saEmail = emailMatch?.[1] || "insta-auto-post@insta-auto-post-488807.iam.gserviceaccount.com";

  if (!isAccessError) {
    return <div style={styles.error}>{message}</div>;
  }

  return (
    <div style={{
      marginTop: "12px",
      background: "#fff8f0",
      border: "1px solid #f5c18a",
      borderRadius: "10px",
      padding: "14px 16px",
    }}>
      <div style={{ fontWeight: 700, color: "#b45309", fontSize: "14px", marginBottom: "10px" }}>
        📂 Folder not accessible — share it with your service account
      </div>

      <ol style={{ margin: 0, paddingLeft: "20px", color: "#555", fontSize: "13px", lineHeight: "2" }}>
        <li>Open the folder in <a href="https://drive.google.com" target="_blank" rel="noreferrer" style={{ color: "#c13584" }}>Google Drive</a></li>
        <li>Click <strong>Share</strong> (top-right)</li>
        <li>
          Paste this email and set role to <strong>Viewer</strong>:
          {saEmail ? (
            <div style={{
              display: "flex", alignItems: "center", gap: "8px",
              margin: "6px 0", background: "#fff", border: "1px solid #e5c97a",
              borderRadius: "6px", padding: "7px 12px",
            }}>
              <code style={{ flex: 1, fontSize: "13px", color: "#111", wordBreak: "break-all" }}>
                {saEmail}
              </code>
              <button
                onClick={() => navigator.clipboard.writeText(saEmail)}
                style={{
                  flexShrink: 0, padding: "3px 10px", fontSize: "12px",
                  background: "#f5c18a", border: "none", borderRadius: "5px",
                  cursor: "pointer", fontWeight: 700, color: "#7c3a00",
                }}
              >
                Copy
              </button>
            </div>
          ) : (
            <em style={{ color: "#888", marginLeft: "6px" }}>
              (check your service account JSON for <code>client_email</code>)
            </em>
          )}
        </li>
        <li>Click <strong>Send</strong> → then try loading the folder again</li>
      </ol>
    </div>
  );
}

export default function Dashboard() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState("setup");

  const storageKey = `autoinstapost_folder_${user?.id || "guest"}`;

  // Source type: "drive" or "gphotos"
  const [sourceType, setSourceType] = useState("drive");

  // Folder state
  const [savedFolder, setSavedFolder] = useState(null); // { id, name }
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [photosError, setPhotosError] = useState("");

  const [photos, setPhotos] = useState([]);
  const [postedIds, setPostedIds] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]); // ordered array for carousel
  const [caption, setCaption] = useState("");
  const [tone, setTone] = useState("engaging");
  const [generatingCaption, setGeneratingCaption] = useState(false);
  const [captionError, setCaptionError] = useState("");
  const [detectedLocation, setDetectedLocation] = useState("");

  const [pickerSessionId, setPickerSessionId] = useState(null);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false); // true after picker tab opened

  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const [postError, setPostError] = useState("");

  const [defaultCaption, setDefaultCaption] = useState("");
  const [igAccount, setIgAccount] = useState(null); // { username, profile_picture_url }

  // Restore saved folder on mount and auto-load photos; fetch default caption
  useEffect(() => {
    const stored = loadFolderFromStorage(storageKey);
    if (stored?.id) {
      setSavedFolder(stored);
      loadPhotos(stored.id, stored.name);
    }

    getInstagramAccount().then(setIgAccount).catch(() => {});
    getScheduleConfig()
      .then((cfg) => {
        setDefaultCaption(cfg.default_caption || "");
        if (!stored?.id && cfg.folder_id) {
          loadPhotos(cfg.folder_id);
        }
      })
      .catch(() => {});
  }, [storageKey]);

  async function loadPhotos(id, name = "", src = sourceType) {
    setLoadingPhotos(true);
    setPhotosError("");
    setPhotos([]);
    setSelectedIds([]);
    setCaption("");
    setPosted(false);
    try {
      const fetchFn = src === "gphotos" ? fetchAlbumPhotos : fetchPhotos;
      const [photoData, postedIdList] = await Promise.all([
        fetchFn(id),
        getPostedIds(),
      ]);
      setPhotos(photoData.photos);
      setPostedIds(postedIdList);
      setSelectedIds([]);
      setSavedFolder({ id, name });
      if (src !== "gphotos") {
        localStorage.setItem(storageKey, JSON.stringify({ id, name }));
      }
    } catch (e) {
      setPhotosError(e.message);
    } finally {
      setLoadingPhotos(false);
    }
  }

  async function loadPickerPhotos() {
    setPickerLoading(true);
    setPhotosError("");
    setPhotos([]);
    setSelectedIds([]);
    setCaption("");
    setPosted(false);
    try {
      const [data, postedIdList] = await Promise.all([getPickerPhotos(), getPostedIds()]);
      // Inject proxy thumbnail URLs (Picker baseUrls require auth, can't use in <img> directly)
      const photosWithThumb = data.photos.map((p) => ({ ...p, thumbnailUrl: pickerThumbUrl(p.id) }));
      setPhotos(photosWithThumb);
      setPickerSessionId(data.session_id);
      setPostedIds(postedIdList);
    } catch (e) {
      setPhotosError(e.message);
    } finally {
      setPickerLoading(false);
    }
  }

  async function handlePickFromGoogle() {
    setPickerLoading(true);
    setPhotosError("");
    setPickerOpen(false);
    setPhotos([]);
    setSelectedIds([]);
    try {
      const data = await startGooglePicker();
      setPickerSessionId(data.session_id);
      window.open(data.pickerUri, "_blank");
      setPickerOpen(true);
    } catch (e) {
      setPhotosError(e.message);
    } finally {
      setPickerLoading(false);
    }
  }

  function handleTogglePhoto(photo) {
    setPosted(false);
    setPostError("");
    setSelectedIds((prev) => {
      if (prev.includes(photo.id)) return prev.filter((id) => id !== photo.id);
      if (prev.length >= 4) return prev; // carousel max 4
      return [...prev, photo.id];
    });
    setCaption("");
    setDetectedLocation("");
  }

  async function handleGenerateCaption() {
    if (!selectedIds.length) return;
    setGeneratingCaption(true);
    setCaptionError("");
    try {
      const data = await generateCaption(selectedIds, tone);
      setCaption(data.caption);
      setDetectedLocation(data.location_name || "");
    } catch (e) {
      setCaptionError(e.message);
    } finally {
      setGeneratingCaption(false);
    }
  }

  async function handlePost() {
    if (!selectedIds.length || !caption.trim()) return;
    setPosting(true);
    setPostError("");
    try {
      await postToInstagram(
        selectedIds, caption, sourceType,
        sourceType === "gphotos_picker" ? pickerSessionId : null,
      );
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
        <div style={{ flex: 1 }}>
          <div style={styles.headerTitle}>AutoIG</div>
          <div style={styles.headerSub}>Google Drive → Claude AI caption → Instagram</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {user && !isMobile && <span style={{ color: "rgba(255,255,255,0.8)", fontSize: "13px" }}>{user.email}</span>}
          <button
            onClick={() => { logout(); navigate("/"); }}
            style={{
              padding: "6px 14px", background: "rgba(255,255,255,0.15)",
              color: "#fff", border: "1px solid rgba(255,255,255,0.3)",
              borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: 600,
            }}
          >
            Sign Out
          </button>
        </div>
      </header>

      <div style={styles.tabBar}>
        <button style={styles.tab(activeTab === "setup")} onClick={() => setActiveTab("setup")}>
          Setup
        </button>
        <button style={styles.tab(activeTab === "manual")} onClick={() => setActiveTab("manual")}>
          Manual
        </button>
        <button style={styles.tab(activeTab === "schedule")} onClick={() => setActiveTab("schedule")}>
          Schedule
        </button>
        <button style={styles.tab(activeTab === "stories")} onClick={() => setActiveTab("stories")}>
          Stories
        </button>
        <button style={styles.tab(activeTab === "history")} onClick={() => setActiveTab("history")}>
          History
        </button>
      </div>

      {activeTab === "setup" ? (
        <div style={styles.scheduleMain}>
          <SettingsTab />
        </div>
      ) : activeTab === "manual" ? (
        <main style={styles.main}>
          <div style={styles.left}>
            {/* Step 1: Photo source */}
            <div style={styles.card}>
              {/* Source toggle */}
              <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
                {[["drive", "Google Drive"], ["gphotos_picker", "Google Photos"]].map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => { setSourceType(val); setPhotos([]); setSelectedIds([]); setPhotosError(""); }}
                    style={{
                      flex: 1, padding: "8px", border: "2px solid",
                      borderColor: sourceType === val ? "#c13584" : "#ddd",
                      borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: 600,
                      background: sourceType === val ? "#fff0f8" : "#fff",
                      color: sourceType === val ? "#c13584" : "#555",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {sourceType === "drive" ? (
                <>
                  <div style={styles.sectionTitle}>1. Connect Google Drive Folder</div>
                  <FolderPicker
                    selectedId={savedFolder?.id}
                    onSelect={(id, name) => loadPhotos(id, name, "drive")}
                    userId={user?.id}
                  />
                  {loadingPhotos && <p style={{ ...styles.hint, marginTop: "8px" }}>Loading photos…</p>}
                </>
              ) : (
                <>
                  <div style={styles.sectionTitle}>1. Pick from Google Photos</div>
                  <button
                    onClick={handlePickFromGoogle}
                    disabled={pickerLoading}
                    style={{
                      width: "100%", padding: "12px",
                      background: pickerLoading ? "#ccc" : "linear-gradient(135deg,#4285f4,#34a853)",
                      color: "#fff", border: "none", borderRadius: "8px",
                      cursor: pickerLoading ? "not-allowed" : "pointer",
                      fontSize: "14px", fontWeight: 700,
                    }}
                  >
                    {pickerLoading ? "Opening…" : pickerOpen ? "Reopen Google Photos Picker" : "Open Google Photos Picker"}
                  </button>

                  {pickerOpen && photos.length === 0 && (
                    <div style={{ marginTop: "12px" }}>
                      <div style={{ fontSize: "13px", color: "#555", marginBottom: "8px", lineHeight: 1.5 }}>
                        Pick your photos in the Google Photos tab, then click below when done:
                      </div>
                      <button
                        onClick={loadPickerPhotos}
                        disabled={pickerLoading}
                        style={{
                          width: "100%", padding: "11px",
                          background: "#111", color: "#fff", border: "none",
                          borderRadius: "8px", cursor: "pointer",
                          fontSize: "14px", fontWeight: 700,
                        }}
                      >
                        {pickerLoading ? "Loading photos…" : "Done picking — Load Photos"}
                      </button>
                    </div>
                  )}

                  {photos.length > 0 && (
                    <div style={{ marginTop: "10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ fontSize: "12px", color: "#1a7a40", fontWeight: 600 }}>
                        ✓ {photos.length} photo{photos.length !== 1 ? "s" : ""} loaded from Google Photos
                      </div>
                      <button
                        onClick={handlePickFromGoogle}
                        style={{ fontSize: "12px", color: "#c13584", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
                      >
                        Pick again
                      </button>
                    </div>
                  )}
                </>
              )}

              {photosError && (
                sourceType === "drive"
                  ? <FolderError message={photosError} />
                  : <div style={{ ...styles.error, marginTop: "12px" }}>
                      {photosError}
                      {photosError.includes("expired") || photosError.includes("not found") ? (
                        <div style={{ marginTop: "8px", fontSize: "12px" }}>
                          Click <strong>Open Google Photos Picker</strong> above to start a new session.
                        </div>
                      ) : photosError.includes("Done") || photosError.includes("checkmark") ? (
                        <div style={{ marginTop: "8px", fontSize: "12px" }}>
                          In Google Photos, select your photos then click the <strong>blue checkmark / Done button</strong> to confirm, then click "Done picking" here.
                        </div>
                      ) : null}
                    </div>
              )}
            </div>

            {/* Step 2: Pick a photo */}
            {photos.length > 0 && (
              <div style={styles.card}>
                <div style={styles.sectionTitle}>
                  2. Select Photos{" "}
                  <span style={{ fontWeight: 400, color: "#888", fontSize: "13px" }}>
                    ({photos.length} found · tap to select · up to 4 for carousel)
                  </span>
                </div>
                <PhotoGrid
                  photos={photos}
                  postedIds={postedIds}
                  selectedIds={selectedIds}
                  onToggle={handleTogglePhoto}
                  onMarkPosted={async (id) => { await markAsPosted(id); setPostedIds((p) => [...p, id]); }}
                  onUnmarkPosted={async (id) => { await unmarkAsPosted(id); setPostedIds((p) => p.filter((x) => x !== id)); }}
                />
              </div>
            )}

            {/* Step 3: Caption */}
            {selectedIds.length > 0 && (
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
                {detectedLocation && (
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: "6px",
                    marginTop: "10px", padding: "5px 12px",
                    background: "#f0f7ff", border: "1px solid #c5dcf5",
                    borderRadius: "20px", fontSize: "13px", color: "#2a6db5",
                  }}>
                    <span>📍</span>
                    <span>{detectedLocation}</span>
                  </div>
                )}
                {captionError && (
                  <div style={styles.error}>
                    {captionError}
                    {defaultCaption && (
                      <div style={{ marginTop: "8px" }}>
                        <button
                          onClick={() => { setCaption(defaultCaption); setCaptionError(""); }}
                          style={{
                            padding: "6px 14px", background: "#fff", border: "1px solid #fcc",
                            borderRadius: "6px", cursor: "pointer", fontSize: "12px",
                            color: "#c00", fontWeight: 600,
                          }}
                        >
                          Use default caption instead
                        </button>
                        <div style={{ marginTop: "6px", fontSize: "12px", color: "#888", fontStyle: "italic" }}>
                          "{defaultCaption}"
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {postError && <div style={styles.error}>{postError}</div>}
          </div>

          <div style={styles.right}>
            <div style={styles.card}>
              <div style={styles.sectionTitle}>4. Preview & Post</div>
              <PostPreview
                photos={photos.filter((p) => selectedIds.includes(p.id)).sort((a, b) => selectedIds.indexOf(a.id) - selectedIds.indexOf(b.id))}
                caption={caption}
                onPost={handlePost}
                posting={posting}
                posted={posted}
                igAccount={igAccount}
              />
            </div>
          </div>
        </main>
      ) : activeTab === "schedule" ? (
        <div style={styles.scheduleMain}>
          <ScheduleTab />
        </div>
      ) : activeTab === "stories" ? (
        <div style={styles.scheduleMain}>
          <StoryTab />
        </div>
      ) : (
        <div style={styles.scheduleMain}>
          <HistoryTab />
        </div>
      )}
    </div>
  );
}
