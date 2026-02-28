# AutoInstaPost

Pull photos from a Google Drive folder, generate an AI caption with Claude, then post to Instagram — all from one simple web UI.

```
Google Drive folder → FastAPI backend → Claude AI caption → Instagram Graph API
```

---

## Stack
| Layer | Tech |
|---|---|
| Backend | Python 3.11+, FastAPI, Uvicorn |
| AI | Anthropic Claude (vision) |
| Frontend | React 18, Vite |
| APIs | Google Drive API v3, Instagram Graph API v21 |

---

## Setup

### 1. Clone & enter the repo
```bash
git clone https://github.com/swadha10/autoinstapost
cd autoinstapost
```

---

### 2. Get API credentials

#### A) Anthropic (Claude)
1. Go to https://console.anthropic.com → **API Keys** → Create key
2. Copy the key (`sk-ant-...`)

#### B) Google Drive (Service Account)
1. Go to https://console.cloud.google.com
2. Create a project → enable **Google Drive API**
3. **IAM & Admin → Service Accounts** → Create → Download JSON key
4. Save the JSON file as `backend/service_account.json`
5. Share your Drive folder with the service account email
   (looks like `xxx@project.iam.gserviceaccount.com`) — give it **Viewer** access

#### C) Instagram Graph API
1. Go to https://developers.facebook.com → Create App → **Business** type
2. Add **Instagram Graph API** product
3. Connect an Instagram **Professional** (Business or Creator) account to a Facebook Page
4. Under **Instagram Graph API → User Token Generator**, generate a User Token
5. Exchange it for a **long-lived token** (60-day):
   ```
   GET https://graph.facebook.com/v21.0/oauth/access_token
     ?grant_type=fb_exchange_token
     &client_id=YOUR_APP_ID
     &client_secret=YOUR_APP_SECRET
     &fb_exchange_token=SHORT_LIVED_TOKEN
   ```
6. Get your **Instagram Business Account ID**:
   ```
   GET https://graph.facebook.com/v21.0/me/accounts?access_token=YOUR_TOKEN
   # then:
   GET https://graph.facebook.com/v21.0/PAGE_ID?fields=instagram_business_account&access_token=YOUR_TOKEN
   ```

---

### 3. Configure environment
```bash
cd backend
cp .env.example .env
# Fill in ANTHROPIC_API_KEY, INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_ACCOUNT_ID
```

For **local development**, Instagram needs a publicly reachable image URL.
Use [ngrok](https://ngrok.com):
```bash
# In a separate terminal:
ngrok http 8000
# Copy the https URL (e.g. https://abc123.ngrok.io) and set:
# PUBLIC_BASE_URL=https://abc123.ngrok.io in your .env
```

---

### 4. Run the backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
# → API running at http://localhost:8000
# → Swagger docs at http://localhost:8000/docs
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

1. Open http://localhost:5173
2. **Paste your Google Drive folder ID** (from the folder's URL) and click **Load Photos**
3. **Click a photo** to select it
4. Choose a **tone** and click **Generate with Claude AI** — edit the caption if needed
5. Click **Post to Instagram** in the preview panel

---

## Project Structure
```
autoinstapost/
├── backend/
│   ├── main.py                   # FastAPI app + CORS + static temp files
│   ├── routers/
│   │   ├── drive.py              # GET /drive/photos, GET /drive/photo/{id}/raw
│   │   ├── caption.py            # POST /caption/generate
│   │   └── instagram.py          # POST /instagram/post
│   ├── services/
│   │   ├── drive_service.py      # Google Drive API client
│   │   ├── claude_service.py     # Anthropic vision caption generation
│   │   └── instagram_service.py  # Instagram Graph API poster
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── App.jsx               # Main 4-step UI
    │   ├── components/
    │   │   ├── PhotoGrid.jsx     # Selectable photo grid
    │   │   ├── CaptionEditor.jsx # Tone selector + textarea
    │   │   └── PostPreview.jsx   # Instagram-style preview + post button
    │   └── api/client.js         # fetch wrappers for all endpoints
    ├── vite.config.js            # Dev proxy → backend
    └── index.html
```
