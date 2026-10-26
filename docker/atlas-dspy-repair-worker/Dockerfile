# Parent Atlas DSPy repair worker (DSPY-SIDECAR-01). Proposal-only RPC boundary.
# Runs the existing program in python/parent_atlas_dspy_repair.py. It is not the
# :8095 NLP sidecar and does not own retrieval, graph, or canonical evidence.
# Model access: host llama-server on :8090 via host.docker.internal, the same route the
# :8095 sidecar and the LDR override use. No store credentials are passed in.
# Versions match the verified WSL venv: see requirements.lock.txt (dspy 3.4.1, gepa 0.1.4).
FROM python:3.13.13-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.lock.txt /app/requirements.lock.txt
RUN python -m pip install -r /app/requirements.lock.txt \
 && python -m pip check

# The repair module is NOT baked into the image: it is bind-mounted read-only at run time from
# python/parent_atlas_dspy_repair.py, so the repo keeps one source file and there is no copy to drift.

RUN useradd --system --uid 10001 --no-create-home worker
USER worker

EXPOSE 8122
ENV DSPY_LM_MODEL=openai/ornith-1.5-9b \
    DSPY_LM_API_BASE=http://host.docker.internal:8090/v1 \
    DSPY_CACHEDIR=/tmp/dspy_cache

CMD ["python", "-I", "/app/parent_atlas_dspy_repair.py", "--host", "0.0.0.0", "--port", "8122", "--allow-all-interfaces"]
