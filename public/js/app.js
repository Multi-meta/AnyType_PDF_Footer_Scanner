let selectedFiles = [];

const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const folderInput = document.getElementById("folderInput");
const chooseFilesBtn = document.getElementById("chooseFilesBtn");
const chooseFolderBtn = document.getElementById("chooseFolderBtn");
const selectedFilesDiv = document.getElementById("selectedFiles");
const selectionSummary = document.getElementById("selectionSummary");
const fileList = document.getElementById("fileList");
const scanBtn = document.getElementById("scanBtn");
const clearBtn = document.getElementById("clearBtn");
const loading = document.getElementById("loading");
const resultsSection = document.getElementById("resultsSection");
const errorMessage = document.getElementById("errorMessage");
const targetTextInput = document.getElementById("targetTextInput");

const getSelectedMode = () => {
  const checked = document.querySelector('input[name="searchMode"]:checked');
  return checked ? checked.value : "footer";
};

const MODE_LABELS = {
  footer:  "Footer (last page · bottom 2 in)",
  header:  "Header (first page · top 5 in)",
  content: "Content (all pages · body area)",
  entire:  "Entire PDF (all pages · full text)",
};

const isPDF = (file) => file.name.toLowerCase().endsWith(".pdf");
const getDisplayName = (file) =>
  file.webkitRelativePath || file.relativePath || file.name;

dropZone.addEventListener("click", () => folderInput.click());
chooseFilesBtn.addEventListener("click", () => fileInput.click());
chooseFolderBtn.addEventListener("click", () => folderInput.click());

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  handleFiles(e.dataTransfer.files);
});

fileInput.addEventListener("change", () => {
  handleFiles(fileInput.files);
});

folderInput.addEventListener("change", () => {
  handleFiles(folderInput.files);
});

const handleFiles = (files) => {
  const seen = new Set();
  selectedFiles = Array.from(files)
    .filter(isPDF)
    .sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)))
    .filter((file) => {
      const key = `${getDisplayName(file)}:${file.size}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  updateFileList();
};

const removeFile = (index) => {
  selectedFiles.splice(index, 1);
  updateFileList();
};

window.removeFile = removeFile;

const updateFileList = () => {
  if (selectedFiles.length === 0) {
    selectedFilesDiv.style.display = "none";
    scanBtn.disabled = true;
    return;
  }

  selectedFilesDiv.style.display = "block";
  scanBtn.disabled = false;
  selectionSummary.textContent = `${selectedFiles.length} PDF file${
    selectedFiles.length === 1 ? "" : "s"
  } selected`;

  fileList.innerHTML = selectedFiles
    .map(
      (file, index) => `
    <div class="file-item">
      <span class="name">PDF ${getDisplayName(file)}</span>
      <button class="remove" onclick="removeFile(${index})">Remove</button>
    </div>
  `,
    )
    .join("");
};

clearBtn.addEventListener("click", () => {
  selectedFiles = [];
  fileInput.value = "";
  folderInput.value = "";
  updateFileList();
  resultsSection.classList.remove("show");
  errorMessage.classList.remove("show");
});

scanBtn.addEventListener("click", async () => {
  if (selectedFiles.length === 0) return;

  const targetText = targetTextInput.value.trim();
  if (!targetText) {
    showError("Please enter the footer text you want to search for.");
    targetTextInput.focus();
    return;
  }

  const searchMode = getSelectedMode();

  const formData = new FormData();
  formData.append("targetText", targetText);
  formData.append("searchMode", searchMode);
  selectedFiles.forEach((file) => {
    const displayName = getDisplayName(file);
    formData.append("pdfs", file, file.name);
    formData.append("pdfPaths", displayName);
  });

  loading.classList.add("show");
  document.getElementById("loadingMsg").textContent =
    `Scanning ${MODE_LABELS[searchMode] || searchMode}... Please wait`;
  resultsSection.classList.remove("show");
  errorMessage.classList.remove("show");
  scanBtn.disabled = true;

  try {
    const apiBase = (typeof window.API_BASE_URL !== "undefined" && window.API_BASE_URL) ? window.API_BASE_URL : "";
    const response = await fetch(apiBase + "/api/scan", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    if (data.success) {
      displayResults(data, targetText, searchMode);
    } else {
      showError(data.error || "Scanning failed");
    }
  } catch (error) {
    showError("Error: " + error.message);
  } finally {
    loading.classList.remove("show");
    scanBtn.disabled = false;
  }
});

const displayResults = (data, targetText, searchMode) => {
  const results = data.results;
  let found = 0;
  let notFound = 0;
  let errors = 0;

  results.forEach((r) => {
    if (r.error) errors++;
    else if (r.found) found++;
    else notFound++;
  });

  const stats = document.getElementById("stats");
  stats.innerHTML = `
    <div class="stat-card">
      <div class="number">${results.length}</div>
      <div class="label">Total PDFs</div>
    </div>
    <div class="stat-card">
      <div class="number">${found}</div>
      <div class="label">✅ Found</div>
    </div>
    <div class="stat-card">
      <div class="number">${notFound}</div>
      <div class="label">❌ Not Found</div>
    </div>
    <div class="stat-card">
      <div class="number">${errors}</div>
      <div class="label">⚠️ Errors</div>
    </div>
  `;

  const resultsTable = document.getElementById("resultsTable");
  resultsTable.innerHTML = results
    .map((r, i) => {
      let statusBadge = "";
      let details = "";

      if (r.error) {
        statusBadge = '<span class="status-badge status-error">⚠️ Error</span>';
        details = r.error;
      } else if (r.found) {
        statusBadge = '<span class="status-badge status-found">✅ Found</span>';
        details = `<span class="pages-list">Pages: ${r.matched_pages.join(", ")}</span>`;
      } else {
        statusBadge =
          '<span class="status-badge status-not-found">❌ Not Found</span>';
        details = "Target text not found in footer";
      }

      return `
      <tr>
        <td>${i + 1}</td>
        <td>${r.filename}</td>
        <td>${r.total_pages}</td>
        <td>${statusBadge}</td>
        <td>${details}</td>
      </tr>
    `;
    })
    .join("");

  const apiBase = (typeof window.API_BASE_URL !== "undefined" && window.API_BASE_URL) ? window.API_BASE_URL : "";
  const savedFileName = data.savedFileName || "scan_results.csv";
  const downloadUrl = `${apiBase}/api/results/download?file=${encodeURIComponent(savedFileName)}`;

  document.getElementById("timestamp").innerHTML =
    `<strong>Searched for:</strong> “${targetText}” &nbsp;|&nbsp; <strong>Zone:</strong> ${MODE_LABELS[searchMode] || searchMode}<br>
     <strong>Scanned:</strong> ${data.timestamp}<br>
     <strong>Saved to:</strong> ${data.savedTo}
     &nbsp;· <a href="${downloadUrl}" download="${savedFileName}">⬇️ Download this result</a>`;
  resultsSection.classList.add("show");
};

const showError = (message) => {
  errorMessage.textContent = message;
  errorMessage.classList.add("show");
};
