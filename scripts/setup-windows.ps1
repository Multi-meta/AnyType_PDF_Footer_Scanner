# =============================================================================
# PDF Footer Scanner — Windows Setup Script
# =============================================================================
# Usage:
#   npm run setup:windows
#   -- OR --
#   powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1
#   powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1 -InstallTools
#
# Parameters:
#   -InstallTools   Also install missing system tools (Tesseract, Poppler, Python)
#                   via winget. Omit this flag to skip system-level installs.
# =============================================================================

param(
    [switch]$InstallTools
)

$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "PDF Footer Scanner — Setup"

# ── Colours ──────────────────────────────────────────────────────────────────
function Write-Step   { param($msg) Write-Host "`n  🔷 $msg" -ForegroundColor Cyan }
function Write-Ok     { param($msg) Write-Host "  ✅ $msg" -ForegroundColor Green }
function Write-Warn   { param($msg) Write-Host "  ⚠️  $msg" -ForegroundColor Yellow }
function Write-Fail   { param($msg) Write-Host "  ❌ $msg" -ForegroundColor Red }
function Write-Info   { param($msg) Write-Host "     $msg" -ForegroundColor Gray }

Write-Host ""
Write-Host "  ╔══════════════════════════════════════════════════╗" -ForegroundColor Blue
Write-Host "  ║       PDF Footer Scanner — Windows Setup         ║" -ForegroundColor Blue
Write-Host "  ╚══════════════════════════════════════════════════╝" -ForegroundColor Blue
Write-Host ""

