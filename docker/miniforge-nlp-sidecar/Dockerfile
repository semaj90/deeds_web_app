FROM python:3.13-slim@sha256:9d2e5553305c7c7b0097999bb17187c69b921ccd6bc9d40e4bb5ebe652c00285

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

ARG PIP_VERSION=26.2.1
ARG SETUPTOOLS_VERSION=81.0.0
ARG WHEEL_VERSION=0.48.0

# The spaCy CLI compatibility index does not resolve this model reliably on
# Python 3.13/spaCy 3.8.16. Install the pinned official wheel directly so
# the image fails closed if the model artifact is unavailable.
RUN python -m pip install --upgrade \
    pip==${PIP_VERSION} \
    setuptools==${SETUPTOOLS_VERSION} \
    wheel==${WHEEL_VERSION} \
  && python -m pip install \
    fastapi==0.141.1 \
    uvicorn[standard]==0.52.4 \
    httpx==0.28.1 \
    pydantic==2.13.5 \
    psutil==7.2.2 \
    beautifulsoup4==4.15.0 \
    spacy==3.8.16 \
    langextract[openai]==1.6.0 \
    oaklib==0.7.4 \
    'psycopg[binary,pool]==3.3.4' \
    networkx==3.6.1 \
    treesitter-chunker==4.0.0 \
    tree-sitter==0.25.2 \
    tree-sitter-language-pack==0.9.0 \
    ast-grep-py==0.45.3 \
    numpy==2.3.3 \
    scikit-learn==1.7.2 \
    joblib==1.5.2 \
  && python -m pip check \
  && python -m pip install --no-cache-dir --no-deps \
    https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl
# Found live 2026-09-13: spacy the PACKAGE was installed but no language model ever was --
# `spacy.load('en_core_web_sm')` failed with E050, silently falling back to `spacy.blank('en')`
# (a tokenizer with zero pipeline components: no tagger, no parser, no NER). This sidecar's own
# /health `capabilities.spacy: true` only checks the package import, not model availability, so
# the gap was invisible. Every consumer of _lazy_spacy() -- _spacy_entities() (NER, feeding
# /analyze's `entities`) and _spacy_pos_tags() (POS tags, feeding the new /pos endpoint) -- was
# silently returning empty results with no error surfaced. en_core_web_sm 3.8.0 matches the
# spacy==3.8.16 pin above (spaCy model versions must match the spacy package's major.minor).

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
