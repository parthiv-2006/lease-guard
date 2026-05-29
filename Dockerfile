# ── Stage 1: Build TypeScript ─────────────────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /app/mcp-server
COPY mcp-server/package*.json ./
RUN npm ci
COPY mcp-server/src ./src
COPY mcp-server/tsconfig.json ./
RUN npm run build

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:22-slim

# Python + Tesseract for parse_document tool
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    python-is-python3 \
    tesseract-ocr \
    tesseract-ocr-eng \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Python deps in a venv (avoids PEP 668 system-package restrictions)
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir pymupdf pytesseract Pillow truststore certifi

WORKDIR /app

# Python parse script — resolved by parse-document.ts as /app/scripts/parse_pdf.py
COPY scripts/parse_pdf.py ./scripts/parse_pdf.py

# Node production deps
COPY mcp-server/package*.json ./mcp-server/
WORKDIR /app/mcp-server
RUN npm ci --omit=dev

# Compiled JS from builder
COPY --from=builder /app/mcp-server/dist ./dist

WORKDIR /app

EXPOSE 8080

# Health check — Railway uses this to verify the app is actually responding
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

CMD ["node", "mcp-server/dist/start.js"]
