# Omni-Worker — unified Node.js + PyTorch + TRT-LLM container
#
# Shares a CUDA context between:
#   - Node.js 22 (SvelteKit pipeline tasks via N-API)
#   - PyTorch (GPU tensor ops, LangGraph orchestration)
#   - TRT-LLM (optional quantised inference sidecar)
#
# Bridge: omni-bridge (Rust n-api.rs via tch-rs / cudarc)
# Zero-copy tensor hand-off between Node.js and GPU inference.
#
# Build: docker build -t omni-worker-dev docker/omni-worker/
# Run:   docker compose -f docker/omni-worker/docker-compose.omni.yml up

# ── Stage 1: Conda base with CUDA 12.1 ────────────────────────────────
FROM continuumio/miniconda3:latest AS conda-base

# CUDA toolkit from conda-forge (avoids NVIDIA base image restrictions)
RUN conda install -y -c conda-forge -c nvidia \
        cuda-toolkit=12.1 \
        cudatoolkit-dev=12.1 \
    && conda clean -afy

# ── Stage 2: Python deps (PyTorch + LangGraph + XGBoost) ──────────────
FROM conda-base AS python-deps

RUN conda install -y -c pytorch -c nvidia -c conda-forge \
        pytorch=2.3 \
        pytorch-cuda=12.1 \
        torchaudio \
        torchvision \
    && conda clean -afy

RUN pip install --no-cache-dir \
        langgraph==0.1.* \
        langchain-core==0.2.* \
        xgboost==2.* \
        onnxruntime-gpu==1.18.* \
        fastapi==0.111.* \
        uvicorn[standard]==0.30.* \
        httpx==0.27.*

# ── Stage 3: Node.js 22 via conda ────────────────────────────────────
FROM python-deps AS node-layer

RUN conda install -y -c conda-forge nodejs=22 && conda clean -afy

# Verify Node + npm present
RUN node --version && npm --version

# ── Stage 4: Rust toolchain for omni-bridge (n-api.rs) ───────────────
FROM node-layer AS rust-layer

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
ENV PATH="/root/.cargo/bin:${PATH}"
RUN rustup target add x86_64-unknown-linux-gnu

# ── Stage 5: Build omni-bridge N-API addon ───────────────────────────
FROM rust-layer AS bridge-builder

WORKDIR /build/omni-bridge

# Copy Rust crate sources
COPY crates/omni-bridge/ .

# Install napi-rs CLI
RUN npm install -g @napi-rs/cli@3

# Build the Node.js native addon (.node file)
# LIBTORCH_USE_PYTORCH=1 tells tch-rs to reuse the conda PyTorch libs
ENV LIBTORCH_USE_PYTORCH=1
RUN napi build --platform --release 2>/dev/null \
    || cargo build --release  # fallback: plain Rust build if napi CLI fails

# ── Final image ───────────────────────────────────────────────────────
FROM rust-layer AS final

WORKDIR /app

# Copy built addon
COPY --from=bridge-builder /build/omni-bridge/*.node /app/addons/

# Copy worker application
COPY scripts/opencode/ /app/scripts/opencode/
COPY scripts/atlas/ /app/scripts/atlas/
COPY package.json /app/

# Install only production Node deps needed by pipeline scripts
RUN npm install --omit=dev pg ioredis dotenv 2>/dev/null || true

# Python entrypoint for LangGraph orchestration sidecar
COPY docker/omni-worker/langgraph_sidecar.py /app/

ENV NODE_ENV=production
ENV CUDA_VISIBLE_DEVICES=0
ENV OMNI_BRIDGE_ADDON=/app/addons/omni_bridge.node

# Health probe: Node + CUDA presence
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD node -e "const a=require(process.env.OMNI_BRIDGE_ADDON); console.log(a.helloGpu());" \
    || exit 1

# Default: run the LangGraph sidecar (can override with pipeline scripts)
CMD ["python", "/app/langgraph_sidecar.py"]
