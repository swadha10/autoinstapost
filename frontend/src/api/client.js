const BASE = "";  // proxied by Vite in dev

function authHeaders() {
  const token = localStorage.getItem("aip_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...authHeaders(),
      "ngrok-skip-browser-warning": "1",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    let detail = text;
    try { detail = JSON.parse(text).detail || text; } catch {}
    throw new Error(detail);
  }
  return res.json();
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function register(email, password) {
  return apiFetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

export async function loginApi(email, password) {
  return apiFetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

export async function getMe() {
  return apiFetch(`${BASE}/auth/me`);
}

export async function getMyCredentials() {
  return apiFetch(`${BASE}/auth/credentials`);
}

export async function saveCredentials(creds) {
  return apiFetch(`${BASE}/auth/credentials`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(creds),
  });
}

export async function getInstagramConnectUrl() {
  return apiFetch(`${BASE}/auth/instagram/connect`);
}

export async function getGoogleConnectUrl() {
  return apiFetch(`${BASE}/auth/google/connect`);
}

// ── Google Photos ──────────────────────────────────────────────────────────────

export async function fetchAlbums() {
  return apiFetch(`${BASE}/photos/albums`);
}

export async function fetchAlbumPhotos(albumId) {
  return apiFetch(`${BASE}/photos/album/${encodeURIComponent(albumId)}/media`);
}

export function photoAlbumRawUrl(mediaId) {
  const token = localStorage.getItem("aip_token") || "";
  return `${BASE}/photos/media/${mediaId}/raw?token=${encodeURIComponent(token)}`;
}

export async function startGooglePicker() {
  return apiFetch(`${BASE}/photos/picker/start`, { method: "POST" });
}

export async function getPickerPhotos() {
  return apiFetch(`${BASE}/photos/picker/items`);
}

export function pickerThumbUrl(mediaId) {
  const token = localStorage.getItem("aip_token") || "";
  return `${BASE}/photos/picker/media/${mediaId}/raw?token=${encodeURIComponent(token)}`;
}

// ── Drive ─────────────────────────────────────────────────────────────────────

export async function getFolderInfo(folderId) {
  return apiFetch(`${BASE}/drive/folder/${encodeURIComponent(folderId)}`);
}

export async function getSavedFolders() {
  return apiFetch(`${BASE}/drive/saved-folders`);
}

export async function updateSavedFolders(folders) {
  return apiFetch(`${BASE}/drive/saved-folders`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(folders),
  });
}

export async function fetchPhotos(folderId) {
  return apiFetch(`${BASE}/drive/photos?folder_id=${encodeURIComponent(folderId)}`);
}

export function photoRawUrl(fileId) {
  const token = localStorage.getItem("aip_token") || "";
  return `${BASE}/drive/photo/${fileId}/raw?token=${encodeURIComponent(token)}`;
}

// ── Caption ───────────────────────────────────────────────────────────────────

export async function generateCaption(fileIds, tone = "engaging") {
  const ids = Array.isArray(fileIds) ? fileIds : [fileIds];
  return apiFetch(`${BASE}/caption/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_ids: ids, tone }),
  });
}

// ── Instagram ─────────────────────────────────────────────────────────────────

export async function getInstagramAccount() {
  return apiFetch(`${BASE}/instagram/account-info`);
}

export async function postToInstagram(fileIds, caption, source = "drive", pickerSessionId = null) {
  const ids = Array.isArray(fileIds) ? fileIds : [fileIds];
  return apiFetch(`${BASE}/instagram/post`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_ids: ids, caption, source, picker_session_id: pickerSessionId }),
  });
}

// ── Schedule ──────────────────────────────────────────────────────────────────

export async function getPostedIds() {
  return apiFetch(`${BASE}/schedule/posted-ids`);
}

export async function markAsPosted(fileId) {
  return apiFetch(`${BASE}/schedule/posted-ids/${fileId}`, { method: "POST" });
}

export async function unmarkAsPosted(fileId) {
  return apiFetch(`${BASE}/schedule/posted-ids/${fileId}`, { method: "DELETE" });
}

export async function getServerTimezone() {
  return apiFetch(`${BASE}/schedule/timezone`);
}

export async function getScheduleConfig() {
  return apiFetch(`${BASE}/schedule/config`);
}

export async function saveScheduleConfig(config) {
  return apiFetch(`${BASE}/schedule/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
}

export async function getPendingPosts() {
  return apiFetch(`${BASE}/schedule/pending`);
}

export async function approvePost(id) {
  return apiFetch(`${BASE}/schedule/pending/${id}/approve`, { method: "POST" });
}

export async function rejectPost(id) {
  return apiFetch(`${BASE}/schedule/pending/${id}`, { method: "DELETE" });
}

export async function getPostHistory() {
  return apiFetch(`${BASE}/schedule/history`);
}

export async function getScheduleStatus() {
  return apiFetch(`${BASE}/schedule/status`);
}

export async function runScheduleNow() {
  return apiFetch(`${BASE}/schedule/run-now`, { method: "POST" });
}
