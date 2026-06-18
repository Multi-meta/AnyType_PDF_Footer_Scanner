const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");

let selectedFiles = [];

dropZone.addEventListener("click", () => fileInput.click());

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

const handleFiles = (files) => {
  selectedFiles = Array.from(files).filter((f) => f.type === "application/pdf");
  updateFileList();
};

const removeFile = (index) => {
  selectedFiles.splice(index, 1);
  updateFileList();
};

const updateFileList = () => {
  const selectedFilesDiv = document.getElementById("selectedFiles");
  const fileList = document.getElementById("fileList");
  const scanBtn = document.getElementById("scanBtn");

  if (selectedFiles.length === 0) {
    selectedFilesDiv.style.display = "none";
    scanBtn.disabled = true;
    return;
  }

  selectedFilesDiv.style.display = "block";
  scanBtn.disabled = false;

  fileList.innerHTML = selectedFiles
    .map(
      (file, index) => `
    <div class="file-item">
      <span class="name">📄 ${file.name}</span>
      <button class="remove" onclick="removeFile(${index})">Remove</button>
    </div>
  `,
    )
    .join("");
};

const getSelectedFiles = () => selectedFiles;

export { getSelectedFiles, updateFileList };
