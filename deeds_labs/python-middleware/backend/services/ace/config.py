"""
Configuration for ACE (Agentic Context Engineering) system.
"""

import os
from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class FeatureVectorConfig:
    """Configuration for feature vector assembly."""
    total_dims: int = 1024
    llm_text_dims: int = 256
    vlm_layout_dims: int = 128
    web_rag_dims: int = 128
    tools_dims: int = 128
    phase_ast_dims: int = 192
    legal_flags_dims: int = 96
    runtime_dims: int = 96


@dataclass
class GoSIMDConfig:
    """Configuration for Go SIMD scorer."""
    host: str = "localhost"
    port: int = 8096
    timeout_ms: int = 5000
    batch_size: int = 100

    @property
    def url(self) -> str:
        return f"http://{self.host}:{self.port}"

    @property
    def score_endpoint(self) -> str:
        return f"{self.url}/score"

    @property
    def batch_score_endpoint(self) -> str:
        return f"{self.url}/batch_score"


@dataclass
class QdrantConfig:
    """Configuration for Qdrant vector database."""
    host: str = "localhost"
    port: int = 6333
    collection_name: str = "ace_embeddings"
    vector_size: int = 768

    @property
    def url(self) -> str:
        return f"http://{self.host}:{self.port}"


@dataclass
class PostgresConfig:
    """Configuration for PostgreSQL with pgvector."""
    host: str = "localhost"
    port: int = 5432
    database: str = "legal_ai"
    user: str = "postgres"
    password: str = ""

    @property
    def connection_string(self) -> str:
        return f"postgresql://{self.user}:{self.password}@{self.host}:{self.port}/{self.database}"


@dataclass
class MinIOConfig:
    """Configuration for MinIO object storage."""
    host: str = "localhost"
    port: int = 9000
    access_key: str = "minioadmin"
    secret_key: str = "minioadmin"
    bucket_name: str = "ace-documents"
    secure: bool = False

    @property
    def endpoint(self) -> str:
        return f"{self.host}:{self.port}"


@dataclass
class Neo4jConfig:
    """Configuration for Neo4j graph database."""
    host: str = "localhost"
    port: int = 7687
    user: str = "neo4j"
    password: str = "password"
    database: str = "neo4j"

    @property
    def uri(self) -> str:
        return f"bolt://{self.host}:{self.port}"


@dataclass
class OllamaConfig:
    """Configuration for Ollama LLM service."""
    host: str = "localhost"
    port: int = 11434
    model: str = "gemma3-legal:latest"
    embedding_model: str = "embeddinggemma"
    timeout_ms: int = 30000

    @property
    def url(self) -> str:
        return f"http://{self.host}:{self.port}"

    @property
    def generate_endpoint(self) -> str:
        return f"{self.url}/api/generate"

    @property
    def embed_endpoint(self) -> str:
        return f"{self.url}/api/embed"


@dataclass
class SelfHealingConfig:
    """Configuration for self-healing error engine."""
    svelte_check_command: str = "npx svelte-check --output json"
    max_errors_per_cluster: int = 100
    min_cluster_size: int = 3
    similarity_threshold: float = 0.7
    confidence_threshold: float = 0.8
    max_retries: int = 3
    rollback_on_failure: bool = True


@dataclass
class ContextAnchorConfig:
    """Configuration for context anchor management."""
    drift_threshold: float = 0.3
    max_history_size: int = 10
    persist_interval_sec: int = 60
    cleanup_after_hours: int = 24


@dataclass
class AceConfig:
    """Main configuration for ACE system."""
    feature_vector: FeatureVectorConfig = field(default_factory=FeatureVectorConfig)
    go_simd: GoSIMDConfig = field(default_factory=GoSIMDConfig)
    qdrant: QdrantConfig = field(default_factory=QdrantConfig)
    postgres: PostgresConfig = field(default_factory=PostgresConfig)
    minio: MinIOConfig = field(default_factory=MinIOConfig)
    neo4j: Neo4jConfig = field(default_factory=Neo4jConfig)
    ollama: OllamaConfig = field(default_factory=OllamaConfig)
    self_healing: SelfHealingConfig = field(default_factory=SelfHealingConfig)
    context_anchor: ContextAnchorConfig = field(default_factory=ContextAnchorConfig)

    @classmethod
    def from_env(cls) -> "AceConfig":
        """Create configuration from environment variables."""
        return cls(
            go_simd=GoSIMDConfig(
                host=os.getenv("GO_SIMD_HOST", "localhost"),
                port=int(os.getenv("GO_SIMD_PORT", "8096")),
            ),
            qdrant=QdrantConfig(
                host=os.getenv("QDRANT_HOST", "localhost"),
                port=int(os.getenv("QDRANT_PORT", "6333")),
            ),
            postgres=PostgresConfig(
                host=os.getenv("POSTGRES_HOST", "localhost"),
                port=int(os.getenv("POSTGRES_PORT", "5432")),
                database=os.getenv("POSTGRES_DB", "legal_ai"),
                user=os.getenv("POSTGRES_USER", "postgres"),
                password=os.getenv("POSTGRES_PASSWORD", ""),
            ),
            minio=MinIOConfig(
                host=os.getenv("MINIO_HOST", "localhost"),
                port=int(os.getenv("MINIO_PORT", "9000")),
                access_key=os.getenv("MINIO_ACCESS_KEY", "minioadmin"),
                secret_key=os.getenv("MINIO_SECRET_KEY", "minioadmin"),
            ),
            neo4j=Neo4jConfig(
                host=os.getenv("NEO4J_HOST", "localhost"),
                port=int(os.getenv("NEO4J_PORT", "7687")),
                user=os.getenv("NEO4J_USER", "neo4j"),
                password=os.getenv("NEO4J_PASSWORD", "password"),
            ),
            ollama=OllamaConfig(
                host=os.getenv("OLLAMA_HOST", "localhost"),
                port=int(os.getenv("OLLAMA_PORT", "11434")),
                model=os.getenv("OLLAMA_MODEL", "gemma3-legal:latest"),
            ),
        )


# Global configuration instance
_config: Optional[AceConfig] = None


def get_config() -> AceConfig:
    """Get the global ACE configuration."""
    global _config
    if _config is None:
        _config = AceConfig.from_env()
    return _config


def set_config(config: AceConfig) -> None:
    """Set the global ACE configuration."""
    global _config
    _config = config
