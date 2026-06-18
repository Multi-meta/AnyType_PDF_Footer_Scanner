const { execFile } = require("child_process");
const path = require("path");
const fs = require("fs");
const { fromPath } = require("pdf2pic");
const Tesseract = require("tesseract.js");

// ── Constants ────────────────────────────────────────────────────────────────

const TEMP_ROOT = path.join(__dirname, "../../uploads/ocr-temp");
const EXTRACT_IMAGE_SCRIPT = path.join(__dirname, "extract_last_page_image.py");
// Bundled Python path (Windows Codex environment — skipped if it doesn't exist)
const BUNDLED_PYTHON = process.env.PDF_FOOTER_SCANNER_PYTHON || null;

// Valid search modes
const VALID_MODES = ["footer", "header", "content", "entire"];

// ── Generic process helpers ──────────────────────────────────────────────────

const runCommand = (command, args, options = {}) => {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        maxBuffer: 50 * 1024 * 1024,
        timeout: options.timeout || 60000,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`${error.message}\n${stderr || ""}`.trim()));
          return;
        }
        resolve(stdout);
      },
    );
  });
};

const runCommandIfAvailable = async (command, args, options = {}) => {
  try {
    return await runCommand(command, args, options);
  } catch (error) {
    if (/ENOENT/i.test(error.message)) return null;
    throw error;
  }
};

// ── Fuzzy matching ───────────────────────────────────────────────────────────

const LevenshteinDistance = (s, t) => {
  const n = s.length;
  const m = t.length;
  const d = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));

  if (n === 0) return m;
  if (m === 0) return n;

  for (let i = 0; i <= n; i++) d[i][0] = i;
  for (let j = 0; j <= m; j++) d[0][j] = j;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = t[j - 1] === s[i - 1] ? 0 : 1;
      d[i][j] = Math.min(
        Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1),
        d[i - 1][j - 1] + cost,
      );
    }
  }
  return d[n][m];
};

const HasFuzzyMatch = (text, token, maxDistance) => {
  if (text.length < token.length) return false;

  for (let i = 0; i <= text.length - token.length; i++) {
    const sub = text.substring(i, i + token.length);
    if (LevenshteinDistance(sub, token) <= maxDistance) return true;
  }

  if (token.length > 3) {
    for (let i = 0; i <= text.length - (token.length - 1); i++) {
      const sub = text.substring(i, i + token.length - 1);
      if (LevenshteinDistance(sub, token) <= maxDistance) return true;
    }
    for (let i = 0; i <= text.length - (token.length + 1); i++) {
      const sub = text.substring(i, i + token.length + 1);
      if (LevenshteinDistance(sub, token) <= maxDistance) return true;
    }
  }

  return false;
};

