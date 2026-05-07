import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

// Development fallback defaults (localhost)
const DEV = {
  DATABASE_URL: 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db',
  REDIS_URL: 'redis://localhost:6379',
  QDRANT_URL: 'http://localhost:6333',
  RABBITMQ_URL: 'amqp://guest:guest@localhost:5672',
  OLLAMA_URL: 'http://localhost:11434',
  TRITON_URL: 'http://localhost:8000',
  TRITON_VLM_MODEL: 'gemma_vlm_ensemble',
  TRITON_VISION_MODEL: 'siglip_vision',
  TRITON_RERANKER_MODEL: 'bge-reranker',
  PUBLIC_API_URL: 'http://localhost:5173',
  MINIO_ENDPOINT: 'localhost',
  MINIO_PORT: '9000',
  MINIO_ACCESS_KEY: 'admin',
  MINIO_SECRET_KEY: 'password',
  MINIO_USE_SSL: 'false',
  MINIO_EVIDENCE_BUCKET: 'legal-evidence',
  // Auth secrets — MUST be overridden via real env vars in production
  JWT_SECRET: 'dev-only-jwt-secret-change-in-production',
  SERVICE_AUTH_TOKEN: 'dev-only-service-token',
};

function qdrantUrlFromParts(): string | undefined {
  const host = privateEnv.QDRANT_HOST;
  if (!host) return undefined;
  const port = privateEnv.QDRANT_PORT ?? '6333';
  return `http://${host}:${port}`;
}

