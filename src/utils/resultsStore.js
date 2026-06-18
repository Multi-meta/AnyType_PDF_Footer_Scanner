const fs = require("fs");
const path = require("path");

const resultsDir = path.join(__dirname, "../../results");

const headers = [
  "Scan Date",
  "Run ID",
  "Search Text",
  "Search Mode",
  "File Path",
  "File Name",
  "Total Pages",
  "Status",
  "Matched Pages",
  "Error",
];

const csvEscape = (value) => {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};

/**
 * Builds a clean ASCII-only slug from the search text.
 * Non-ASCII characters (e.g. Hindi/Devanagari) are dropped so the filename
 * stays readable in Explorer and doesn't end up as broken _प_रपत_ fragments.
 */
const createFileSlug = (value) => {
  const ascii = (value || "search")
    .replace(/[^\x00-\x7F]+/g, "")   // drop non-ASCII (Hindi etc.)
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")  // replace remaining special chars
    .replace(/^_+|_+$/g, "")          // trim leading/trailing underscores
    .slice(0, 40);

  return ascii || "search";
};

/**
 * Formats a Date into YYYY-MM-DD_HH-MM-SS for use in filenames.
 */
const formatDateForFilename = (date) => {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
  );
};

const createRunFileName = (searchText) => {
  const slug = createFileSlug(searchText);
  const timestamp = formatDateForFilename(new Date());
  // e.g. scan_results_Certificate_of_Completion_2026-06-17_16-39-25.csv
  //      scan_results_2026-06-17_16-39-25.csv  (when search text is Hindi-only)
  const middle = slug ? `${slug}_` : "";
  return `scan_results_${middle}${timestamp}.csv`;
};

const saveScanResults = (results, scanDate, runId, searchText, searchMode = "footer") => {
  fs.mkdirSync(resultsDir, { recursive: true });

  const fileName = createRunFileName(searchText);
  const filePath = path.join(resultsDir, fileName);
  const rows = [headers.map(csvEscape).join(",")];

  for (const result of results) {
    const status = result.error ? "Error" : result.found ? "Found" : "Not Found";
    const filePath = result.filename || "";
    const fileName = path.basename(filePath.replace(/\\/g, "/"));

    rows.push(
      [
        scanDate,
        runId,
        searchText,
        searchMode,
        filePath,
        fileName,
        result.total_pages,
        status,
        (result.matched_pages || []).join("; "),
        result.error || "",
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  // Write with UTF-8 BOM so Excel opens the file correctly
  // without garbling Hindi / Devanagari characters.
  const BOM = "\uFEFF";
  fs.writeFileSync(filePath, BOM + rows.join("\n") + "\n", "utf8");
  return {
    fileName,
    filePath,
    relativePath: `results/${fileName}`,
  };
};

const getResultsFile = (fileName) => {
  if (!fileName) {
    const files = fs
      .readdirSync(resultsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".csv"))
      .map((entry) => ({
        name: entry.name,
        modified: fs.statSync(path.join(resultsDir, entry.name)).mtimeMs,
      }))
      .sort((a, b) => b.modified - a.modified);

    return files.length ? path.join(resultsDir, files[0].name) : null;
  }

  const safeName = path.basename(fileName);
  const filePath = path.join(resultsDir, safeName);
  return fs.existsSync(filePath) ? filePath : null;
};

module.exports = {
  getResultsFile,
  saveScanResults,
};
