FROM python:3.11-slim

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
