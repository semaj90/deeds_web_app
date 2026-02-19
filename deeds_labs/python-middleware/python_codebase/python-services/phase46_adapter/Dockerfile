FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

COPY doc_ingest.py .

EXPOSE 8092

CMD ["uvicorn", "doc_ingest:app", "--host", "0.0.0.0", "--port", "8092"]
