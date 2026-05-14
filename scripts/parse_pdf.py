#!/usr/bin/env python3
"""
parse_pdf.py - PDF text extraction for LeaseGuard MCP server.

Usage:
    python scripts/parse_pdf.py <file_path> [--ocr]

Output: JSON to stdout
Errors: JSON to stderr, exit code 1
"""

import argparse
import json
import os
import re
import sys
from collections import Counter
from datetime import datetime
from typing import Any

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _stderr_error(code: str, message: str) -> None:
    """Write error JSON to stderr."""
    json.dump({"error": code, "message": message}, sys.stderr)
    sys.stderr.write("\n")


def _fatal(code: str, message: str) -> None:
    """Write error to stderr and exit 1."""
    _stderr_error(code, message)
    sys.exit(1)


def _is_pdf(path: str) -> bool:
    """Check magic bytes for PDF header."""
    try:
        with open(path, "rb") as f:
            header = f.read(5)
        return header == b"%PDF-"
    except OSError:
        return False


def _word_count(text: str) -> int:
    return len(text.split())


def _non_ascii_ratio(text: str) -> float:
    if not text:
        return 0.0
    non_ascii = sum(1 for c in text if ord(c) > 127)
    return non_ascii / len(text)


def _strip_headers_footers(pages_text: list[str]) -> list[str]:
    """Remove lines that appear verbatim on >30% of pages."""
    if not pages_text:
        return pages_text

    total_pages = len(pages_text)
    threshold = max(2, int(total_pages * 0.30))

    # Count line occurrences across all pages
    line_counts: Counter = Counter()
    for page_text in pages_text:
        lines = set(page_text.splitlines())
        for line in lines:
            stripped = line.strip()
            if stripped:
                line_counts[stripped] += 1

    # Lines appearing on >= threshold pages are headers/footers
    repeated = {line for line, count in line_counts.items() if count >= threshold}

    # Also strip standalone page number lines (e.g. "1", "- 2 -", "Page 3")
    page_num_pattern = re.compile(
        r"^\s*(?:page\s*)?\d+\s*$|^\s*-\s*\d+\s*-\s*$", re.IGNORECASE
    )

    cleaned = []
    for page_text in pages_text:
        lines = page_text.splitlines()
        kept = []
        for line in lines:
            stripped = line.strip()
            if stripped in repeated:
                continue
            if page_num_pattern.match(stripped):
                continue
            kept.append(line)
        cleaned.append("\n".join(kept))

    return cleaned


# ---------------------------------------------------------------------------
# Text-based extraction (PyMuPDF)
# ---------------------------------------------------------------------------

def _sort_blocks_reading_order(blocks: list[dict]) -> list[dict]:
    """
    Sort text blocks for multi-column reading order.
    Strategy: divide page into columns by clustering x0 positions, then
    sort top-to-bottom within each column.
    """
    if not blocks:
        return blocks

    # Collect x0 positions to detect columns
    x0_values = [b["bbox"][0] for b in blocks]
    x0_values_sorted = sorted(set(x0_values))

    # Simple column detection: gap > 100pts indicates column boundary
    col_boundaries = [0.0]
    prev = x0_values_sorted[0] if x0_values_sorted else 0.0
    for x in x0_values_sorted[1:]:
        if x - prev > 100:
            col_boundaries.append((x + prev) / 2)
        prev = x
    col_boundaries.append(float("inf"))

    def col_index(x0: float) -> int:
        for i in range(len(col_boundaries) - 1):
            if col_boundaries[i] <= x0 < col_boundaries[i + 1]:
                return i
        return len(col_boundaries) - 2

    def sort_key(block: dict) -> tuple:
        bbox = block["bbox"]
        col = col_index(bbox[0])
        return (col, bbox[1])  # column first, then top y

    return sorted(blocks, key=sort_key)


