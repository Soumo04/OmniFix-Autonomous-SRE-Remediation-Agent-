# ── Build Stage ──────────────────────────────────────────────
FROM python:3.11-slim as base

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl build-essential libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY src/ ./src/
COPY dashboard/ ./dashboard/
COPY .env.example ./.env

# ── API Target ────────────────────────────────────────────────
FROM base as api
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]

# ── MCP Target ────────────────────────────────────────────────
FROM base as mcp
EXPOSE 9000
CMD ["python", "-m", "src.mcp_server.autoflow_mcp_server"]
