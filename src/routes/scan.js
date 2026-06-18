const path = require("path");
const fs = require("fs");
const { scanPDF } = require("../utils/scanner");
const { saveScanResults } = require("../utils/resultsStore");

const handleScan = async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: "No PDF files uploaded" });
  }

  const uploadedFiles = req.files.map((file) => file.path);
  const submittedPaths = Array.isArray(req.body.pdfPaths)
    ? req.body.pdfPaths
    : req.body.pdfPaths
      ? [req.body.pdfPaths]
      : [];
  const targetText = (req.body.targetText || "").trim();
  if (!targetText) {
    return res.status(400).json({ error: "Please enter the text you want to search for." });
  }

  const VALID_MODES = ["footer", "header", "content", "entire"];
  const searchMode = VALID_MODES.includes(req.body.searchMode)
    ? req.body.searchMode
    : "footer";

  const results = [];
  const scanDate = new Date().toLocaleString();
  const runId = new Date().toISOString().replace(/[:.]/g, "-");

  try {
    for (let i = 0; i < uploadedFiles.length; i++) {
      const result = await scanPDF(
        uploadedFiles[i],
        (submittedPaths[i] || req.files[i].originalname).replace(/\\/g, "/"),
        i,
        targetText,
        searchMode,
      );
      results.push(result);
    }

    const saved = saveScanResults(results, scanDate, runId, targetText, searchMode);

    res.json({
      success: true,
      scanned: uploadedFiles.length,
      results: results,
      timestamp: scanDate,
      savedTo: saved.relativePath,
      savedFileName: saved.fileName,
    });

    setTimeout(() => {
      uploadedFiles.forEach((file) => {
        fs.unlink(file, (err) => {
          if (err) console.error("Failed to delete:", file);
        });
      });
    }, 1000);
  } catch (error) {
    res.status(500).json({ error: "Scanning failed" });
  }
};

module.exports = { handleScan };
