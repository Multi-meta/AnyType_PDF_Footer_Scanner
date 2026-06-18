const displayResults = (data) => {
  const results = data.results;
  let found = 0,
    notFound = 0,
    errors = 0;

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

  document.getElementById("timestamp").innerHTML =
    `<strong>Scanned:</strong> ${data.timestamp}`;
  document.getElementById("resultsSection").classList.add("show");
};

const showError = (message) => {
  const errorMessage = document.getElementById("errorMessage");
  errorMessage.textContent = "❌ " + message;
  errorMessage.classList.add("show");
};

const clearResults = () => {
  document.getElementById("resultsSection").classList.remove("show");
  document.getElementById("errorMessage").classList.remove("show");
};

export { displayResults, showError, clearResults };