def extract_text_pymupdf(path: str) -> tuple[list[str], dict[str, Any]]:
    """
    Extract text using PyMuPDF.
    Returns (pages_text, metadata_dict).
    """
    import fitz  # PyMuPDF

    doc = fitz.open(path)

    if doc.is_encrypted:
        doc.close()
        _fatal("extraction_failed", "PDF is password-protected and cannot be opened.")

    metadata: dict[str, Any] = {}
    raw_meta = doc.metadata or {}

    title = raw_meta.get("title", "") or ""
    created = raw_meta.get("creationDate", "") or ""

    # Parse PDF date format: D:YYYYMMDDHHmmSS
    created_at = ""
    if created.startswith("D:"):
        try:
            created_at = datetime.strptime(created[2:16], "%Y%m%d%H%M%S").date().isoformat()
        except ValueError:
            try:
                created_at = datetime.strptime(created[2:10], "%Y%m%d").date().isoformat()
            except ValueError:
                created_at = ""

    metadata["title"] = title
    metadata["created_at"] = created_at

    pages_text = []
    for page in doc:
        text_dict = page.get_text("dict")
        blocks = [
            b for b in text_dict.get("blocks", [])
            if b.get("type") == 0  # type 0 = text
        ]
        blocks = _sort_blocks_reading_order(blocks)

        page_lines = []
        for block in blocks:
            for line in block.get("lines", []):
                spans = line.get("spans", [])
                line_text = "".join(s.get("text", "") for s in spans)
                page_lines.append(line_text)

        pages_text.append("\n".join(page_lines))

    doc.close()
    return pages_text, metadata


def compute_text_confidence(pages_text: list[str]) -> float:
    """
    Confidence for text-based extraction.
    Penalises high non-ASCII ratio and very short pages.
    """
    if not pages_text:
        return 0.0

    full_text = "\n".join(pages_text)
    if not full_text.strip():
        return 0.0

    na_ratio = _non_ascii_ratio(full_text)

    # Penalise if average page is very short (< 50 chars)
    avg_page_len = sum(len(p) for p in pages_text) / len(pages_text)
    length_penalty = 0.0 if avg_page_len >= 50 else 0.3

    confidence = 1.0 - (na_ratio * 0.8) - length_penalty
    return max(0.0, min(1.0, confidence))


# ---------------------------------------------------------------------------
# OCR extraction (pytesseract + Pillow)
# ---------------------------------------------------------------------------

