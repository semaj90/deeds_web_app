"""Configuration settings for evidence processing pipeline."""

from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    """Application settings."""

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8001
    DEBUG: bool = False

    # Database
    DATABASE_URL: str = "postgresql://legal_admin:123456@localhost:5432/legal_ai_db"

    # RabbitMQ
    RABBITMQ_URL: str = "amqp://guest:guest@localhost:5672/"
    RABBITMQ_QUEUE_PREFIX: str = "evidence-pipeline"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # MinIO
    MINIO_URL: str = "http://localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET_DOCUMENTS: str = "evidence-documents"
    MINIO_BUCKET_PROCESSED: str = "evidence-processed"

    # Qdrant
    QDRANT_URL: str = "http://localhost:6333"
    QDRANT_COLLECTION: str = "evidence-embeddings"
    QDRANT_VECTOR_SIZE: int = 384

    # Ollama
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_EMBED_MODEL: str = "embeddinggemma:latest"

    # Tesseract
    TESSERACT_PATH: str = "tesseract"

    # Processing
    MAX_FILE_SIZE_MB: int = 50
    OCR_BATCH_SIZE: int = 5
    PARSING_BATCH_SIZE: int = 3
    EMBEDDING_BATCH_SIZE: int = 32
    INDEXING_BATCH_SIZE: int = 100
    CHUNK_SIZE: int = 512
    CHUNK_OVERLAP: int = 50
    MAX_RETRIES: int = 3
    RETRY_BACKOFF_BASE: float = 2.0

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:5176",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5176",
    ]

    # Logging
    LOG_LEVEL: str = "INFO"

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
