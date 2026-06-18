# PDF Zone Scanner

A web-based tool to scan large batches of PDF files for specific text — in the footer, header, body content, or the full document. Built to handle both scanned (image-based) and text-based PDFs, with OCR support for Hindi and English.

**Live Demo (Frontend):** https://smart-pdf-zone-scanner.vercel.app  
**Backend API:** https://smart-pdf-zone-scanner.onrender.com/api/health  
**GitHub:** https://github.com/Multi-meta/Smart_PDF_Zone_Scanner

---

## ⚠️ Note on Deployed Version Speed

You can click the Live Demo link above and use it directly — it works completely.

However, please be aware that the backend is hosted on **Render's free tier**, which provides only **0.1 vCPU** (shared CPU). Because of this:

- The app may take **30–60 seconds to wake up** if it hasn't been used recently (Render puts free services to sleep after 15 minutes of inactivity)
- Scanning PDFs that are image-based (scanned documents) will be **slower than normal** since OCR processing is CPU-intensive and the free plan has very limited compute
- Text-based PDFs (with selectable text) are significantly faster

**In short — it will run and give you correct results, it just takes more time than it would on a paid server.**

---

## 🚀 Want Faster Performance? Run It Locally

Clone the project from GitHub and run it on your own machine — it will be much faster since it uses your full CPU.

```powershell
git clone https://github.com/Multi-meta/Smart_PDF_Zone_Scanner.git
cd Smart_PDF_Zone_Scanner
```

Then run these commands one by one in your terminal:

```powershell
npm run setup:windows
```

If you also need Tesseract, Poppler, and Python installed automatically:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1 -InstallTools
```

Then start the app:

```powershell
npm start
```

Open `http://localhost:3000` in your browser — done.

> The `requirements.txt` file is already included. The setup script handles Python packages, folder creation, and environment setup automatically.

---

## What it does

- Upload hundreds of PDFs at once (or an entire folder)
- Search for any text string in a specific zone: footer, header, content area, or the entire document
- Handles both text-based PDFs and scanned/image-based PDFs via OCR
- Supports Hindi (Devanagari) and English text recognition
- Exports results as a CSV file for further analysis

---




## What the setup script does

1. Checks for Node.js (v16+)
2. Checks for Python 3.8+ and installs `pypdf` and `Pillow`
3. Checks for Poppler utilities (`pdfinfo`, `pdftoppm`, `pdftotext`)
4. Checks for Tesseract OCR with Hindi language data
5. Runs `npm install`
6. Creates `.env` from `.env.example`
7. Creates the required `uploads/`, `results/`, and `uploads/ocr-temp/` directories

---

## Prerequisites

If you prefer to install tools manually:

| Tool | Required | Where to get it |
|------|----------|-----------------|
| Node.js 16+ | Yes | https://nodejs.org/ |
| Python 3.8+ | Yes | https://www.python.org/downloads/ |
| pypdf + Pillow | Yes | `pip install pypdf Pillow` |
| Poppler | Recommended | https://github.com/oschwartz10612/poppler-windows/releases/ |
| Tesseract OCR | Recommended | https://github.com/UB-Mannheim/tesseract/wiki |
| Tesseract Hindi data | For Hindi OCR | https://github.com/tesseract-ocr/tessdata/raw/main/hin.traineddata |

> Poppler and Tesseract need to be added to your system PATH after installation.
> The app falls back to `pdf2pic` and `tesseract.js` if they are not found, but performance will be slower and Hindi OCR will not be available.

---

## Project Structure

```
Smart_PDF_Zone_Scanner/
├── scripts/
│   ├── setup-windows.ps1          Windows one-click installer
│   └── build-frontend-config.js   Injects the Render API URL for production builds
├── src/
│   ├── middleware/
│   │   └── upload.js              Multer file upload configuration
│   ├── routes/
│   │   ├── scan.js                POST /api/scan handler
│   │   └── health.js              GET /api/health handler
│   └── utils/
│       ├── scanner.js             Core PDF scanning and OCR logic
│       ├── extract_last_page_image.py   Python script for PDF-to-image extraction
│       └── resultsStore.js        Writes scan results to CSV
├── public/                        Frontend — deployed separately to Vercel
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── config.js              API base URL (local vs production)
│       └── app.js                 Frontend logic
├── .env.example                   Environment variable template
├── Dockerfile                     Production Docker image for Render
├── render.yaml                    Render deployment configuration
├── vercel.json                    Vercel deployment configuration
├── requirements.txt               Python dependencies
└── package.json
```

---

## Environment Variables

Copy `.env.example` to `.env` before running locally:

```env
PORT=3000
FRONTEND_URL=http://localhost:3000
PDF_FOOTER_SCANNER_PYTHON=
```

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Port the Express server listens on |
| `FRONTEND_URL` | `http://localhost:3000` | CORS allowed origin — set to your Vercel URL in production |
| `PDF_FOOTER_SCANNER_PYTHON` | auto-detect | Full path to the Python 3 executable if auto-detection fails |

---

## Deployment

The project is split across two platforms:

- **Frontend** — static files in `public/` → deployed to Vercel
- **Backend** — Node.js API + Python OCR → deployed to Render via Docker

### 1. Deploy the backend to Render

1. Push the code to GitHub
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your GitHub repository
4. Render will detect the `Dockerfile` automatically — select Docker as the runtime
5. Click Deploy and wait for the build to finish (first build takes 5–10 minutes)
6. Copy your service URL: `https://your-app.onrender.com`

### 2. Set the API URL for the frontend

Once you have your Render URL, run:

```powershell
$env:RENDER_URL="https://your-app.onrender.com"
node scripts/build-frontend-config.js
```

This updates `public/js/config.js` with the production backend URL. Commit and push the change.

### 3. Deploy the frontend to Vercel

1. Go to [vercel.com](https://vercel.com) → New Project → Import your GitHub repo
2. Set the **Output Directory** to `public`
3. Leave the build command blank (static site — no build step needed)
4. Set Framework Preset to **Other**
5. Click Deploy
6. Copy your Vercel URL: `https://your-app.vercel.app`

### 4. Connect frontend and backend

In the Render dashboard, go to Environment and set:

```
FRONTEND_URL = https://your-app.vercel.app
```

Save — Render will redeploy automatically. Your frontend and backend are now connected.

---

## Usage

1. Open the app in your browser
2. Type the text you want to search for (English or Hindi)
3. Select the search zone — Footer, Header, Content, or Entire PDF
4. Upload PDF files or select a folder
5. Click Scan PDFs
6. Download the CSV results when the scan finishes

---

## Troubleshooting

**`pdftotext: command not found`**  
Install Poppler and add its `bin\` folder to your system PATH.

**OCR not picking up Hindi text**  
Make sure `hin.traineddata` is placed in your Tesseract `tessdata` directory.

**Port 3000 already in use**  
Set `PORT=3001` in your `.env` file.

**Python packages not found**  
Run `pip install pypdf Pillow` manually.

**App is slow to respond on Render (free tier)**  
The free tier sleeps after 15 minutes of inactivity. The first request after a sleep takes around 30 seconds to wake up. Upgrade to a paid plan for always-on availability.

---

## License

MIT — see [LICENSE](LICENSE)

---

Built by **Utkarsh Yuvraj** — [utkarshyuvraj16@gmail.com](mailto:utkarshyuvraj16@gmail.com)
