import os
from dotenv import load_dotenv

load_dotenv()

QDRANT_URL = os.getenv("QDRANT_URL", "http://127.0.0.1:6333")
QDRANT_COLLECTION = os.getenv("QDRANT_COLLECTION", "phase76_knowledge_base")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:pass@127.0.0.1:5434/legal")
REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379")

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
OLLAMA_EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "embeddinggemma:latest")
OLLAMA_CHAT_MODEL = os.getenv("OLLAMA_CHAT_MODEL", "gemma3-legal:latest")

EMBED_DIM = 768
