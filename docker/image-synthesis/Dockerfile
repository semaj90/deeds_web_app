FROM python:3.10-slim

WORKDIR /app

# Install system dependencies for image libraries
RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Environment variables for performance
ENV PYTHONUNBUFFERED=1
ENV CUDA_VISIBLE_DEVICES=0

EXPOSE 5000

CMD ["python", "app.py"]
