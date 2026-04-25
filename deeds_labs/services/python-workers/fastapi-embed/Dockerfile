FROM python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir fastapi uvicorn httpx numpy

COPY main.py .

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8097/health')" || exit 1

EXPOSE 8097

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8097"]
