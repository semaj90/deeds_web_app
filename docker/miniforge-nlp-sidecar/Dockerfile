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
    oaklib==0.7.3 \
    'psycopg[binary,pool]>=3.2,<4' \
    'networkx>=3.6,<4' \
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

# OAK (Ontology Access Kit) is available to the bounded OaK-style kernel.
# Leave ATLAS_OAK_ADAPTER unset by default so a container never downloads or
# selects ontology state implicitly. Deployment must provide an explicit,
# revision-qualified read-only adapter locator.
#
# The wrapper preserves the v2 AST/LangExtract facade and only mounts the OAK
# router. Rollback remains a one-line command change to v2 or legacy.
CMD ["python", "/app/python/miniforge_nlp_sidecar_oak.py"]