def extract_text_ocr(path: str) -> tuple[list[str], float]:
    """
    Extract text via OCR.
    Returns (pages_text, mean_confidence).
    """
    try:
        import fitz
        import pytesseract
        from PIL import Image
        import io
    except ImportError as e:
        _fatal("extraction_failed", f"OCR dependencies not available: {e}")

    try:
        doc = fitz.open(path)
    except Exception as e:
        _fatal("extraction_failed", f"Cannot open PDF for OCR: {e}")

    pages_text = []
    all_confidences = []

    for page in doc:
        # Render at 300 DPI for good OCR quality
        mat = fitz.Matrix(300 / 72, 300 / 72)
        pix = page.get_pixmap(matrix=mat)
        img_bytes = pix.tobytes("png")
        img = Image.open(io.BytesIO(img_bytes))

        try:
            data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
            words = [
                (data["text"][i], int(data["conf"][i]))
                for i in range(len(data["text"]))
                if data["text"][i].strip() and int(data["conf"][i]) > 0
            ]
            if words:
                page_conf = sum(c for _, c in words) / len(words) / 100.0
                all_confidences.append(page_conf)
                page_text = pytesseract.image_to_string(img)
            else:
                page_text = pytesseract.image_to_string(img)
        except Exception:
            page_text = ""

        pages_text.append(page_text)

    doc.close()

    mean_conf = sum(all_confidences) / len(all_confidences) if all_confidences else 0.5
    return pages_text, mean_conf


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Extract text from a PDF file.")
    parser.add_argument("file_path", help="Path to the PDF file")
    parser.add_argument(
        "--ocr", action="store_true", help="Force OCR extraction"
    )
    args = parser.parse_args()

    file_path = args.file_path
    force_ocr = args.ocr

    # --- Validate file ---
    if not os.path.exists(file_path):
        _fatal("file_not_found", f"File does not exist: {file_path}")

    if not os.path.isfile(file_path):
        _fatal("file_not_found", f"Path is not a file: {file_path}")

    if not _is_pdf(file_path):
        _fatal(
            "extraction_failed",
            f"File does not appear to be a valid PDF (bad magic bytes): {file_path}",
        )

    # --- Attempt primary text extraction ---
    fitz_available = True
    try:
        import fitz  # noqa: F401
    except ImportError:
        fitz_available = False

    if not fitz_available:
        _fatal("extraction_failed", "PyMuPDF (fitz) is not installed.")

    pages_text_primary: list[str] = []
    metadata: dict[str, Any] = {}
    primary_error: str = ""

    try:
        pages_text_primary, metadata = extract_text_pymupdf(file_path)
    except SystemExit:
        raise
    except Exception as e:
        primary_error = str(e)

    page_count = len(pages_text_primary)

    if primary_error and not force_ocr:
        # Could not extract at all — report error
        _fatal("extraction_failed", f"PyMuPDF extraction failed: {primary_error}")

    # --- Decide whether to use OCR ---
    use_ocr = force_ocr
    text_confidence = 0.0

    if not use_ocr and pages_text_primary:
        text_confidence = compute_text_confidence(pages_text_primary)
        full_primary = "\n".join(pages_text_primary).strip()

        if not full_primary:
            # Completely blank — try OCR automatically
            use_ocr = True
        elif text_confidence < 0.5:
            use_ocr = True  # text is mostly garbage

    # --- OCR path ---
    ocr_warning: str = ""
    extraction_method = "text"
    final_confidence = text_confidence

    if use_ocr:
        tesseract_available = True
        try:
            import pytesseract  # noqa: F401
        except ImportError:
            tesseract_available = False

        if not tesseract_available:
            if not pages_text_primary:
                _fatal(
                    "extraction_failed",
                    "No text extracted and pytesseract is not installed for OCR fallback.",
                )
            # Fall back to text result with warning
            ocr_warning = "pytesseract not installed; OCR unavailable. Result may be low quality."
            use_ocr = False
        else:
            try:
                pages_text_ocr, ocr_conf = extract_text_ocr(file_path)

                if pages_text_primary:
                    # Choose whichever is better
                    if ocr_conf > text_confidence:
                        pages_text_primary = pages_text_ocr
                        final_confidence = ocr_conf
                        extraction_method = "ocr"
                    else:
                        # Keep text extraction
                        final_confidence = text_confidence
                        extraction_method = "text"
                else:
                    pages_text_primary = pages_text_ocr
                    final_confidence = ocr_conf
                    extraction_method = "ocr"
                    page_count = len(pages_text_ocr)

            except SystemExit:
                raise
            except Exception as e:
                if not pages_text_primary:
                    _fatal("extraction_failed", f"OCR extraction failed: {e}")
                # OCR failed but we have text — use text with warning
                ocr_warning = f"OCR failed ({e}); using text extraction."

    # --- Strip headers/footers ---
    cleaned_pages = _strip_headers_footers(pages_text_primary)

    # --- Assemble full text ---
    raw_text = "\n\n".join(p.strip() for p in cleaned_pages if p.strip())

    if not raw_text.strip():
        _fatal("empty_document", "No text could be extracted from this PDF.")

    # --- Build metadata ---
    metadata["word_count"] = _word_count(raw_text)
    if not metadata.get("title"):
        metadata["title"] = os.path.splitext(os.path.basename(file_path))[0]
    if not metadata.get("created_at"):
        metadata["created_at"] = ""

    # --- Build output ---
    output: dict[str, Any] = {
        "raw_text": raw_text,
        "page_count": page_count,
        "extraction_method": extraction_method,
        "confidence": round(final_confidence, 4),
        "metadata": metadata,
    }

    if ocr_warning:
        output["warning"] = ocr_warning

    print(json.dumps(output, ensure_ascii=False))


if __name__ == "__main__":
    main()
