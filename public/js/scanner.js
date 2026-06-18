const scanPDFs = async (files) => {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append("pdfs", file);
  });

  try {
    const response = await fetch("/api/scan", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();
    return data;
  } catch (error) {
    throw new Error("Scan request failed: " + error.message);
  }
};

export { scanPDFs };
