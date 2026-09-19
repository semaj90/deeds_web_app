FROM rapidsai/base:26.08-cuda12-py3.13-amd64@sha256:16c0397eaa0ddf9727cf09db19fbd2627082b2670b9672cf4fc07baac6751fb0

USER root
WORKDIR /app

COPY docker/atlas-gpu-8098/requirements.txt /tmp/atlas-gpu-8098-requirements.txt

RUN python -m pip install --no-cache-dir \
    --extra-index-url https://download.pytorch.org/whl/cu129 \
    -r /tmp/atlas-gpu-8098-requirements.txt

COPY services/atlas-gpu-8098/app.py /app/services/atlas-gpu-8098/app.py
COPY python/atlas_rapids_graph_runtime.py /app/python/atlas_rapids_graph_runtime.py

RUN mkdir -p /app/services/atlas-gpu-8098 /app/python \
    && chown -R rapids:conda /app

USER rapids
EXPOSE 8098

# This image is intentionally RAPIDS-only; PyTorch belongs to the separate
# neural-decoder/WSL2 lane. Health must therefore validate the libraries this
# sidecar actually owns rather than requiring an absent torch installation.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD python -c "import cupy; assert cupy.cuda.runtime.getDeviceCount() > 0; import cudf, cuvs, cugraph"

CMD ["python", "/app/services/atlas-gpu-8098/app.py"]
