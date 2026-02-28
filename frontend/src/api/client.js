const BASE = "";  // proxied by Vite in dev

export async function fetchPhotos(folderId) {
  const res = await fetch(`${BASE}/drive/photos?folder_id=${encodeURIComponent(folderId)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function photoRawUrl(fileId) {
  return `${BASE}/drive/photo/${fileId}/raw`;
}

export async function generateCaption(fileId, tone = "engaging") {
  const res = await fetch(`${BASE}/caption/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId, tone }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function postToInstagram(fileId, caption) {
  const res = await fetch(`${BASE}/instagram/post`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId, caption }),
  });
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
