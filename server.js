// ─── Load environment variables ────────────────────────────────────────────
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");

const uploadMiddleware = require("./src/middleware/upload");
const scanRoutes = require("./src/routes/scan");
const healthRoutes = require("./src/routes/health");
const { getResultsFile } = require("./src/utils/resultsStore");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── CORS ─────────────────────────────────────────────────────────────────────
// In production the frontend lives on Vercel (different origin), so we must
// explicitly allow that origin. In local dev FRONTEND_URL = http://localhost:3000.
const FRONTEND_URL = process.env.FRONTEND_URL || "";

const corsOptions = FRONTEND_URL
  ? {
      origin: [
        FRONTEND_URL,
        // Always allow localhost for local dev even in production .env
        "http://localhost:3000",
        "http://127.0.0.1:3000",
      ],
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }
  : {}; // No origin restriction when FRONTEND_URL is not set (local fallback)

app.use(cors(corsOptions));
app.use(bodyParser.json({ limit: "10mb" }));

// ─── Static files (local dev only — Vercel serves these in production) ────────
app.use(express.static("public"));

// ─── Routes ──────────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.post(
  "/api/scan",
  uploadMiddleware.upload.array("pdfs", 1000),
  scanRoutes.handleScan,
);

app.get("/api/health", healthRoutes.checkHealth);

app.get("/api/results/download", (req, res) => {
  const fileName = req.query.file || null;
  const filePath = getResultsFile(fileName);
  if (!filePath) {
    return res.status(404).json({ error: "No saved results found yet" });
  }
  const downloadName = require("path").basename(filePath);
  res.download(filePath, downloadName, (err) => {
    if (err && !res.headersSent) {
      res.status(500).json({ error: "Download failed" });
    }
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(
    `\n🚀 PDF Footer Scanner running at http://localhost:${PORT}`,
  );
  if (FRONTEND_URL) {
    console.log(`🌐 CORS allowed origin: ${FRONTEND_URL}`);
  }
  console.log(`📝 Upload PDFs and scan for footer text\n`);
});
