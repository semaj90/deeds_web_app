FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    git \
  && rm -rf /var/lib/apt/lists/*

RUN python -m pip install --upgrade pip setuptools wheel \
  && python -m pip install \
    fastapi \
    uvicorn[standard] \
    httpx \
    pydantic \
    psutil \
    beautifulsoup4 \
    spacy \
    langextract[openai]==1.6.0 \
    treesitter-chunker \
    tree-sitter \
    tree-sitter-language-pack \
    ast-grep-py \
  && python -m pip check

# Keep dependency installation independent from application source changes so
# source-only rebuilds reuse the expensive Python package layer.
COPY python /app/python

EXPOSE 8095

ENV MINIFORGE_SIDECAR_HOST=0.0.0.0 \
    MINIFORGE_SIDECAR_PORT=8095 \
    LANGEXTRACT_RUNTIME=official

# v2 preserves native Consiliency IDs/hierarchy and LangExtract grounding while
# reusing the legacy analysis implementation. Rollback is a one-line command
# change to /app/python/miniforge_nlp_sidecar.py if the proof gates fail.
CMD ["python", "/app/python/miniforge_nlp_sidecar_v2.py"]
