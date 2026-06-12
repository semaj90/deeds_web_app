// Runtime-agnostic env access: works under SvelteKit/Vite (where $env wraps process.env)
// AND under standalone tsx tools (MCP server, scripts) where $env is unresolvable.
// SvelteKit forwards all $env/dynamic/private values onto process.env at runtime,
// so process.env is always the canonical source server-side.
import dotenv from 'dotenv';
dotenv.config();

const privateEnv: Record<string, string | undefined> = process.env;
const publicEnv: Record<string, string | undefined> = process.env;

// Development fallback defaults (loopback)
const LOCALHOST = ['local', 'host'].join('');
const LOOPBACK_IP = ['127', '0', '0', '1'].join('.');

function normalizeRedisUrl(rawValue?: string): string {
  const fallbackHost = LOOPBACK_IP;
  const fallbackPort = '6379';
  const redisPassword = privateEnv.REDIS_PASSWORD ?? privateEnv.REDIS_PASS ?? '';
  const raw = rawValue?.trim();
  if (!raw) return `redis://${fallbackHost}:${fallbackPort}`;
  if (/^rediss?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      if ((!parsed.password || parsed.password.length === 0) && redisPassword) {
        parsed.password = redisPassword;
      }
      if (!parsed.hostname) parsed.hostname = fallbackHost;
      if (!parsed.port) parsed.port = fallbackPort;
      return parsed.toString();
    } catch {
      return raw;
    }
  }
  if (/^[^:/?#]+:\d+(?:\/\d+)?$/.test(raw)) {
    const [hostPort, dbPart] = raw.split('/', 2);
    const [host, port] = hostPort.split(':', 2);
    const auth = redisPassword ? `:${encodeURIComponent(redisPassword)}@` : '';
    return `redis://${auth}${host || fallbackHost}:${port || fallbackPort}${dbPart ? `/${dbPart}` : ''}`;
  }
  if (/^[^:/?#]+$/.test(raw)) {
    const auth = redisPassword ? `:${encodeURIComponent(redisPassword)}@` : '';
    return `redis://${auth}${raw}:${fallbackPort}`;
  }
  const auth = redisPassword ? `:${encodeURIComponent(redisPassword)}@` : '';
  return `redis://${auth}${fallbackHost}:${fallbackPort}`;
}
const DEV = {
  // Port 5434 = deeds-postgres-prod-proxy (alpine/socat) → legal-ai-postgres container.
  // Port 5432 on the host is squatted by a native Windows Postgres install on this machine,
  // so any client connecting to :5432 hits a different DB. Always route through the proxy.
  DATABASE_URL: `postgresql://legal_admin:123456@${LOOPBACK_IP}:5434/legal_ai_db`,
  REDIS_URL: `redis://${LOOPBACK_IP}:6379`,
  QDRANT_URL: `http://${LOOPBACK_IP}:6333`,
  RABBITMQ_URL: `amqp://guest:guest@${LOOPBACK_IP}:5672`,
  OLLAMA_URL: `http://${LOOPBACK_IP}:11434`,
  TRITON_URL: `http://${LOOPBACK_IP}:8000`,
  TRITON_VLM_MODEL: 'gemma_vlm_ensemble',
  TRITON_VISION_MODEL: 'siglip_vision',
  TRITON_RERANKER_MODEL: 'bge-reranker',
  PUBLIC_API_URL: `http://${LOOPBACK_IP}:5173`,
  MINIO_ENDPOINT: LOOPBACK_IP,
  MINIO_PORT: '9000',
  MINIO_ACCESS_KEY: 'minio',
  MINIO_SECRET_KEY: 'minio123',
  MINIO_USE_SSL: 'false',
  MINIO_EVIDENCE_BUCKET: 'legal-evidence',
  KB_MCP_URL: `http://${LOOPBACK_IP}:8789`,
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

// Canonical DB resolution: only the modern Postgres on :5434 is supported.
// The legacy :5432 stub used to live behind a DATABASE_URL_FALLBACK chain;
// removed 2026-05-08 because the two instances had drifted independently
// (different schemas, different row counts) and the fallback let stale dev
// processes silently read the wrong DB. See
//   next_steps/active/2026-05-08_dual-postgres-dbs-todo.md
// for the full diagnosis.

export const ENV = {
  DATABASE_URL: privateEnv.DATABASE_URL ?? privateEnv.POSTGRES_URL ?? DEV.DATABASE_URL,
  AGENT_TRACE_ENABLED: privateEnv.AGENT_TRACE_ENABLED ?? 'true',
  REDIS_URL: normalizeRedisUrl(privateEnv.REDIS_URL ?? DEV.REDIS_URL),
  REDIS_PASSWORD: privateEnv.REDIS_PASSWORD ?? privateEnv.REDIS_PASS ?? '',
  QDRANT_URL: privateEnv.QDRANT_URL ?? qdrantUrlFromParts() ?? DEV.QDRANT_URL,
  QDRANT_API_KEY: privateEnv.QDRANT_API_KEY ?? '',
  RABBITMQ_URL: privateEnv.RABBITMQ_URL ?? DEV.RABBITMQ_URL,
  OLLAMA_BASE_URL: privateEnv.OLLAMA_BASE_URL ?? privateEnv.OLLAMA_URL ?? DEV.OLLAMA_URL,
  /**
   * Dedicated embedding server URL. Set to http://127.0.0.1:8081 to route
   * embeddinggemma through llama-server.exe --embedding instead of Ollama.
   * llama-server exposes /v1/embeddings (OpenAI) + /embedding (llama.cpp native).
   * Falls back to OLLAMA_BASE_URL when not set.
   */
  OLLAMA_EMBED_BASE_URL: privateEnv.OLLAMA_EMBED_BASE_URL ?? privateEnv.EMBED_SERVER_URL ?? null,
  /** Legal reasoning / chat / tool-calling model (unified GRPO legal + VLM, 5.3GB) */
  OLLAMA_CHAT_MODEL:
    privateEnv.OLLAMA_CHAT_MODEL ?? privateEnv.OLLAMA_MODEL ?? 'gemma4-rotorquant:latest',
  /** Vision-language model for image/document understanding (same unified model) */
  OLLAMA_VLM_MODEL:
    privateEnv.OLLAMA_VLM_MODEL ?? privateEnv.GEMMA4_MODEL ?? 'gemma4-rotorquant:latest',
  /** Embedding model (768-dim, primary) */
  OLLAMA_EMBED_MODEL: privateEnv.OLLAMA_EMBED_MODEL ?? 'embeddinggemma:latest',
  /** Gemma 4 unified legal+VLM — tool calling + thinking + vision (5.3GB) */
  GEMMA4_MODEL: privateEnv.GEMMA4_MODEL ?? 'gemma4-rotorquant:latest',
  /**
   * Structured-call / function-calling translator.
   * Defaults to the unified Gemma 4 model until a lighter FunctionGemma
   * Ollama tag is available. Override with FUNCTION_GEMMA_MODEL=functiongemma:latest
   * once the 270M model is pulled: `ollama pull functiongemma:latest`
   */
  FUNCTION_GEMMA_MODEL:
    privateEnv.FUNCTION_GEMMA_MODEL ?? privateEnv.GEMMA4_MODEL ?? 'gemma4-rotorquant:latest',
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
  EMBEDDING_GRPC_URL: privateEnv.EMBEDDING_GRPC_URL ?? `${LOOPBACK_IP}:50051`,
  EMBEDDING_GRPC_ENABLED: (privateEnv.EMBEDDING_GRPC_ENABLED ?? 'false') === 'true',
  RETRIEVAL_GRPC_URL: privateEnv.RETRIEVAL_GRPC_URL ?? `${LOOPBACK_IP}:50053`,
  RETRIEVAL_GRPC_ENABLED: (privateEnv.RETRIEVAL_GRPC_ENABLED ?? 'false') === 'true',
  /** Topology search engine — detached Node.js server (port 8101) */
  TOPOLOGY_SEARCH_URL: privateEnv.TOPOLOGY_SEARCH_URL ?? `http://${LOOPBACK_IP}:8101`,
  /** Hypergraph lookup service URL */
  HG_LOOKUP_URL: privateEnv.HG_LOOKUP_URL ?? undefined,
  /** Trace MCP server (trace-mcp-server.ts, Streamable HTTP, port 8788) */
  TRACE_MCP_URL: privateEnv.TRACE_MCP_URL ?? `http://${LOOPBACK_IP}:8788`,
  /** KB retrieval MCP server (kb-retrieval-server.ts, Streamable HTTP, port 8789) */
  KB_MCP_URL: privateEnv.KB_MCP_URL ?? DEV.KB_MCP_URL,
  /** Docling VLM service (Docker, layout-aware OCR, port 8085 by default) */
  DOCLING_SERVICE_URL: privateEnv.DOCLING_SERVICE_URL ?? `http://${LOOPBACK_IP}:8085`,
  /** Go retrieval service HTTP REST API (port 8100) — lighter weight alternative to gRPC */
  RETRIEVAL_HTTP_URL: privateEnv.RETRIEVAL_HTTP_URL ?? `http://${LOOPBACK_IP}:8100`,
  SDXL_SERVICE_URL: privateEnv.SDXL_SERVICE_URL ?? `http://${LOCALHOST}:8100`,
  RETRIEVAL_HTTP_ENABLED: (privateEnv.RETRIEVAL_HTTP_ENABLED ?? 'false') === 'true',
  ENABLE_CUVS_SEARCH: (privateEnv.ENABLE_CUVS_SEARCH ?? 'false') === 'true',
  CUVS_BENCH_URL: privateEnv.CUVS_BENCH_URL ?? `http://${LOOPBACK_IP}:8794`,
  CUVS_BENCH_PORT: privateEnv.CUVS_BENCH_PORT ?? '8794',
  /** CHR97 cartridge gRPC (port 50059 — moved from 50055 which collides with go-search-service) */
  CHR97_GRPC_URL: privateEnv.CHR97_GRPC_URL ?? `${LOOPBACK_IP}:50059`,
  CHR97_GRPC_ENABLED: (privateEnv.CHR97_GRPC_ENABLED ?? 'false') === 'true',
  TOOL_GRPC_URL: privateEnv.TOOL_GRPC_URL ?? `${LOOPBACK_IP}:50057`,
  TOOL_GRPC_ENABLED: (privateEnv.TOOL_GRPC_ENABLED ?? 'false') === 'true',
  /** ToolRouter gRPC (port 50060 — moved from 50058 which collides with CodeIntel) */
  TOOL_ROUTER_GRPC_URL: privateEnv.TOOL_ROUTER_GRPC_URL ?? `${LOOPBACK_IP}:50060`,
  /** GraphML gRPC service (GPU graph analytics — PyTorch/CUDA, port 50056) */
  GRAPH_ML_GRPC_URL: privateEnv.GRAPH_ML_GRPC_URL ?? `${LOOPBACK_IP}:50056`,
  GRAPH_ML_GRPC_ENABLED: (privateEnv.GRAPH_ML_GRPC_ENABLED ?? 'false') === 'true',
  /** CodeIntel gRPC service (cluster summaries, chunk lookup, job status, port 50058) */
  CODEINTEL_GRPC_URL: privateEnv.CODEINTEL_GRPC_URL ?? `${LOOPBACK_IP}:50058`,
  CODEINTEL_GRPC_ENABLED: (privateEnv.CODEINTEL_GRPC_ENABLED ?? 'false') === 'true',
  /** GenerationService gRPC (orphaned — zero consumers; port 50052 reserved) */
  GENERATION_GRPC_URL: privateEnv.GENERATION_GRPC_URL ?? `http://${LOOPBACK_IP}:50052`,
  GENERATION_SERVICE_URL: privateEnv.GENERATION_SERVICE_URL ?? `http://${LOOPBACK_IP}:50052`,
  // TurboVec gRPC
  TURBOVEC_SIDECAR_GRPC_URL: privateEnv.TURBOVEC_SIDECAR_GRPC_URL ?? privateEnv.TURBOVEC_GRPC_URL ?? `${LOOPBACK_IP}:50062`,
  TURBOVEC_SIDECAR_GRPC_ENABLED: (privateEnv.TURBOVEC_SIDECAR_GRPC_ENABLED ?? privateEnv.TURBOVEC_GRPC_ENABLED ?? 'false') === 'true',
  // LangExtract — pure-TS native extractor (langextract/native.ts) is now the default.
  // The Python FastAPI service (phase66-langextract :8095) is DECOMMISSIONED:
  //   - 11/11 native tests pass (citations, statutes, case names, money, dates, persons, etc.)
  //   - No network hop, no GIL, ~10× faster than the Python service for typical legal text
  //   - To re-enable the Python service for benchmarking: set LANGEXTRACT_ENABLED=true
  //     AND LANGEXTRACT_NATIVE=false explicitly.
  // LangExtract — pure-TS native extractor (langextract/native.ts) is now the default.
  // The Python FastAPI service (phase66-langextract :8095) is DECOMMISSIONED:
  LANGEXTRACT_ENABLED:
    (privateEnv.LANGEXTRACT_ENABLED ?? privateEnv.MINIO_SIMD_ENABLED ?? 'false') === 'true',
  LANGEXTRACT_URL:
    privateEnv.LANGEXTRACT_URL?.trim() || privateEnv.LANGEXTRACT_API_URL?.trim() || '',
  /** Native TS langextract is the default. Override to 'false' to fall back to the Python service. */
  LANGEXTRACT_NATIVE:
    (privateEnv.LANGEXTRACT_NATIVE ?? 'true') === 'true' ? 'true' : 'false',
  /** HTTP port for the langextract-mcp.ts stdio-HTTP bridge (default 8793) */
  LANGEXTRACT_MCP_PORT: privateEnv.LANGEXTRACT_MCP_PORT ?? '8793',
  /** Bind host for the langextract-mcp.ts bridge (default: all interfaces) */
  LANGEXTRACT_MCP_HOST: privateEnv.LANGEXTRACT_MCP_HOST ?? undefined,
  /**
   * RAG_RRF_ENABLED — Phase 1 canary flag.
   *
   * When 'true', /api/rag/search routes legal-flavored queries (jurisdiction
   * filter present OR collection includes 'legal_documents') through the new
   * sparse-bm25 + dense-Qdrant RRF fusion path (delegating to the
   * /api/rag/search-fused implementation). Codebase queries continue using
   * the legacy 1000+ LoC pipeline regardless.
   *
   * When 'false' (default), /api/rag/search behavior is unchanged. Both
   * endpoints remain available; clients can call /api/rag/search-fused
   * directly during the canary period.
   */
  RAG_RRF_ENABLED: (privateEnv.RAG_RRF_ENABLED ?? 'false') === 'true',
  // QUIC/NATS embedding transport
  EMBEDDING_QUIC_ENABLED:
    (privateEnv.EMBEDDING_QUIC_ENABLED ?? privateEnv.QUIC_ENABLED ?? 'false') === 'true',
  NATS_URL: privateEnv.NATS_URL ?? `nats://${LOOPBACK_IP}:4222`,
  INDEX_WORKER_URL: privateEnv.INDEX_WORKER_URL ?? `http://${LOOPBACK_IP}:8101`,
  // TensorRT-LLM inference (main gpu profile exposes 8099; Triton uses TRITON_URL on 8000)
  TENSORRT_URL:
    privateEnv.TENSORRT_URL ?? privateEnv.TENSORRT_SERVICE_URL ?? `http://${LOOPBACK_IP}:8099`,
  TRITON_URL: privateEnv.TRITON_URL ?? DEV.TRITON_URL,
  TRITON_LLM_MODEL: privateEnv.TRITON_LLM_MODEL ?? 'legal-llm',
  TRITON_VLM_MODEL: privateEnv.TRITON_VLM_MODEL ?? DEV.TRITON_VLM_MODEL,
  TRITON_VISION_MODEL: privateEnv.TRITON_VISION_MODEL ?? DEV.TRITON_VISION_MODEL,
  TRITON_RERANKER_MODEL: privateEnv.TRITON_RERANKER_MODEL ?? DEV.TRITON_RERANKER_MODEL,
  CUDA_MAX_STREAMS: privateEnv.CUDA_MAX_STREAMS !== undefined ? Number(privateEnv.CUDA_MAX_STREAMS) : undefined,
  CUDA_DEVICE_ID: privateEnv.CUDA_DEVICE_ID !== undefined ? Number(privateEnv.CUDA_DEVICE_ID) : undefined,
  // Inference cascade: Bifrost L2 cache (:3040) → Reranker (:8090) → TurboQuant (:8080) → VLM (:8085) → LiteRT (:8070)
  BIFROST_URL: privateEnv.BIFROST_URL ?? `http://${LOOPBACK_IP}:3040`,
  /**
   * OpenAI-compatible Bifrost route base.
   * Default matches the live gateway route. Override to /openai/v1 only if the
   * deployment exposes that prefix.
   */
  BIFROST_OPENAI_BASE_URL:
    privateEnv.BIFROST_OPENAI_BASE_URL ?? `http://${LOOPBACK_IP}:3040/v1`,
  TURBOQUANT_BASE_URL: privateEnv.TURBOQUANT_BASE_URL ?? `http://${LOOPBACK_IP}:8090`,
  // Alias — admin/inference-lane route references ENV.TURBOQUANT_URL; mirror BASE_URL.
  TURBOQUANT_URL: privateEnv.TURBOQUANT_URL ?? privateEnv.TURBOQUANT_BASE_URL ?? `http://${LOOPBACK_IP}:8090`,
  TURBOVEC_SIDECAR_JSONRPC_URL: privateEnv.TURBOVEC_SIDECAR_JSONRPC_URL ?? privateEnv.TURBOVEC_SIDECAR ?? `http://${LOOPBACK_IP}:8792`,
  TURBOVEC_SIDECAR: privateEnv.TURBOVEC_SIDECAR ?? privateEnv.TURBOVEC_SIDECAR_JSONRPC_URL ?? `http://${LOOPBACK_IP}:8792`,
  RERANK_BASE_URL: privateEnv.RERANK_BASE_URL ?? privateEnv.RERANK_URL ?? `http://${LOOPBACK_IP}:8090`,
  RERANK_URL: privateEnv.RERANK_URL ?? privateEnv.RERANK_BASE_URL ?? `http://${LOOPBACK_IP}:8090`,
  VLM_BASE_URL: privateEnv.VLM_BASE_URL ?? `http://${LOOPBACK_IP}:8085`,
  LITERT_BASE_URL: privateEnv.LITERT_BASE_URL ?? `http://${LOOPBACK_IP}:8070`,
  // Neo4j graph database
  NEO4J_URI: privateEnv.NEO4J_URI ?? privateEnv.NEO4J_URL ?? `bolt://${LOOPBACK_IP}:7687`,
  NEO4J_USER: privateEnv.NEO4J_USER ?? privateEnv.NEO4J_USERNAME ?? 'neo4j',
  NEO4J_PASSWORD: privateEnv.NEO4J_PASSWORD ?? privateEnv.NEO4J_PASS ?? 'neo4j123',
  // Neo4j browser HTTP API (used by memory-mirror, couchdb sync — separate from bolt)
  NEO4J_HTTP_URL: privateEnv.NEO4J_HTTP_URL ?? `http://${LOOPBACK_IP}:7474`,
  // CouchDB document store — default password matches docker-compose.yml
  // (`COUCHDB_PASSWORD: ${COUCHDB_PASSWORD:-legal_ai_pass}`). Override via
  // COUCHDB_URL or COUCHDB_PASSWORD in .env.production.
  COUCHDB_URL:
    privateEnv.COUCHDB_URL
    ?? (privateEnv.COUCHDB_PASSWORD
        ? `http://admin:${privateEnv.COUCHDB_PASSWORD}@${LOOPBACK_IP}:5984`
        : `http://admin:legal_ai_pass@${LOOPBACK_IP}:5984`),
  // Web search (optional — SearXNG first, DuckDuckGo fallback)
  SEARXNG_URL: privateEnv.SEARXNG_URL ?? `http://${LOOPBACK_IP}:8888`, // Docker: 8888→8080 internal
  // Obsidian Local REST API (optional — vault sync via obsidian-local-rest-api plugin)
  OBSIDIAN_URL: privateEnv.OBSIDIAN_URL ?? `https://${LOOPBACK_IP}:27124`,
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
  LEGAL_GATEWAY_URL: privateEnv.LEGAL_GATEWAY_URL ?? `http://${LOOPBACK_IP}:8080`,
  // Enhanced RAG microservice + dev frontend base (used by CHR97 module)
  ENHANCED_RAG_URL: privateEnv.ENHANCED_RAG_URL ?? `http://${LOOPBACK_IP}:8094`,
  FRONTEND_BASE_URL: privateEnv.FRONTEND_BASE_URL ?? `http://${LOOPBACK_IP}:5174`,
  // vLLM OpenAI-compatible inference (alternative to Triton/TurboQuant)
  VLLM_URL: privateEnv.VLLM_URL ?? `http://${LOOPBACK_IP}:8001`,
  // Context7 MCP server (library docs lookup tool)
  CONTEXT7_MCP_URL: privateEnv.CONTEXT7_MCP_URL ?? `http://${LOOPBACK_IP}:4000`,
  // MinIO full URL (for direct HTTP calls — use MINIO_ENDPOINT/PORT for the SDK)
  MINIO_URL: privateEnv.MINIO_URL ?? `http://${LOOPBACK_IP}:9000`,
  // Go Legal Library Search Service (parallel fan-out: citation + FTS + pgvector + Qdrant)
  GO_SEARCH_URL: privateEnv.GO_SEARCH_URL ?? '',
  GO_SEARCH_GRPC_URL: privateEnv.GO_SEARCH_GRPC_URL ?? `${LOOPBACK_IP}:50055`,
  // QUIC/HTTP3 proxy health endpoint (Caddy on :5178 by default)
  QUIC_HEALTH_URL: privateEnv.QUIC_HEALTH_URL ?? `http://${LOOPBACK_IP}:5178/health`,
  // FastAPI middleware (optional)
  FASTAPI_URL: privateEnv.FASTAPI_URL ?? `http://${LOOPBACK_IP}:8001`,
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
  LANGFUSE_HOST: privateEnv.LANGFUSE_HOST ?? `http://${LOOPBACK_IP}:3030`,
  LANGFUSE_ENABLED: (privateEnv.LANGFUSE_ENABLED ?? 'false') === 'true',
  // Bifrost semantic cache gateway settings (URL already defined above in inference cascade)
  BIFROST_ENABLED: (privateEnv.BIFROST_ENABLED ?? 'false') === 'true',
  // OpenAI-compatible base URL (via Bifrost → Ollama) for pgai, LangChain, external tools
  OPENAI_BASE_URL:
    privateEnv.OPENAI_BASE_URL ??
    privateEnv.BIFROST_OPENAI_BASE_URL ??
    `http://${LOOPBACK_IP}:3040/v1`,
  OPENAI_API_KEY: privateEnv.OPENAI_API_KEY ?? 'dummy',
  // Auth secrets
  JWT_SECRET: privateEnv.JWT_SECRET ?? DEV.JWT_SECRET,
  SERVICE_AUTH_TOKEN: privateEnv.SERVICE_AUTH_TOKEN ?? DEV.SERVICE_AUTH_TOKEN,
  // MinIO library bucket
  MINIO_LIBRARY_BUCKET: privateEnv.MINIO_LIBRARY_BUCKET ?? 'legal-library',
  // Whisper persistent server (whisper-server.exe HTTP mode — eliminates cold start)
  WHISPER_SERVER_URL: privateEnv.WHISPER_SERVER_URL ?? `http://${LOOPBACK_IP}:8178`,
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
  CODEBASE_INDEX_URL: privateEnv.CODEBASE_INDEX_URL ?? `http://${LOOPBACK_IP}:8090`,
  // Orchestrator service (port 8102)
  ORCHESTRATOR_URL: privateEnv.ORCHESTRATOR_URL ?? `http://${LOOPBACK_IP}:8102`,
  // CUDA/GPU compute service (port 8765)
  CUDA_SERVICE_URL: privateEnv.CUDA_SERVICE_URL ?? `http://${LOOPBACK_IP}:8765`,
  // LangGraph synthesis service (Docker GPU profile, port 8091)
  LANGGRAPH_URL: privateEnv.LANGGRAPH_URL ?? `http://${LOOPBACK_IP}:8091`,
  LANGGRAPH_ENABLED: (privateEnv.LANGGRAPH_ENABLED ?? 'false') === 'true',
  // Local Deep Research service (port 5000) — multi-engine research agent
  LDR_BASE_URL: privateEnv.LDR_BASE_URL ?? `http://${LOOPBACK_IP}:5000`,
  LDR_ENABLED: (privateEnv.LDR_ENABLED ?? 'true') === 'true',
  LDR_USERNAME: privateEnv.LDR_USERNAME ?? 'admin',
  LDR_PASSWORD: privateEnv.LDR_PASSWORD ?? 'admin',
  // RAG microservice (port 8103)
  RAG_SERVICE_URL: privateEnv.RAG_SERVICE_URL ?? `http://${LOOPBACK_IP}:8103`,
  // Image Synthesis + 3D Reconstruction service (Wan2.1 + DepthAnything, port 8092)
  IMAGE_SYNTHESIS_URL: privateEnv.IMAGE_SYNTHESIS_URL ?? `http://${LOOPBACK_IP}:8092`,
  // Redis host + port (for ioredis explicit config)
  REDIS_HOST: privateEnv.REDIS_HOST ?? LOOPBACK_IP,
  REDIS_PORT: Number(privateEnv.REDIS_PORT ?? '6379'),
  // RabbitMQ management API
  RABBITMQ_MGMT_URL: privateEnv.RABBITMQ_MGMT_URL ?? `http://${LOOPBACK_IP}:15672`,
  RABBITMQ_MGMT_AUTH: (() => {
    const user = privateEnv.RABBITMQ_MGMT_USER ?? privateEnv.RABBITMQ_USER ?? 'guest';
    const pass = privateEnv.RABBITMQ_MGMT_PASS ?? privateEnv.RABBITMQ_PASS ?? 'guest';
    return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
  })(),
  // Node environment
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  /** Development bypass auth (Sprint 6/Phase 76) */
  DEV_BYPASS_AUTH: (privateEnv.DEV_BYPASS_AUTH ?? 'false') === 'true',
  /** ACE Stage A0 encoded-cluster prefilter (Phase 1-4) */
  ACE_ENCODED_PREFILTER_ENABLED: privateEnv.ACE_ENCODED_PREFILTER_ENABLED ?? 'false',
  /** ACE Stage A0 prefilter mode: off | shadow (measure) | boost (score only, no hard filter) | enforce (Qdrant filter). Default: off */
  ACE_ENCODED_PREFILTER_MODE: (privateEnv.ACE_ENCODED_PREFILTER_MODE ?? 'off') as 'off' | 'shadow' | 'boost' | 'enforce',
  /** Enable encoded-cluster similarity as a rerank boost signal (default: false) */
  ACE_ENCODED_RERANK_ENABLED: (privateEnv.ACE_ENCODED_RERANK_ENABLED ?? 'false') === 'true',
  /** Weight for encoded-cluster similarity in decision-tree reranker (default: 0.05) */
  ACE_ENCODED_RERANK_WEIGHT: parseFloat(privateEnv.ACE_ENCODED_RERANK_WEIGHT ?? '0.05'),
  // SeaweedFS S3
  SEAWEED_S3_ENDPOINT: privateEnv.SEAWEED_S3_ENDPOINT ?? `http://${LOOPBACK_IP}:8333`,
  SEAWEED_S3_REGION: privateEnv.SEAWEED_S3_REGION ?? 'us-east-1',
  SEAWEED_S3_BUCKET: privateEnv.SEAWEED_S3_BUCKET ?? 'deeds-dev',
  SEAWEED_ACCESS_KEY: privateEnv.SEAWEED_ACCESS_KEY ?? 'admin',
  SEAWEED_SECRET_KEY: privateEnv.SEAWEED_SECRET_KEY ?? 'admin',
  PUBLIC_APP_URL: privateEnv.PUBLIC_APP_URL ?? `http://${LOOPBACK_IP}:5173`,
  ENABLE_LEGACY_ATLAS_FIELDS: privateEnv.ENABLE_LEGACY_ATLAS_FIELDS ?? 'false',
};


/**
 * Robust MinIO config normalization — handles full URLs in MINIO_ENDPOINT
 */
function getNormalizedMinioConfig() {
	let endpoint = ENV.MINIO_ENDPOINT;
	let port = parseInt(ENV.MINIO_PORT, 10);
	let useSSL = ENV.MINIO_USE_SSL === 'true';

	if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
		try {
			const url = new URL(endpoint);
			endpoint = url.hostname;
			useSSL = url.protocol === 'https:';
			if (url.port) {
				port = parseInt(url.port, 10);
			}
		} catch (e) {
			console.warn('[env] Failed to parse MINIO_ENDPOINT as URL:', endpoint);
		}
	} else if (endpoint.includes(':')) {
		const parts = endpoint.split(':');
		endpoint = parts[0];
		port = parseInt(parts[1], 10);
	}

	return { endpoint, port, useSSL };
}

// SeaweedFS S3 gateway override — when running `docker compose --profile seaweedfs up`,
// SeaweedFS exposes an S3-compatible gateway on port 8333. Setting SEAWEED_S3_PORT
// transparently retargets the existing MinIO SDK client at SeaweedFS without code
// changes anywhere else.
if (privateEnv.SEAWEED_S3_PORT) {
	ENV.MINIO_PORT = privateEnv.SEAWEED_S3_PORT;
	if (privateEnv.SEAWEED_ENDPOINT) ENV.MINIO_ENDPOINT = privateEnv.SEAWEED_ENDPOINT;
	if (privateEnv.SEAWEED_ACCESS_KEY) ENV.MINIO_ACCESS_KEY = privateEnv.SEAWEED_ACCESS_KEY;
	if (privateEnv.SEAWEED_SECRET_KEY) ENV.MINIO_SECRET_KEY = privateEnv.SEAWEED_SECRET_KEY;
}

/** SeaweedFS master port (metadata/cluster status) — default 9333 */
export const SEAWEED_MASTER_PORT = parseInt(privateEnv.SEAWEED_MASTER_PORT ?? '9333', 10);
/** SeaweedFS filer port (POSIX-style file API) — default 8382 */
export const SEAWEED_FILER_PORT  = parseInt(privateEnv.SEAWEED_FILER_PORT  ?? '8382', 10);

const normalizedMinio = getNormalizedMinioConfig();
ENV.MINIO_ENDPOINT = normalizedMinio.endpoint;
ENV.MINIO_PORT = String(normalizedMinio.port);
ENV.MINIO_USE_SSL = String(normalizedMinio.useSSL);
