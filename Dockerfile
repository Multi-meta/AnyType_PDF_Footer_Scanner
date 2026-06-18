# =============================================================================
# Dockerfile — PDF Footer Scanner Backend
# =============================================================================
# Multi-stage: Build stage installs deps, runtime stage runs the app.
# Includes: Node.js, Python 3.11, Poppler, Tesseract OCR (eng + hin)
# =============================================================================

FROM node:20-bookworm-slim AS base

# ── System dependencies ───────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Poppler utilities (pdftotext, pdfinfo, pdftoppm)
    poppler-utils \
    # Tesseract OCR engine
    tesseract-ocr \
    # Tesseract language packs
    tesseract-ocr-eng \
    tesseract-ocr-hin \
    # Python 3 + pip
    python3 \
    python3-pip \
    python3-venv \
    # Image processing libraries needed by Pillow
    libpng-dev \
    libjpeg-dev \
    # Clean up apt cache to reduce image size
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# ── Python packages ───────────────────────────────────────────────────────────
COPY requirements.txt /tmp/requirements.txt
RUN pip3 install --no-cache-dir --break-system-packages -r /tmp/requirements.txt

# ── App directory ─────────────────────────────────────────────────────────────
WORKDIR /app

# ── Node.js dependencies ──────────────────────────────────────────────────────
# Copy package files first (better layer caching)
COPY package*.json ./
RUN npm ci --only=production

# ── Application source ────────────────────────────────────────────────────────
COPY . .

# ── Create runtime directories ────────────────────────────────────────────────
RUN mkdir -p uploads results uploads/ocr-temp

# ── Environment ───────────────────────────────────────────────────────────────
ENV NODE_ENV=production
ENV PORT=10000
# Use system Python on Linux
ENV PDF_FOOTER_SCANNER_PYTHON=python3

# ── Expose port ───────────────────────────────────────────────────────────────
EXPOSE 10000

# ── Health check ─────────────────────────────────────────────────────────────
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 10000) + '/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# ── Start ─────────────────────────────────────────────────────────────────────
CMD ["node", "server.js"]