const normalizeForMatch = (value) =>
  (value || "")
    .normalize("NFC")
    .replace(/[|।,.;:'"`~_()[\]{}<>-]/g, "")
    .replace(/\s+/g, "")
    .trim();

const getSearchTokens = (targetText) =>
  (targetText || "")
    .split(/[\s|,.;:'"`~_()[\]{}<>-]+/u)
    .map(normalizeForMatch)
    .filter((token) => token.length >= 2);

/**
 * Returns true if footerText contains all tokens of targetText.
 * Numeric tokens (year, number) require an exact match; text tokens allow
 * small Levenshtein tolerance for OCR noise.
 */
const footerContainsSearchText = (footerText, targetText) => {
  const normalizedFooter = normalizeForMatch(footerText);
  const normalizedTarget = normalizeForMatch(targetText);

  if (!normalizedFooter || !normalizedTarget) return false;

  // Fast path: exact normalized match
  if (normalizedFooter.includes(normalizedTarget)) return true;

  // Token-level matching – ALL tokens must match
  const tokens = getSearchTokens(targetText);
  if (tokens.length === 0) return false;

  for (const token of tokens) {
    const isNumeric = /^\d+$/.test(token);
    if (isNumeric) {
      // Numbers/years must appear verbatim
      if (!normalizedFooter.includes(token)) return false;
    } else {
      const maxDistance = token.length <= 4 ? 1 : 2;
      const found =
        normalizedFooter.includes(token) ||
        HasFuzzyMatch(normalizedFooter, token, maxDistance);
      if (!found) return false;
    }
  }

  return true; // all tokens matched
};

// ── Zone text selection (for text-based PDFs rendered by OCR) ────────────────

/**
 * Given the full OCR/extracted text of a page and the active search mode,
 * return only the portion of text that belongs to that zone.
 *
 * footer  → last 10 non-empty lines
 * header  → first 15 non-empty lines
 * content → middle lines (skip first 5 + last 5 non-empty lines)
 * entire  → everything
 */
const getZoneText = (pageText, mode) => {
  const lines = (pageText || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  switch (mode) {
    case "header":
      return lines.slice(0, 15).join(" ");
    case "content": {
      const skip = Math.min(5, Math.floor(lines.length / 5));
      return lines.slice(skip, Math.max(skip + 1, lines.length - skip)).join(" ");
    }
    case "entire":
      return lines.join(" ");
    case "footer":
    default:
      return lines.slice(-10).join(" ");
  }
};

// ── PDF info ─────────────────────────────────────────────────────────────────

const getPDFPageCount = async (filePath) => {
  try {
    const output = await runCommand("pdfinfo", [filePath]);
    const match = output.match(/Pages:\s+(\d+)/i);
    if (match) return Number.parseInt(match[1], 10);
  } catch (error) {
    console.log(`  Could not read page count with pdfinfo: ${error.message}`);
  }
  return null;
};

// ── Python extraction ─────────────────────────────────────────────────────────

const getPythonCandidates = () => {
  const candidates = [];

  // If PDF_FOOTER_SCANNER_PYTHON is set via env var, use it first.
  if (BUNDLED_PYTHON) {
    candidates.push({ command: BUNDLED_PYTHON, prefixArgs: [] });
  }

  // Standard system Python commands (cross-platform)
  candidates.push({ command: "python3", prefixArgs: [] }); // Linux / Docker / macOS
  candidates.push({ command: "python", prefixArgs: [] });  // Windows / Conda
  candidates.push({ command: "py", prefixArgs: ["-3"] });  // Windows Python launcher

  return candidates;
};

/**
 * Calls the Python script with the given mode.
 * Returns the parsed JSON object or null on failure.
 */
const extractPagesWithPython = async (filePath, tempDir, mode) => {
  let lastError = null;

  for (const candidate of getPythonCandidates()) {
    try {
      const stdout = await runCommandIfAvailable(
        candidate.command,
        [...candidate.prefixArgs, EXTRACT_IMAGE_SCRIPT, filePath, tempDir, mode],
        { timeout: 120000 },
      );

      if (!stdout) continue;
      return JSON.parse(stdout);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    console.log(`  Python extraction failed: ${lastError.message}`);
  }
  return null;
};

// ── Page rendering (pdftoppm / pdf2pic fallback) ──────────────────────────────

const ensureTempDir = () => {
  const tempDir = path.join(
    TEMP_ROOT,
    `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
  );
  fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
};

/**
 * Renders a single page with pdftoppm and returns the PNG path.
 * Renders at 200 DPI (sufficient for OCR and faster than 300 DPI for multi-page).
 */
const renderPageWithPdfToPpm = async (filePath, pageNum, tempDir) => {
  const prefix = path.join(tempDir, `render-p${pageNum}`);
  await runCommand(
    "pdftoppm",
    ["-r", "200", "-f", String(pageNum), "-l", String(pageNum), "-png", filePath, prefix],
    { timeout: 120000 },
  );

  const pngFiles = fs
    .readdirSync(tempDir)
    .filter((f) => f.startsWith(`render-p${pageNum}`) && f.endsWith(".png"))
    .sort();

  if (pngFiles.length === 0) {
    throw new Error(`pdftoppm did not render page ${pageNum}`);
  }
  return path.join(tempDir, pngFiles[pngFiles.length - 1]);
};

/**
 * Renders a single page with pdf2pic (fallback when pdftoppm is unavailable).
 * Only suitable for single-page modes (footer/header).
 */
const renderPageWithPdf2Pic = async (filePath, pageNum, tempDir) => {
  const converter = fromPath(filePath, {
    density: 200,
    saveFilename: `render-p${pageNum}`,
    savePath: tempDir,
    format: "png",
    width: 2480,
    height: 3508,
  });

  const page = await converter(pageNum, { responseType: "image" });
  if (!page || !page.path) throw new Error("pdf2pic did not create a page image");
  return page.path;
};

/**
 * Render a page, trying pdftoppm then pdf2pic as fallback.
 */
const renderPage = async (filePath, pageNum, tempDir) => {
  try {
    return await renderPageWithPdfToPpm(filePath, pageNum, tempDir);
  } catch (pdftoppmErr) {
    console.log(`  pdftoppm failed for page ${pageNum}: ${pdftoppmErr.message}`);
    console.log("  Trying pdf2pic fallback...");
    return await renderPageWithPdf2Pic(filePath, pageNum, tempDir);
  }
};

// ── OCR ──────────────────────────────────────────────────────────────────────

const ocrImageWithNativeTesseract = async (imagePath) => {
  const psmModes = ["6", "11", "12"];
  const parts = [];

  for (const psm of psmModes) {
    try {
      const text = await runCommandIfAvailable(
        "tesseract",
        [imagePath, "stdout", "-l", "hin+eng", "--psm", psm],
        { timeout: 120000 },
      );
      if (text && text.trim()) parts.push(text);
    } catch (error) {
      console.log(`  Native Tesseract OCR failed for PSM ${psm}: ${error.message}`);
    }
  }

  return parts.join("\n");
};

const ocrImage = async (imagePath) => {
  const nativeText = await ocrImageWithNativeTesseract(imagePath);
  if (nativeText.trim()) return nativeText;

  try {
    console.log("  Trying tesseract.js OCR fallback...");
    const result = await Tesseract.recognize(imagePath, "hin+eng", {
      logger: (message) => {
        if (message.status === "recognizing text") {
          console.log(`    OCR: ${Math.round(message.progress * 100)}%`);
        }
      },
    });
    return result.data.text || "";
  } catch (error) {
    console.log(`  tesseract.js OCR failed: ${error.message}`);
    return "";
  }
};

// ── scanPDF ──────────────────────────────────────────────────────────────────

/**
 * Scan a single PDF for targetText within the zone specified by searchMode.
 *
 * searchMode:
 *   "footer"  – last page, bottom 2 inches
 *   "header"  – first page, top 5 inches
 *   "content" – all pages, middle section
 *   "entire"  – all pages, full content
 */
const scanPDF = async (filePath, originalName, index, targetText, searchMode = "footer") => {
  const mode = VALID_MODES.includes(searchMode) ? searchMode : "footer";

  const result = {
    index: index + 1,
    filename: originalName,
    searchMode: mode,
    found: false,
    total_pages: 0,
    matched_pages: [],
    error: null,
  };

  let tempDir = null;

  try {
    console.log(`\n[${index + 1}] Scanning: ${originalName}`);
    console.log(`  Mode: ${mode} | Searching for: ${targetText}`);

    tempDir = ensureTempDir();

    // ── Step 1: Ask Python to extract pages + zone crops ─────────────────
    const extracted = await extractPagesWithPython(filePath, tempDir, mode);

    // Page count from Python or fallback pdfinfo
    const pageCount =
      extracted?.page_count || (await getPDFPageCount(filePath));

    if (!pageCount) {
      result.error =
        "Could not determine PDF page count. Install Python pypdf or Poppler/pdfinfo.";
      console.log(`  ${result.error}`);
      return result;
    }

    result.total_pages = pageCount;

    // Decide which page numbers to process if Python failed entirely
    const pageResultsFromPython = extracted?.pages || [];

    if (pageResultsFromPython.length === 0) {
      // Python failed – fall back to pdftoppm rendering for all target pages
      console.log("  Python extraction unavailable, using pdftoppm fallback...");
      const targetPages =
        mode === "header"
          ? [1]
          : mode === "footer"
          ? [pageCount]
          : Array.from({ length: pageCount }, (_, i) => i + 1);

      for (const pageNum of targetPages) {
        try {
          console.log(`  Rendering page ${pageNum} with pdftoppm...`);
          const imgPath = await renderPage(filePath, pageNum, tempDir);
          const ocrText = await ocrImage(imgPath);
          const zoneText = getZoneText(ocrText, mode);
          console.log(`  [p${pageNum}] zone text: "${zoneText.substring(0, 120)}"`);
          if (footerContainsSearchText(zoneText, targetText)) {
            result.found = true;
            result.matched_pages.push(pageNum);
            console.log(`  ✅ Match found on page ${pageNum}`);
          }
        } catch (err) {
          console.log(`  Page ${pageNum} render/OCR failed: ${err.message}`);
        }
      }

      return result;
    }

    // ── Step 2: Process each page returned by Python ──────────────────────
    for (const pageEntry of pageResultsFromPython) {
      const { page: pageNum, type } = pageEntry;
      let zoneText = "";

      if (type === "text") {
        // Python already selected the correct zone lines
        zoneText = pageEntry.text || "";
        console.log(`  [p${pageNum}] text zone: "${zoneText.substring(0, 120)}"`);

      } else if (type === "image") {
        if (pageEntry.zone_path) {
          // OCR the pre-cropped zone image
          console.log(
            `  [p${pageNum}] OCR-ing zone crop (${pageEntry.image_name || "image"})...`,
          );
          zoneText = await ocrImage(pageEntry.zone_path);

          // For footer/header, if zone crop didn't match, try the full raw image too
          if (
            !footerContainsSearchText(zoneText, targetText) &&
            pageEntry.raw_path &&
            (mode === "footer" || mode === "header")
          ) {
            console.log("  Zone crop missed, checking full raw page image...");
            const fullText = await ocrImage(pageEntry.raw_path);
            zoneText += "\n" + getZoneText(fullText, mode);
          }
        } else {
          // No embedded image captured – try pdftoppm for this page
          try {
            console.log(`  [p${pageNum}] No embedded image, using pdftoppm...`);
            const imgPath = await renderPage(filePath, pageNum, tempDir);
            const ocrText = await ocrImage(imgPath);
            zoneText = getZoneText(ocrText, mode);
          } catch (err) {
            console.log(`  Page ${pageNum} pdftoppm fallback failed: ${err.message}`);
          }
        }
        console.log(`  [p${pageNum}] OCR zone text: "${zoneText.substring(0, 120)}"`);
      }

      if (zoneText && footerContainsSearchText(zoneText, targetText)) {
        result.found = true;
        result.matched_pages.push(pageNum);
        console.log(`  ✅ Match found on page ${pageNum}`);
        // For footer/header we only need one page – short-circuit
        if (mode === "footer" || mode === "header") break;
      }
    }

    if (!result.found) {
      console.log("  ❌ Target text not found in the scanned zone(s)");
    }

  } catch (error) {
    result.error = "Processing failed: " + error.message;
    console.log(`  Error: ${result.error}`);
  } finally {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  return result;
};

module.exports = { scanPDF };
