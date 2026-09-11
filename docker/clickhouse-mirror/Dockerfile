FROM python:3.11-slim@sha256:9534e5a8e315485d4061ed659af0fd78a284c015f9b73661b41d6bab25604534

WORKDIR /app

# Install dependencies
RUN pip install --no-cache-dir \
    asyncpg \
    clickhouse-connect \
    httpx \
    asyncio

# Copy mirror script
COPY clickhouse-mirror.py .

# Run mirror service
CMD ["python", "clickhouse-mirror.py"]
