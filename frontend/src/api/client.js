const BASE = "";  // proxied by Vite in dev

export async function getFolderInfo(folderId) {
  const res = await fetch(`${BASE}/drive/folder/${encodeURIComponent(folderId)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchPhotos(folderId) {
  const res = await fetch(`${BASE}/drive/photos?folder_id=${encodeURIComponent(folderId)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function photoRawUrl(fileId) {
  return `${BASE}/drive/photo/${fileId}/raw`;
}

export async function generateCaption(fileIds, tone = "engaging") {
  const ids = Array.isArray(fileIds) ? fileIds : [fileIds];
  const res = await fetch(`${BASE}/caption/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_ids: ids, tone }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function postToInstagram(fileIds, caption) {
  const ids = Array.isArray(fileIds) ? fileIds : [fileIds];
  const res = await fetch(`${BASE}/instagram/post`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_ids: ids, caption }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getPostedIds() {
  const res = await fetch(`${BASE}/schedule/posted-ids`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function markAsPosted(fileId) {
  const res = await fetch(`${BASE}/schedule/posted-ids/${fileId}`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function unmarkAsPosted(fileId) {
  const res = await fetch(`${BASE}/schedule/posted-ids/${fileId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getServerTimezone() {
  const res = await fetch(`${BASE}/schedule/timezone`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getScheduleConfig() {
  const res = await fetch(`${BASE}/schedule/config`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function saveScheduleConfig(config) {
  const res = await fetch(`${BASE}/schedule/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getPendingPosts() {
  const res = await fetch(`${BASE}/schedule/pending`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function approvePost(id) {
  const res = await fetch(`${BASE}/schedule/pending/${id}/approve`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function rejectPost(id) {
  const res = await fetch(`${BASE}/schedule/pending/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getPostHistory() {
  const res = await fetch(`${BASE}/schedule/history`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getScheduleStatus() {
  const res = await fetch(`${BASE}/schedule/status`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
