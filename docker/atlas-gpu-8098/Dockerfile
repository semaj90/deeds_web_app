FROM rapidsai/base:26.08-cuda12-py3.13-amd64

USER root
WORKDIR /app

RUN python -m pip install --no-cache-dir \
    fastapi \
    "uvicorn[standard]" \
    pyarrow \
    pandas

COPY services/atlas-gpu-8098/app.py /app/services/atlas-gpu-8098/app.py
COPY python/atlas_rapids_graph_runtime.py /app/python/atlas_rapids_graph_runtime.py

RUN mkdir -p /app/services/atlas-gpu-8098 /app/python \
    && chown -R rapids:conda /app

USER rapids
EXPOSE 8098

CMD ["python", "/app/services/atlas-gpu-8098/app.py"]
