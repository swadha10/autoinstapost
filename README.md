# AutoInstaPost

Pull photos from a Google Drive folder, generate an AI caption, then post to Instagram — automatically or on demand.

```
Google Drive folder → FastAPI backend → Gemini AI caption → Instagram Graph API
```

---

## Features

| Feature | Description |
|---|---|
| **Manual posting** | Pick photos from Drive, generate a caption, preview, and post |
| **Carousel support** | Select up to 10 photos for an Instagram carousel |
| **Auto-scheduler** | Set a time and cadence; the backend picks, captions, and posts automatically |
| **Approval queue** | Optional: review AI-drafted posts before they go live |
| **AI captions** | Google Gemini 2.5 Flash (free) with Claude Sonnet fallback |
| **EXIF date** | Date extracted from photo metadata, appended as `📅 15 February 2026` |
| **GPS location** | GPS coords reverse-geocoded to city/state; shown in UI and attached to the Instagram post as a location tag |
| **Location grouping** | Scheduler groups unposted photos by GPS location and posts same-location shots together |
| **Smart hashtags** | 5–8 hashtags mixing broad discovery tags with niche-specific ones |
| **History tab** | Full log of every post attempt (success/failure, manual/scheduled) |
| **Token auto-refresh** | Instagram long-lived token refreshed automatically before it expires |

---

## Stack

| Layer | Tech |
|---|---|
| Backend | Python 3.9+, FastAPI, Uvicorn, APScheduler |
| AI (primary) | Google Gemini 2.5 Flash (free) |
| AI (fallback) | Anthropic Claude Sonnet |
| Image processing | Pillow (EXIF extraction, compression, resize) |
| Frontend | React 18, Vite |
| APIs | Google Drive API v3, Instagram Graph API v21, Nominatim (reverse geocoding) |
| Tunnel | Cloudflare Tunnel (exposes local backend to Instagram's servers) |

---

## Setup

### 1. Clone & enter the repo
```bash
git clone https://github.com/swadha10/autoinstapost
cd autoinstapost
```

---

### 2. Get API credentials

#### A) Google Gemini (free — primary AI for captions)
1. Go to https://aistudio.google.com → **Get API key**
2. Copy the key (`AIza...`)

#### B) Anthropic Claude (optional fallback)
1. Go to https://console.anthropic.com → **API Keys** → Create key
2. Copy the key (`sk-ant-...`)
3. If `GEMINI_API_KEY` is set, Claude is never called

#### C) Google Drive (Service Account)
1. Go to https://console.cloud.google.com
2. Create a project → enable **Google Drive API**
3. **IAM & Admin → Service Accounts** → Create → Download JSON key
4. Save the JSON file as `backend/service_account.json`
5. Share your Drive folder with the service account email
   (looks like `xxx@project.iam.gserviceaccount.com`) — give it **Viewer** access

#### D) Instagram Graph API
1. Go to https://developers.facebook.com → Create App → **Business** type
2. Add **Instagram Graph API** product
3. Connect an Instagram **Professional** (Business or Creator) account to a Facebook Page
4. Under **Instagram Graph API → User Token Generator**, generate a User Token
5. Use the **Token Exchange** UI in the app (History tab → token status) to convert it to a 60-day long-lived token — the app auto-refreshes it before expiry

---

### 3. Configure environment
```bash
cd backend
cp .env.example .env
```

Fill in `.env`:
```
GEMINI_API_KEY=AIza...
ANTHROPIC_API_KEY=sk-ant-...   # optional
GOOGLE_SERVICE_ACCOUNT_FILE=service_account.json
INSTAGRAM_ACCESS_TOKEN=...
INSTAGRAM_ACCOUNT_ID=...
FACEBOOK_APP_ID=...
FACEBOOK_APP_SECRET=...
PUBLIC_BASE_URL=https://your-tunnel.trycloudflare.com
```

**`PUBLIC_BASE_URL`** must be a publicly reachable HTTPS URL — Instagram's servers need to download images from it. Use [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/):
```bash
cloudflared tunnel --url http://localhost:8000
# Copy the https://xxx.trycloudflare.com URL into PUBLIC_BASE_URL
```

---

### 4. Run the backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
# → API at http://localhost:8000
# → Swagger docs at http://localhost:8000/docs
```

**Auto-start on macOS login** (optional):
```bash
# Edit the plist to match your Python path, then:
cp com.autoinstapost.backend.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.autoinstapost.backend.plist
```

---

### 5. Run the frontend
```bash
cd frontend
npm install
npm run dev
# → UI at http://localhost:5173
```

---

## Usage

### Manual tab
1. Paste your Google Drive folder ID and click **Load Photos** (remembered across sessions)
2. Click photos to select (up to 10 for a carousel)
3. Choose a tone and click **Generate Caption Via AI**
4. The caption appears with `📅 date` and hashtags; detected GPS location shown as a `📍` chip
5. Edit the caption if needed, then click **Post to Instagram** in the preview panel

### Schedule tab
1. Enable scheduling and set a time + cadence
2. Set the Drive folder and tone
3. Choose **Auto-post** or **Queue for approval**
4. Save — the backend picks same-location photos automatically, generates a caption with Gemini, and posts (or queues) at the configured time

### History tab
- Full log of every post attempt with status, caption, source, and media ID
- Schedule Status card shows next run time and pre-flight checks
- **Run Now** button to trigger the scheduled job immediately for testing

---

## Project Structure
```
autoinstapost/
├── AGENTS.md                       # AI guardrails (caption rules, photo selection, hashtag strategy)
├── CHRONICLE.md                    # Chronological build log
├── backend/
│   ├── main.py                     # FastAPI app, CORS, APScheduler startup, static temp files
│   ├── routers/
│   │   ├── drive.py                # GET /drive/photos, GET /drive/photo/{id}/raw
│   │   ├── caption.py              # POST /caption/generate (returns caption + location_name)
│   │   ├── instagram.py            # POST /instagram/post, token exchange & status
│   │   └── schedule.py             # Schedule config, pending queue, history, run-now
│   ├── services/
│   │   ├── drive_service.py        # Google Drive API (list, full download, 128KB header download)
│   │   ├── claude_service.py       # Gemini 2.5 Flash caption generation + Claude fallback
│   │   ├── instagram_service.py    # Graph API: post, carousel, location search, token refresh
│   │   └── schedule_service.py     # Config/history persistence, EXIF extraction, location cache,
│   │                               #   image compression, scheduled job logic
│   ├── data/                       # Runtime JSON (config, history, posted IDs, location cache)
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── App.jsx                 # Manual tab UI (folder, photo grid, caption, preview)
    │   ├── components/
    │   │   ├── PhotoGrid.jsx       # Selectable photo grid with posted/fresh labels
    │   │   ├── CaptionEditor.jsx   # Tone selector + "Generate Caption Via AI" + textarea
    │   │   ├── PostPreview.jsx     # Instagram-style preview + post button
    │   │   ├── ScheduleTab.jsx     # Schedule settings + pending approvals panel
    │   │   └── HistoryTab.jsx      # Post history log + schedule status + Run Now
    │   └── api/client.js           # fetch wrappers for all endpoints
    ├── vite.config.js              # Dev proxy → backend
    └── index.html
```
