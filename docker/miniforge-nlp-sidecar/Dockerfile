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

COPY python /app/python

RUN python -m pip install --upgrade pip setuptools wheel \
  && python -m pip install \
    fastapi \
    uvicorn[standard] \
    httpx \
    pydantic \
    psutil \
    beautifulsoup4 \
    spacy \
    langextract \
    treesitter-chunker \
    tree-sitter \
    tree-sitter-language-pack \
    ast-grep-py \
  && python -m pip install -e /app/python

EXPOSE 8095

ENV MINIFORGE_SIDECAR_HOST=0.0.0.0 \
    MINIFORGE_SIDECAR_PORT=8095

# v2 preserves native Consiliency IDs/hierarchy and LangExtract grounding while
# reusing the legacy analysis implementation. Rollback is a one-line command
# change to /app/python/miniforge_nlp_sidecar.py if the proof gates fail.
CMD ["python", "/app/python/miniforge_nlp_sidecar_v2.py"]