export const ENV = {
  DATABASE_URL: privateEnv.DATABASE_URL ?? privateEnv.POSTGRES_URL ?? DEV.DATABASE_URL,
  REDIS_URL: privateEnv.REDIS_URL ?? DEV.REDIS_URL,
  QDRANT_URL: privateEnv.QDRANT_URL ?? qdrantUrlFromParts() ?? DEV.QDRANT_URL,
  RABBITMQ_URL: privateEnv.RABBITMQ_URL ?? DEV.RABBITMQ_URL,
  OLLAMA_BASE_URL: privateEnv.OLLAMA_BASE_URL ?? privateEnv.OLLAMA_URL ?? DEV.OLLAMA_URL,
  /** Legal reasoning / chat / tool-calling model (unified GRPO legal + VLM, 5.3GB) */
  OLLAMA_CHAT_MODEL:
    privateEnv.OLLAMA_CHAT_MODEL ?? privateEnv.OLLAMA_MODEL ?? 'gemma4-legal-vlm:latest',
  /** Vision-language model for image/document understanding (same unified model) */
  OLLAMA_VLM_MODEL:
    privateEnv.OLLAMA_VLM_MODEL ?? privateEnv.GEMMA4_MODEL ?? 'gemma4-legal-vlm:latest',
  /** Embedding model (768-dim, primary) */
  OLLAMA_EMBED_MODEL: privateEnv.OLLAMA_EMBED_MODEL ?? 'embeddinggemma:latest',
  /** Gemma 4 unified legal+VLM — tool calling + thinking + vision (5.3GB) */
  GEMMA4_MODEL: privateEnv.GEMMA4_MODEL ?? 'gemma4-legal-vlm:latest',
  /**
   * Structured-call / function-calling translator.
   * Defaults to the unified Gemma 4 model until a lighter FunctionGemma
   * Ollama tag is available. Override with FUNCTION_GEMMA_MODEL=functiongemma:latest
   * once the 270M model is pulled: `ollama pull functiongemma:latest`
   */
  FUNCTION_GEMMA_MODEL:
    privateEnv.FUNCTION_GEMMA_MODEL ?? privateEnv.GEMMA4_MODEL ?? 'gemma4-legal-vlm:latest',
  /** Granite-Docling-258M for layout-aware document extraction (Ollama multimodal) */
  GRANITE_DOCLING_MODEL: privateEnv.GRANITE_DOCLING_MODEL ?? 'ibm/granite-docling:258m',
  GRANITE_DOCLING_ENABLED: (privateEnv.GRANITE_DOCLING_ENABLED ?? 'true') === 'true',
  PUBLIC_API_URL: publicEnv.PUBLIC_API_URL ?? DEV.PUBLIC_API_URL,
  MINIO_ENDPOINT: privateEnv.MINIO_ENDPOINT ?? DEV.MINIO_ENDPOINT,
  MINIO_PORT: privateEnv.MINIO_PORT ?? DEV.MINIO_PORT,
  MINIO_ACCESS_KEY: privateEnv.MINIO_ACCESS_KEY ?? DEV.MINIO_ACCESS_KEY,
  MINIO_SECRET_KEY: privateEnv.MINIO_SECRET_KEY ?? DEV.MINIO_SECRET_KEY,
  MINIO_USE_SSL: privateEnv.MINIO_USE_SSL ?? DEV.MINIO_USE_SSL,
  MINIO_EVIDENCE_BUCKET: privateEnv.MINIO_EVIDENCE_BUCKET ?? DEV.MINIO_EVIDENCE_BUCKET,
  // gRPC services
  EMBEDDING_GRPC_URL: privateEnv.EMBEDDING_GRPC_URL ?? '127.0.0.1:50051',
  EMBEDDING_GRPC_ENABLED: (privateEnv.EMBEDDING_GRPC_ENABLED ?? 'false') === 'true',
  RETRIEVAL_GRPC_URL: privateEnv.RETRIEVAL_GRPC_URL ?? '127.0.0.1:50053',
  RETRIEVAL_GRPC_ENABLED: (privateEnv.RETRIEVAL_GRPC_ENABLED ?? 'false') === 'true',
  /** Topology search engine — detached Node.js server (port 8101) */
  TOPOLOGY_SEARCH_URL: privateEnv.TOPOLOGY_SEARCH_URL ?? 'http://127.0.0.1:8101',
  /** Trace MCP server (trace-mcp-server.ts, Streamable HTTP, port 8788) */
  TRACE_MCP_URL: privateEnv.TRACE_MCP_URL ?? 'http://localhost:8788',
  /** Docling VLM service (Docker, layout-aware OCR, port 8085 by default) */
  DOCLING_SERVICE_URL: privateEnv.DOCLING_SERVICE_URL ?? 'http://localhost:8085',
  /** Go retrieval service HTTP REST API (port 8100) — lighter weight alternative to gRPC */
  RETRIEVAL_HTTP_URL: privateEnv.RETRIEVAL_HTTP_URL ?? 'http://localhost:8100',
  RETRIEVAL_HTTP_ENABLED: (privateEnv.RETRIEVAL_HTTP_ENABLED ?? 'false') === 'true',
  CHR97_GRPC_URL: privateEnv.CHR97_GRPC_URL ?? '127.0.0.1:50055',
  CHR97_GRPC_ENABLED: (privateEnv.CHR97_GRPC_ENABLED ?? 'false') === 'true',
  TOOL_GRPC_URL: privateEnv.TOOL_GRPC_URL ?? '127.0.0.1:50057',
  TOOL_GRPC_ENABLED: (privateEnv.TOOL_GRPC_ENABLED ?? 'false') === 'true',
  TOOL_ROUTER_GRPC_URL: privateEnv.TOOL_ROUTER_GRPC_URL ?? '127.0.0.1:50058',
  /** GraphML gRPC service (GPU graph analytics — PyTorch/CUDA, port 50056) */
  GRAPH_ML_GRPC_URL: privateEnv.GRAPH_ML_GRPC_URL ?? '127.0.0.1:50056',
  GRAPH_ML_GRPC_ENABLED: (privateEnv.GRAPH_ML_GRPC_ENABLED ?? 'false') === 'true',
  /** CodeIntel gRPC service (cluster summaries, chunk lookup, job status, port 50058) */
  CODEINTEL_GRPC_URL: privateEnv.CODEINTEL_GRPC_URL ?? '127.0.0.1:50058',
  CODEINTEL_GRPC_ENABLED: (privateEnv.CODEINTEL_GRPC_ENABLED ?? 'false') === 'true',
  /** GenerationService gRPC (orphaned — zero consumers; port 50052 reserved) */
  GENERATION_GRPC_URL: privateEnv.GENERATION_GRPC_URL ?? 'http://localhost:50052',
  GENERATION_SERVICE_URL: privateEnv.GENERATION_SERVICE_URL ?? 'http://localhost:50052',
  // LangExtract — pure-TS native extractor (langextract/native.ts) is now the default.
  // The Python FastAPI service (phase66-langextract :8095) is DECOMMISSIONED:
  //   - 11/11 native tests pass (citations, statutes, case names, money, dates, persons, etc.)
  //   - No network hop, no GIL, ~10× faster than the Python service for typical legal text
  //   - To re-enable the Python service for benchmarking: set LANGEXTRACT_ENABLED=true
  //     AND LANGEXTRACT_NATIVE=false explicitly.
  // The Python service remains in docker/langextract-optimized/ as an archived reference
  // until the next housekeeping pass — see next_steps for archive plan.
  LANGEXTRACT_ENABLED:
    (privateEnv.LANGEXTRACT_ENABLED ?? privateEnv.MINIO_SIMD_ENABLED ?? 'false') === 'true',
  LANGEXTRACT_URL:
    privateEnv.LANGEXTRACT_URL?.trim() || privateEnv.LANGEXTRACT_API_URL?.trim() || '',
  /** Native TS langextract is the default. Override to 'false' to fall back to the Python service. */
  LANGEXTRACT_NATIVE:
    (privateEnv.LANGEXTRACT_NATIVE ?? 'true') === 'true' ? 'true' : 'false',
  // QUIC/NATS embedding transport
  EMBEDDING_QUIC_ENABLED:
    (privateEnv.EMBEDDING_QUIC_ENABLED ?? privateEnv.QUIC_ENABLED ?? 'false') === 'true',
  NATS_URL: privateEnv.NATS_URL ?? 'nats://127.0.0.1:4222',
  // TensorRT-LLM inference (main gpu profile exposes 8099; Triton uses TRITON_URL on 8000)
  TENSORRT_URL:
    privateEnv.TENSORRT_URL ?? privateEnv.TENSORRT_SERVICE_URL ?? 'http://localhost:8099',
  TRITON_URL: privateEnv.TRITON_URL ?? DEV.TRITON_URL,
  // Inference cascade: Bifrost L2 cache (:3040) → TurboQuant (:8090) → VLM (:8085) → LiteRT (:8070)
  BIFROST_URL: privateEnv.BIFROST_URL ?? 'http://localhost:3040',
  TURBOQUANT_BASE_URL: privateEnv.TURBOQUANT_BASE_URL ?? 'http://localhost:8090',
  VLM_BASE_URL: privateEnv.VLM_BASE_URL ?? 'http://localhost:8085',
  LITERT_BASE_URL: privateEnv.LITERT_BASE_URL ?? 'http://localhost:8070',
  TRITON_LLM_MODEL: privateEnv.TRITON_LLM_MODEL ?? 'legal-llm',
  TRITON_VLM_MODEL: privateEnv.TRITON_VLM_MODEL ?? DEV.TRITON_VLM_MODEL,
  TRITON_VISION_MODEL: privateEnv.TRITON_VISION_MODEL ?? DEV.TRITON_VISION_MODEL,
  TRITON_RERANKER_MODEL: privateEnv.TRITON_RERANKER_MODEL ?? DEV.TRITON_RERANKER_MODEL,
  // Neo4j graph database
  NEO4J_URI: privateEnv.NEO4J_URI ?? privateEnv.NEO4J_URL ?? 'bolt://localhost:7687',
  NEO4J_USER: privateEnv.NEO4J_USER ?? privateEnv.NEO4J_USERNAME ?? 'neo4j',
  NEO4J_PASSWORD: privateEnv.NEO4J_PASSWORD ?? privateEnv.NEO4J_PASS ?? 'password',
  // Neo4j browser HTTP API (used by memory-mirror, couchdb sync — separate from bolt)
  NEO4J_HTTP_URL: privateEnv.NEO4J_HTTP_URL ?? 'http://localhost:7474',
  // CouchDB document store — default password matches docker-compose.yml
  // (`COUCHDB_PASSWORD: ${COUCHDB_PASSWORD:-legal_ai_pass}`). Override via
  // COUCHDB_URL or COUCHDB_PASSWORD in .env.production.
  COUCHDB_URL:
    privateEnv.COUCHDB_URL
    ?? (privateEnv.COUCHDB_PASSWORD
        ? `http://admin:${privateEnv.COUCHDB_PASSWORD}@localhost:5984`
        : 'http://admin:legal_ai_pass@localhost:5984'),
  // Web search (optional — SearXNG first, DuckDuckGo fallback)
  SEARXNG_URL: privateEnv.SEARXNG_URL ?? 'http://localhost:8888', // Docker: 8888→8080 internal
  // Obsidian Local REST API (optional — vault sync via obsidian-local-rest-api plugin)
  OBSIDIAN_URL: privateEnv.OBSIDIAN_URL ?? 'https://127.0.0.1:27124',
  OBSIDIAN_API_KEY: privateEnv.OBSIDIAN_API_KEY ?? '',
  // Absolute path to the Obsidian vault root (needed for chokidar watcher)
  OBSIDIAN_VAULT_PATH: privateEnv.OBSIDIAN_VAULT_PATH ?? '',
  // Firecrawl Web Scraping API (optional — used for YouTube transcript extraction + web crawling)
  FIRECRAWL_API_KEY: privateEnv.FIRECRAWL_API_KEY ?? '',
  // GitHub API — Lane 3 deep research (issues, code, repo search)
  GITHUB_TOKEN: privateEnv.GITHUB_TOKEN ?? '',
  // Reddit OAuth2 — Lane 3 research (keyword search, quality posts)
  REDDIT_CLIENT_ID: privateEnv.REDDIT_CLIENT_ID ?? '',
  REDDIT_CLIENT_SECRET: privateEnv.REDDIT_CLIENT_SECRET ?? '',
  REDDIT_USERNAME: privateEnv.REDDIT_USERNAME ?? '',
  // Legal Gateway microservice (case + document fetch proxy)
  LEGAL_GATEWAY_URL: privateEnv.LEGAL_GATEWAY_URL ?? 'http://localhost:8080',
  // Enhanced RAG microservice + dev frontend base (used by CHR97 module)
  ENHANCED_RAG_URL: privateEnv.ENHANCED_RAG_URL ?? 'http://localhost:8094',
  FRONTEND_BASE_URL: privateEnv.FRONTEND_BASE_URL ?? 'http://localhost:5174',
  // vLLM OpenAI-compatible inference (alternative to Triton/TurboQuant)
  VLLM_URL: privateEnv.VLLM_URL ?? 'http://localhost:8001',
  // Context7 MCP server (library docs lookup tool)
  CONTEXT7_MCP_URL: privateEnv.CONTEXT7_MCP_URL ?? 'http://localhost:4000',
  // MinIO full URL (for direct HTTP calls — use MINIO_ENDPOINT/PORT for the SDK)
  MINIO_URL: privateEnv.MINIO_URL ?? 'http://localhost:9000',
  // Go Legal Library Search Service (parallel fan-out: citation + FTS + pgvector + Qdrant)
  GO_SEARCH_URL: privateEnv.GO_SEARCH_URL ?? '',
  GO_SEARCH_GRPC_URL: privateEnv.GO_SEARCH_GRPC_URL ?? '127.0.0.1:50055',
  // QUIC/HTTP3 proxy health endpoint (Caddy on :5178 by default)
  QUIC_HEALTH_URL: privateEnv.QUIC_HEALTH_URL ?? 'http://127.0.0.1:5178/health',
  // FastAPI middleware (optional)
  FASTAPI_URL: privateEnv.FASTAPI_URL ?? 'http://localhost:8001',
  // Web Push (VAPID) — generate with: npx web-push generate-vapid-keys --json
  VAPID_PUBLIC_KEY: publicEnv.PUBLIC_VAPID_KEY ?? privateEnv.VAPID_PUBLIC_KEY ?? '',
  VAPID_PRIVATE_KEY: privateEnv.VAPID_PRIVATE_KEY ?? '',
  VAPID_CONTACT: privateEnv.VAPID_CONTACT ?? 'mailto:admin@deeds-legal.ai',
  // ntfy.sh push notifications
  NTFY_URL: privateEnv.NTFY_URL ?? 'https://ntfy.sh',
  NTFY_TOPIC: privateEnv.NTFY_TOPIC ?? 'deeds-legal-alerts',
  // Email (Nodemailer — Gmail SMTP or custom)
  SMTP_HOST: privateEnv.SMTP_HOST ?? 'smtp.gmail.com',
  SMTP_PORT: Number(privateEnv.SMTP_PORT ?? '587'),
  SMTP_USER: privateEnv.SMTP_USER ?? '',
  SMTP_PASS: privateEnv.SMTP_PASS ?? '',
  SMTP_FROM: privateEnv.SMTP_FROM ?? 'Deeds Legal AI <noreply@deeds-legal.ai>',
  // Langfuse LLM observability (docker/langfuse.yml — port 3030)
  LANGFUSE_PUBLIC_KEY: privateEnv.LANGFUSE_PUBLIC_KEY ?? '',
  LANGFUSE_SECRET_KEY: privateEnv.LANGFUSE_SECRET_KEY ?? '',
  LANGFUSE_HOST: privateEnv.LANGFUSE_HOST ?? 'http://localhost:3030',
  LANGFUSE_ENABLED: (privateEnv.LANGFUSE_ENABLED ?? 'false') === 'true',
  // Bifrost semantic cache gateway settings (URL already defined above in inference cascade)
  BIFROST_ENABLED: (privateEnv.BIFROST_ENABLED ?? 'false') === 'true',
  // OpenAI-compatible base URL (via Bifrost → Ollama) for pgai, LangChain, external tools
  OPENAI_BASE_URL: privateEnv.OPENAI_BASE_URL ?? 'http://localhost:3040/v1',
  OPENAI_API_KEY: privateEnv.OPENAI_API_KEY ?? 'dummy',
  // Auth secrets
  JWT_SECRET: privateEnv.JWT_SECRET ?? DEV.JWT_SECRET,
  SERVICE_AUTH_TOKEN: privateEnv.SERVICE_AUTH_TOKEN ?? DEV.SERVICE_AUTH_TOKEN,
  // MinIO library bucket
  MINIO_LIBRARY_BUCKET: privateEnv.MINIO_LIBRARY_BUCKET ?? 'legal-library',
  // Whisper persistent server (whisper-server.exe HTTP mode — eliminates cold start)
  WHISPER_SERVER_URL: privateEnv.WHISPER_SERVER_URL ?? 'http://127.0.0.1:8178',
  WHISPER_USE_SERVER: (privateEnv.WHISPER_USE_SERVER ?? 'false') === 'true',
  // Whisper CLI
  WHISPER_PATH: privateEnv.WHISPER_PATH ?? 'whisper',
  WHISPER_MODEL: privateEnv.WHISPER_MODEL ?? 'base',
  WHISPER_DEVICE: privateEnv.WHISPER_DEVICE ?? 'cpu',
  FFMPEG_PATH: privateEnv.FFMPEG_PATH || null,
  // Timeouts
  ACE_EMBED_BATCH_TIMEOUT_MS: Number(privateEnv.ACE_EMBED_BATCH_TIMEOUT_MS ?? '20000'),
  // Python executable for CUDA clustering scripts (phase89-cuda-clustering.py etc.)
  // Needs PyTorch + cupy — use project .venv (torch 2.7.0+cu128).
  // Dev: set PYTHON_PATH=C:\Users\james\Videos\deeds-web-app\.venv\Scripts\python.exe in .env
  PYTHON_PATH: privateEnv.PYTHON_PATH ?? 'python',
  // FastAPI codebase-index microservice (port 8090)
  CODEBASE_INDEX_URL: privateEnv.CODEBASE_INDEX_URL ?? 'http://localhost:8090',
  // Orchestrator service (port 8102)
  ORCHESTRATOR_URL: privateEnv.ORCHESTRATOR_URL ?? 'http://localhost:8102',
  // CUDA/GPU compute service (port 8765)
  CUDA_SERVICE_URL: privateEnv.CUDA_SERVICE_URL ?? 'http://localhost:8765',
  // LangGraph synthesis service (Docker GPU profile, port 8091)
  LANGGRAPH_URL: privateEnv.LANGGRAPH_URL ?? 'http://localhost:8091',
  LANGGRAPH_ENABLED: (privateEnv.LANGGRAPH_ENABLED ?? 'false') === 'true',
  // RAG microservice (port 8103)
  RAG_SERVICE_URL: privateEnv.RAG_SERVICE_URL ?? 'http://localhost:8103',
  // Redis host + port (for ioredis explicit config)
  REDIS_HOST: privateEnv.REDIS_HOST ?? 'localhost',
  REDIS_PORT: Number(privateEnv.REDIS_PORT ?? '6379'),
  // RabbitMQ management API
  RABBITMQ_MGMT_URL: privateEnv.RABBITMQ_MGMT_URL ?? 'http://localhost:15672',
  RABBITMQ_MGMT_AUTH: (() => {
    const user = privateEnv.RABBITMQ_MGMT_USER ?? privateEnv.RABBITMQ_USER ?? 'guest';
    const pass = privateEnv.RABBITMQ_MGMT_PASS ?? privateEnv.RABBITMQ_PASS ?? 'guest';
    return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
  })(),
  // Node environment
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  /** Development bypass auth (Sprint 6/Phase 76) */
  DEV_BYPASS_AUTH: (privateEnv.DEV_BYPASS_AUTH ?? 'false') === 'true',
};
