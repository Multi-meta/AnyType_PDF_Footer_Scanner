# 📄 PDF Footer Scanner

> Scan hundreds of PDFs for any text — in footer, header, body, or the entire document. Supports Hindi (हिन्दी) and English OCR.

---

## 🚀 Quick Start (Windows)

### Option A — One command (recommended)
```powershell
git clone https://github.com/YOUR_USERNAME/AnyType_PDF_Footer_Scanner.git
cd AnyType_PDF_Footer_Scanner
npm run setup:windows
npm start
```
Open **http://localhost:3000** in your browser.

### Option B — With auto-install of system tools
```powershell
npm run setup:windows:install
```
This also installs Tesseract, Poppler, and Python via **winget** if they are missing.

### Option C — PowerShell directly
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1
# or with tool installation:
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1 -InstallTools
```

---

## 🛠️ What the Setup Script Does

| Step | Action |
|------|--------|
| 1 | Checks Node.js (≥16) |
| 2 | Checks Python 3.8+ and installs `pypdf`, `Pillow` |
| 3 | Checks Poppler (`pdfinfo`, `pdftoppm`, `pdftotext`) |
| 4 | Checks Tesseract OCR with Hindi language data |
| 5 | Runs `npm install` |
| 6 | Creates `.env` from `.env.example` |
| 7 | Creates `uploads/`, `results/`, `uploads/ocr-temp/` directories |

---

## 📋 Prerequisites (Manual Install)

If you prefer installing tools yourself:

| Tool | Required | Download |
|------|----------|----------|
| **Node.js 16+** | ✅ Yes | https://nodejs.org/ |
| **Python 3.8+** | ✅ Yes | https://www.python.org/downloads/ |
| **pypdf + Pillow** | ✅ Yes | `pip install pypdf Pillow` |
| **Poppler** | ⚠️ Recommended | https://github.com/oschwartz10612/poppler-windows/releases/ |
| **Tesseract OCR** | ⚠️ Recommended | https://github.com/UB-Mannheim/tesseract/wiki |
| **Tesseract hin data** | For Hindi | https://github.com/tesseract-ocr/tessdata/raw/main/hin.traineddata |

> **Note:** Poppler and Tesseract must be added to your system **PATH**. The app falls back to pdf2pic/tesseract.js if they are missing (slower, English only).

---

## 📁 Project Structure

```
AnyType_PDF_Footer_Scanner/
├── scripts/
│   ├── setup-windows.ps1       ← Windows one-click installer
│   └── build-frontend-config.js← Injects production API URL
├── src/
│   ├── middleware/
│   │   └── upload.js           ← Multer file upload config
│   ├── routes/
│   │   ├── scan.js             ← POST /api/scan handler
│   │   └── health.js           ← GET /api/health handler
│   └── utils/
│       ├── scanner.js          ← Core PDF scanning logic
│       ├── extract_last_page_image.py ← Python PDF → image extractor
│       └── resultsStore.js     ← CSV results writer
├── public/                     ← Frontend (deployed to Vercel)
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── config.js           ← API URL config (generated)
│       └── app.js              ← Frontend logic
├── .env.example                ← Environment variables template
├── Dockerfile                  ← Production Docker image (for Render)
├── render.yaml                 ← Render deployment config
├── vercel.json                 ← Vercel deployment config
├── requirements.txt            ← Python dependencies
└── package.json
```

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env` and configure:

```env
PORT=3000
FRONTEND_URL=http://localhost:3000
PDF_FOOTER_SCANNER_PYTHON=
```

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Port for the Express server |
| `FRONTEND_URL` | `http://localhost:3000` | Allowed CORS origin (set to your Vercel URL in production) |
| `PDF_FOOTER_SCANNER_PYTHON` | _(auto-detect)_ | Path to Python 3 executable |

---

## 🌐 Deployment

This project is split for deployment:
- **Frontend** (static HTML/CSS/JS in `public/`) → **Vercel**
- **Backend** (Node.js API + Python OCR) → **Render** (Docker)

### Step 1 — Deploy Backend to Render

1. Push your code to GitHub
2. Go to [render.com](https://render.com) → **New → Web Service**
3. Connect your GitHub repo
4. Render detects `render.yaml` and `Dockerfile` automatically
5. Click **Deploy**
6. After deployment, copy your service URL: `https://YOUR-APP.onrender.com`
7. In Render dashboard → **Environment** → Set `FRONTEND_URL` to your Vercel URL (after Step 2)

### Step 2 — Set the API URL in the Frontend

After you have your Render URL, run:
```bash
RENDER_URL=https://YOUR-APP.onrender.com node scripts/build-frontend-config.js
```
This updates `public/js/config.js` with your Render URL. Commit and push this change.

### Step 3 — Deploy Frontend to Vercel

1. Go to [vercel.com](https://vercel.com) → **New Project**
2. Import your GitHub repo
3. Vercel detects `vercel.json` automatically — it serves only the `public/` folder
4. Click **Deploy**
5. Copy your Vercel URL: `https://YOUR-APP.vercel.app`
6. Back in Render: set `FRONTEND_URL` = `https://YOUR-APP.vercel.app`

### Step 4 — Final Check

Visit your Vercel URL → upload a PDF → click Scan. The frontend calls your Render backend.

---

## 🔍 Usage

1. Open the app in your browser
2. Enter the text to search for (English or Hindi हिन्दी)
3. Choose the search zone:
   - **Footer** — last page, bottom 2 inches
   - **Header** — first page, top 5 inches
   - **Content** — all pages, body area
   - **Entire PDF** — all pages, full text
4. Drag-drop PDFs or select a folder
5. Click **🔍 Scan PDFs**
6. Download the CSV results

---

## 🐛 Troubleshooting

**`pdftotext: command not found`**
→ Install Poppler and add `bin\` to PATH. See Prerequisites table.

**OCR misses Hindi text**
→ Ensure `tesseract-ocr-hin` / `hin.traineddata` is installed.

**Port 3000 already in use**
→ Set `PORT=3001` in your `.env` file.

**Python packages missing**
→ Run: `pip install pypdf Pillow`

**Render app sleeps (free tier)**
→ Upgrade to Render's paid tier or use a keep-alive service. The free tier sleeps after 15 minutes of inactivity.

---

## 📄 License

MIT — see [LICENSE](LICENSE)

---

Built with ❤️ using Node.js, Express, Python, Tesseract OCR & Poppler
