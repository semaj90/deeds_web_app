"""
Configuration management for Granite-Docling Worker
W-I9 profile configuration and environment settings
"""

import os
from typing import Optional
from pydantic_settings import BaseSettings
from pydantic import Field
from core.w_i9_profiler import get_w_i9_profile, W_I9Profile


class WorkerConfig(BaseSettings):
    """Worker configuration from environment variables"""

    # Application settings
    app_name: str = "granite-docling-worker"
    app_version: str = "1.0.0"
    debug: bool = Field(default=False, env="DEBUG")
    log_level: str = Field(default="INFO", env="LOG_LEVEL")

    # MinIO settings
    minio_endpoint: str = Field(default="localhost:9000", env="MINIO_ENDPOINT")
    minio_access_key: str = Field(default="minioadmin", env="MINIO_ACCESS_KEY")
    minio_secret_key: str = Field(default="minioadmin", env="MINIO_SECRET_KEY")
    minio_bucket: str = Field(default="documents", env="MINIO_BUCKET")
    minio_use_ssl: bool = Field(default=False, env="MINIO_USE_SSL")
    minio_parallel_streams: int = Field(default=4, env="MINIO_PARALLEL_STREAMS")

    # Redis settings
    redis_host: str = Field(default="localhost", env="REDIS_HOST")
    redis_port: int = Field(default=6379, env="REDIS_PORT")
    redis_db: int = Field(default=0, env="REDIS_DB")
    redis_password: Optional[str] = Field(default=None, env="REDIS_PASSWORD")
    redis_pool_size: int = Field(default=10, env="REDIS_POOL_SIZE")
    redis_cache_ttl: int = Field(default=604800, env="REDIS_CACHE_TTL")  # 7 days

    # GPU settings
    gpu_enabled: bool = Field(default=True, env="GPU_ENABLED")
    gpu_device_id: int = Field(default=0, env="GPU_DEVICE_ID")
    gpu_memory_fraction: float = Field(default=0.8, env="GPU_MEMORY_FRACTION")
    gpu_batch_size: int = Field(default=32, env="GPU_BATCH_SIZE")
    gpu_timeout_ms: int = Field(default=500, env="GPU_TIMEOUT_MS")

    # CPU settings
    cpu_batch_size: int = Field(default=16, env="CPU_BATCH_SIZE")
    cpu_threads: int = Field(default=4, env="CPU_THREADS")
    cpu_fallback_delay_ms: int = Field(default=500, env="CPU_FALLBACK_DELAY_MS")

    # Processing settings
    worker_threads: int = Field(default=12, env="WORKER_THREADS")
    batch_size: int = Field(default=32, env="BATCH_SIZE")
    page_classifier_confidence_threshold: float = Field(default=0.8, env="PAGE_CLASSIFIER_CONFIDENCE_THRESHOLD")
    heavy_roi_confidence_threshold: float = Field(default=0.7, env="HEAVY_ROI_CONFIDENCE_THRESHOLD")

    # Tesseract settings
    tesseract_path: str = Field(default="tesseract", env="TESSERACT_PATH")
    tesseract_threads: int = Field(default=4, env="TESSERACT_THREADS")
    tesseract_oem: int = Field(default=3, env="TESSERACT_OEM")  # 3 = LSTM + Legacy
    tesseract_psm: int = Field(default=3, env="TESSERACT_PSM")  # 3 = Fully automatic

    # Granite-Docling settings
    granite_model_path: str = Field(default="ibm/granite-docling-258m", env="GRANITE_MODEL_PATH")
    granite_max_image_size: int = Field(default=768, env="GRANITE_MAX_IMAGE_SIZE")

    # Chunking settings
    chunk_size_tokens: int = Field(default=512, env="CHUNK_SIZE_TOKENS")
    chunk_overlap_tokens: int = Field(default=50, env="CHUNK_OVERLAP_TOKENS")
    chunker_workers: int = Field(default=4, env="CHUNKER_WORKERS")

    # RAG settings
    embedding_model: str = Field(default="sentence-transformers/legal-bert-base-uncased", env="EMBEDDING_MODEL")
    bm25_k1: float = Field(default=1.5, env="BM25_K1")
    bm25_b: float = Field(default=0.75, env="BM25_B")
    r2_weight: float = Field(default=0.3, env="R2_WEIGHT")
    r3_weight: float = Field(default=0.7, env="R3_WEIGHT")

    # API settings
    api_host: str = Field(default="0.0.0.0", env="API_HOST")
    api_port: int = Field(default=8000, env="API_PORT")
    api_workers: int = Field(default=4, env="API_WORKERS")

    # Dashboard integration
    dashboard_sse_endpoint: str = Field(default="http://localhost:3000/api/document-processing/stream", env="DASHBOARD_SSE_ENDPOINT")
    dashboard_auth_token: Optional[str] = Field(default=None, env="DASHBOARD_AUTH_TOKEN")

    # TensorRT settings
    tensorrt_enabled: bool = Field(default=False, env="TENSORRT_ENABLED")
    tensorrt_engine_path: Optional[str] = Field(default=None, env="TENSORRT_ENGINE_PATH")

    # Windows-specific settings
    windows_native_build: bool = Field(default=True, env="WINDOWS_NATIVE_BUILD")
    use_wsl2: bool = Field(default=False, env="USE_WSL2")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False

    def get_w_i9_profile(self) -> W_I9Profile:
        """Get W-I9 profile with config overrides"""
        profile = get_w_i9_profile()

        # Apply config overrides
        profile.worker_threads = self.worker_threads
        profile.batch_size = self.batch_size
        profile.gpu_batch_size = self.gpu_batch_size
        profile.cpu_batch_size = self.cpu_batch_size
        profile.tesseract_threads = self.tesseract_threads
        profile.redis_pool_size = self.redis_pool_size
        profile.minio_parallel_streams = self.minio_parallel_streams

        return profile


def get_config() -> WorkerConfig:
    """Get configuration instance"""
    return WorkerConfig()


# Export config instance
config = get_config()
