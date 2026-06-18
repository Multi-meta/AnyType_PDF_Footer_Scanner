"""
PDF zone image extractor.

Usage:
    python extract_last_page_image.py <pdf-path> <output-dir> [mode]

mode options (default: footer):
    footer   – last page,  bottom 2 in  (≈ bottom 17 % of A4)
    header   – first page, top 5 in     (≈ top 43 % of A4)
    content  – all pages,  middle zone  (skip top ~1 in + bottom ~2 in)
    entire   – all pages,  full page

Output: JSON printed to stdout with the following fields:
    page_count   int          total pages in the PDF
    mode         str          effective mode used
    pages        list[dict]   one entry per processed page:
        page        int         1-based page number
        type        "text" | "image"
        text        str         (type=text) zone text already selected
        raw_path    str         (type=image) path to the raw extracted image
        zone_path   str         (type=image) path to the cropped+enhanced zone
        image_name  str         (type=image) original image name inside the PDF
"""

import json
import sys
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps
from pypdf import PdfReader


# ---------------------------------------------------------------------------
# Zone definitions
# ---------------------------------------------------------------------------

# (top_fraction, bottom_fraction) relative to image height.
# Based on A4 (11.69 in):
#   footer  = bottom 2 in  → 2/11.69 ≈ 0.171  → (0.829, 1.000)
#   header  = top 5 in     → 5/11.69 ≈ 0.428  → (0.000, 0.428)
#   content = middle, skip top 1 in + bottom 2 in
#                          → 1/11.69 ≈ 0.086   → (0.086, 0.829)
#   entire  = full page                         → (0.000, 1.000)
CROP_ZONES = {
    "footer":  (0.829, 1.000),
    "header":  (0.000, 0.428),
    "content": (0.086, 0.829),
    "entire":  (0.000, 1.000),
}

# Upscale factors for OCR – 2x is sufficient for accurate OCR and much faster than 4x.
SCALE_FACTORS = {
    "footer":  2,
    "header":  2,
    "content": 2,
    "entire":  1,
}

# For text-based PDFs: how many lines to keep per page.
# ("head"=first N, "tail"=last N, "middle"=skip N from each end, "all"=everything)
LINE_ZONES = {
    "footer":  ("tail",   10),
    "header":  ("head",   15),
    "content": ("middle",  5),   # skip 5 lines from each end
    "entire":  ("all",    None),
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def select_lines(raw_text: str, mode: str) -> str:
    lines = [ln.strip() for ln in (raw_text or "").splitlines() if ln.strip()]
    kind, n = LINE_ZONES.get(mode, LINE_ZONES["footer"])

    if kind == "tail":
        return "\n".join(lines[-n:])
    if kind == "head":
        return "\n".join(lines[:n])
    if kind == "middle":
        skip = min(n, len(lines) // 4)
        end = max(len(lines) - skip, skip + 1)
        return "\n".join(lines[skip:end])
    return "\n".join(lines)   # "all"


def crop_and_enhance(image_data: bytes, mode: str) -> Image.Image:
    top_frac, bottom_frac = CROP_ZONES[mode]
    scale = SCALE_FACTORS[mode]

    with Image.open(BytesIO(image_data)) as img:
        w, h = img.size
        y0 = int(h * top_frac)
        y1 = int(h * bottom_frac)
        cropped = img.crop((0, y0, w, y1)).convert("L")
        cropped = ImageOps.autocontrast(cropped)
        if scale > 1:
            cropped = cropped.resize(
                (cropped.width * scale, cropped.height * scale),
                Image.Resampling.LANCZOS,
            )
    return cropped


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    if len(sys.argv) < 3:
        raise SystemExit(
            "Usage: extract_last_page_image.py <pdf-path> <output-dir> [mode]"
        )

    pdf_path = Path(sys.argv[1])
    output_dir = Path(sys.argv[2])
    mode = (sys.argv[3].lower() if len(sys.argv) > 3 else "footer")
    if mode not in CROP_ZONES:
        mode = "footer"

    output_dir.mkdir(parents=True, exist_ok=True)
    reader = PdfReader(str(pdf_path))
    page_count = len(reader.pages)

    if page_count == 0:
        raise RuntimeError("PDF has no pages")

    # Decide which page indices (0-based) to process
    if mode == "header":
        indices = [0]                          # first page only
    elif mode == "footer":
        indices = [page_count - 1]             # last page only
    else:                                       # content / entire → all pages
        indices = list(range(page_count))

    page_results = []

    for idx in indices:
        page_num = idx + 1
        page = reader.pages[idx]

        # ── Try text extraction first ────────────────────────────────────
        raw_text = page.extract_text() or ""
        if raw_text.strip():
            page_results.append(
                {
                    "page": page_num,
                    "type": "text",
                    "text": select_lines(raw_text, mode),
                }
            )
            continue

        # ── Image-based page ─────────────────────────────────────────────
        images = list(page.images)
        if not images:
            # No text, no embedded image → return empty text entry so
            # Node.js knows to try pdftoppm for this page.
            page_results.append(
                {"page": page_num, "type": "text", "text": ""}
            )
            continue

        largest = max(images, key=lambda img: len(img.data or b""))
        ext = Path(largest.name or "img.bin").suffix or ".bin"

        raw_path = output_dir / f"page{page_num}-raw{ext}"
        raw_path.write_bytes(largest.data)

        zone_img = crop_and_enhance(largest.data, mode)
        zone_path = output_dir / f"page{page_num}-zone.png"
        zone_img.save(zone_path)

        page_results.append(
            {
                "page": page_num,
                "type": "image",
                "raw_path": str(raw_path),
                "zone_path": str(zone_path),
                "image_name": largest.name,
            }
        )

    print( 
        json.dumps(
            {
                "page_count": page_count,
                "mode": mode,
                "pages": page_results,
            }
        )
    )


if __name__ == "__main__":
    main()
