"""
RAG+KAG Gateway Configuration
Loads from environment with sensible defaults for local development
"""
import os
from dotenv import load_dotenv

load_dotenv()

# Database
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:pass@127.0.0.1:5434/legal")
PG_HOST = os.getenv("PGHOST", "127.0.0.1")
PG_PORT = int(os.getenv("PGPORT", "5434"))
PG_USER = os.getenv("PGUSER", "user")
PG_PASSWORD = os.getenv("PGPASSWORD", "pass")
PG_DATABASE = os.getenv("PGDATABASE", "legal")

# Vector stores
QDRANT_URL = os.getenv("QDRANT_URL", "http://127.0.0.1:6333")
QDRANT_COLLECTION = os.getenv("QDRANT_COLLECTION", "phase76_knowledge_base")
QDRANT_AST_COLLECTION = os.getenv("QDRANT_AST_COLLECTION", "phase72_ast_knowledge_base")

# Cache
REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379")

# LLM
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
OLLAMA_EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "embeddinggemma:latest")
OLLAMA_CHAT_MODEL = os.getenv("OLLAMA_CHAT_MODEL", "gemma3-legal:latest")

# Embedding dimension
EMBED_DIM = 768

# API
API_PORT = int(os.getenv("API_PORT", "8098"))  # 8099 reserved for TRT-LLM Triton
API_HOST = os.getenv("API_HOST", "0.0.0.0")