# ── Helper: check if a command exists ────────────────────────────────────────
function Test-Command {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

# ── Helper: install via winget ────────────────────────────────────────────────
function Install-WithWinget {
    param([string]$PackageId, [string]$Name)
    if (-not (Test-Command "winget")) {
        Write-Warn "winget not available. Install $Name manually."
        return $false
    }
    Write-Info "Installing $Name via winget..."
    winget install --id $PackageId --silent --accept-source-agreements --accept-package-agreements
    return $true
}

# ═════════════════════════════════════════════════════════════════════════════
# STEP 1 — Node.js
# ═════════════════════════════════════════════════════════════════════════════
Write-Step "Checking Node.js..."
if (Test-Command "node") {
    $nodeVersion = (node --version 2>&1)
    Write-Ok "Node.js found: $nodeVersion"
} else {
    Write-Fail "Node.js not found!"
    if ($InstallTools) {
        Install-WithWinget "OpenJS.NodeJS.LTS" "Node.js LTS"
        Write-Warn "Please restart this terminal after Node.js installation and re-run setup."
    } else {
        Write-Info "Download from: https://nodejs.org/"
        Write-Info "Re-run with -InstallTools flag to auto-install."
    }
    exit 1
}

# ═════════════════════════════════════════════════════════════════════════════
# STEP 2 — Python
# ═════════════════════════════════════════════════════════════════════════════
Write-Step "Checking Python..."
$pythonCmd = $null
foreach ($cmd in @("python", "python3", "py")) {
    if (Test-Command $cmd) {
        $ver = (& $cmd --version 2>&1) -replace "Python ", ""
        if ([version]$ver -ge [version]"3.8") {
            $pythonCmd = $cmd
            Write-Ok "Python found: $cmd $ver"
            break
        }
    }
}

if (-not $pythonCmd) {
    Write-Warn "Python 3.8+ not found."
    if ($InstallTools) {
        Install-WithWinget "Python.Python.3.11" "Python 3.11"
        Write-Warn "Please restart this terminal after Python installation and re-run setup."
        exit 1
    } else {
        Write-Info "Download from: https://www.python.org/downloads/"
        Write-Info "Re-run with -InstallTools flag to auto-install."
    }
}

# ── Python packages ───────────────────────────────────────────────────────────
if ($pythonCmd) {
    Write-Step "Installing Python packages (pypdf, Pillow)..."
    try {
        & $pythonCmd -m pip install --upgrade pip --quiet
        & $pythonCmd -m pip install pypdf Pillow --quiet
        Write-Ok "Python packages installed successfully."
    } catch {
        Write-Warn "Could not install Python packages: $_"
        Write-Info "Try manually: $pythonCmd -m pip install pypdf Pillow"
    }
}

# ═════════════════════════════════════════════════════════════════════════════
# STEP 3 — Poppler (pdfinfo, pdftoppm, pdftotext)
# ═════════════════════════════════════════════════════════════════════════════
Write-Step "Checking Poppler utilities (pdfinfo, pdftoppm, pdftotext)..."
if (Test-Command "pdfinfo") {
    Write-Ok "Poppler found in PATH."
} else {
    Write-Warn "Poppler not found in PATH."
    if ($InstallTools) {
        Write-Info "Attempting to install Poppler via winget..."
        try {
            Install-WithWinget "oschwartz10612.poppler" "Poppler for Windows"
            Write-Warn "You may need to add Poppler bin\ to your PATH manually."
            Write-Info "See: https://github.com/oschwartz10612/poppler-windows/releases/"
        } catch {
            Write-Warn "Auto-install failed. Download manually."
            Write-Info "Download: https://github.com/oschwartz10612/poppler-windows/releases/"
            Write-Info "Extract and add the bin\ folder to your system PATH."
        }
    } else {
        Write-Info "Download: https://github.com/oschwartz10612/poppler-windows/releases/"
        Write-Info "Extract and add the bin\ folder to your system PATH."
        Write-Info "Re-run with -InstallTools flag to attempt auto-install."
    }
    Write-Info "The app will fall back to pdf2pic (slower) if Poppler is missing."
}

# ═════════════════════════════════════════════════════════════════════════════
# STEP 4 — Tesseract OCR
# ═════════════════════════════════════════════════════════════════════════════
Write-Step "Checking Tesseract OCR..."
if (Test-Command "tesseract") {
    $tesseractVer = (tesseract --version 2>&1 | Select-String "tesseract").ToString().Trim()
    Write-Ok "Tesseract found: $tesseractVer"

    # Check for Hindi language data
    $langs = (tesseract --list-langs 2>&1) -join " "
    if ($langs -match "hin") {
        Write-Ok "Hindi (hin) language data available."
    } else {
        Write-Warn "Hindi (hin) language data NOT found."
        Write-Info "Download hin.traineddata from:"
        Write-Info "  https://github.com/tesseract-ocr/tessdata/raw/main/hin.traineddata"
        Write-Info "Place it in your Tesseract tessdata folder."
    }
} else {
    Write-Warn "Tesseract not found."
    if ($InstallTools) {
        Write-Info "Installing Tesseract via winget..."
        try {
            Install-WithWinget "UB-Mannheim.TesseractOCR" "Tesseract OCR"
            Write-Warn "After install, ensure Tesseract is in PATH and download hin.traineddata."
        } catch {
            Write-Warn "Auto-install failed."
        }
    }
    Write-Info "Download: https://github.com/UB-Mannheim/tesseract/wiki"
    Write-Info "App will fall back to tesseract.js (slower, no Hindi) if not found."
}

# ═════════════════════════════════════════════════════════════════════════════
# STEP 5 — Node.js dependencies (npm install)
# ═════════════════════════════════════════════════════════════════════════════
Write-Step "Installing Node.js dependencies..."
try {
    npm install --silent
    Write-Ok "npm install complete."
} catch {
    Write-Fail "npm install failed: $_"
    exit 1
}

# ═════════════════════════════════════════════════════════════════════════════
# STEP 6 — Create .env from .env.example if missing
# ═════════════════════════════════════════════════════════════════════════════
Write-Step "Setting up environment file..."
$envFile = ".\.env"
$envExample = ".\.env.example"

if (-not (Test-Path $envFile)) {
    if (Test-Path $envExample) {
        Copy-Item $envExample $envFile
        Write-Ok ".env created from .env.example."
        Write-Info "Edit .env to set your FRONTEND_URL when deploying."
    } else {
        Write-Warn ".env.example not found. Creating minimal .env..."
        @"
PORT=3000
FRONTEND_URL=http://localhost:3000
PDF_FOOTER_SCANNER_PYTHON=
"@ | Set-Content $envFile -Encoding UTF8
        Write-Ok ".env created."
    }
} else {
    Write-Ok ".env already exists — skipped."
}

# ═════════════════════════════════════════════════════════════════════════════
# STEP 7 — Ensure required directories exist
# ═════════════════════════════════════════════════════════════════════════════
Write-Step "Creating required directories..."
foreach ($dir in @("uploads", "results", "uploads\ocr-temp")) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Ok "Created: $dir"
    } else {
        Write-Info "Already exists: $dir"
    }
}

# ═════════════════════════════════════════════════════════════════════════════
# DONE
# ═════════════════════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "  ╔══════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "  ║            ✅  Setup Complete!                   ║" -ForegroundColor Green
Write-Host "  ╚══════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "  To start the app, run:" -ForegroundColor White
Write-Host "    npm start" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Then open in browser:" -ForegroundColor White
Write-Host "    http://localhost:3000" -ForegroundColor Yellow
Write-Host ""
