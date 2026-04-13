// ═══════════════════════════════════════════════════════════════
// Runtime Architecture Graph — Legal AI Platform
// ═══════════════════════════════════════════════════════════════
//
// Creates a Neo4j graph representing the complete runtime architecture:
// - Services (Redis, Ollama, Qdrant, etc.)
// - Inference Lanes (E2B, LiteRT, TurboQuant, etc.)
// - Cache Tiers (L1, L2, L3)
// - Routing Policies (client cascade, server cascade)
//
// Usage:
//   1. Open Neo4j Browser: http://localhost:7474
//   2. Copy-paste this entire file into the query editor
//   3. Click Run (or Ctrl+Enter)
//
// ═══════════════════════════════════════════════════════════════

// Clear existing graph (CAUTION: only run if you want to start fresh)
// MATCH (n) DETACH DELETE n;

// ═══════════════════════════════════════════════════════════════
// CACHE TIERS (L1, L2, L3)
// ═══════════════════════════════════════════════════════════════

CREATE (redis_l1:CacheTier {
  name: 'Redis L1',
  tier: 'L1',
  type: 'exact-match',
  latency_ms: 5,
  hit_rate: 0.25,
  speedup_cpu: 6542,
  speedup_gpu: 5079,
  ttl_seconds: 3600,
  max_memory: '2GB',
  eviction_policy: 'allkeys-lru',
  status: 'production'
})

CREATE (bifrost_l2:CacheTier {
  name: 'Bifrost L2',
  tier: 'L2',
  type: 'semantic',
  latency_ms: 3000,
  hit_rate: 0.80,
  speedup_min: 5,
  speedup_max: 12,
  threshold: 0.8,
  ttl_seconds: 3600,
  status: 'production'
})

CREATE (qdrant_l3:CacheTier {
  name: 'Qdrant Vector Store',
  tier: 'L3',
  type: 'vector-search',
  latency_ms: 50,
  collections: 9,
  quantization: 'INT8',
  compression: '4x',
  recall_loss: 0.01,
  status: 'production'
})

// Cache tier relationships
CREATE (redis_l1)-[:FALLS_BACK_TO {when: 'miss'}]->(bifrost_l2)
CREATE (bifrost_l2)-[:FALLS_BACK_TO {when: 'miss'}]->(qdrant_l3)
CREATE (bifrost_l2)-[:USES_BACKEND]->(qdrant_l3)

// ═══════════════════════════════════════════════════════════════
// SERVICES (Infrastructure)
// ═══════════════════════════════════════════════════════════════

CREATE (postgres:Service {
  name: 'PostgreSQL',
  type: 'database',
  port: 5434,
  protocol: 'PostgreSQL',
  engine: 'PostgreSQL 16.2',
  extensions: ['pgvector', 'pg_trgm', 'btree_gin'],
  tables: 70,
  status: 'production'
})

CREATE (redis:Service {
  name: 'Redis',
  type: 'cache',
  port: 6379,
  protocol: 'Redis',
  engine: 'Redis 7.2',
  max_memory: '2GB',
  status: 'production'
})

CREATE (qdrant:Service {
  name: 'Qdrant',
  type: 'vector-db',
  port: 6333,
  protocol: 'HTTP + gRPC',
  engine: 'Qdrant 1.15.4',
  collections: 9,
  quantization: 'INT8',
  status: 'production'
})

CREATE (rabbitmq:Service {
  name: 'RabbitMQ',
  type: 'message-queue',
  port: 5672,
  protocol: 'AMQP',
  engine: 'RabbitMQ 3.13',
  queues: 8,
  consumers: 8,
  status: 'production'
})

CREATE (minio:Service {
  name: 'MinIO',
  type: 'object-storage',
  port: 9000,
  protocol: 'S3 API',
  engine: 'MinIO',
  status: 'production'
})

CREATE (couchdb:Service {
  name: 'CouchDB',
  type: 'document-db',
  port: 5984,
  protocol: 'HTTP',
  engine: 'CouchDB 3.3',
  status: 'production'
})

CREATE (grpc_embedding:Service {
  name: 'gRPC Embedding Server',
  type: 'embedding',
  port: 50051,
  protocol: 'gRPC',
  engine: 'Go + Ollama proxy',
  batch_size: 100,
  status: 'production'
})

CREATE (langfuse:Service {
  name: 'Langfuse',
  type: 'observability',
  port: 3030,
  protocol: 'HTTP',
  engine: 'Langfuse v3',
  backends: ['ClickHouse', 'Worker', 'Web'],
  status: 'production'
})

// Service relationships
CREATE (redis_l1)-[:BACKED_BY]->(redis)
CREATE (bifrost_l2)-[:BACKED_BY]->(qdrant)
CREATE (qdrant_l3)-[:IS]->(qdrant)

// ═══════════════════════════════════════════════════════════════
// CLIENT INFERENCE LANES
// ═══════════════════════════════════════════════════════════════

CREATE (client_router:Router {
  name: 'Client Router',
  type: 'client',
  file: 'unified-generation.ts',
  tiers: 5,
  status: 'production'
})

CREATE (e2b_webgpu:Lane {
  name: 'E2B WebGPU',
  tier: 2,
  type: 'client',
  runtime: 'Transformers.js v4',
  model: 'Gemma 4 E2B 2.3B',
  quantization: 'Q4F16',
  backend: 'WebGPU',
  latency_ms: 1500,
  throughput_tps: 100,
  vram_gb: 2.5,
  status: 'implemented',
  needs_verification: true
})

CREATE (litert_cpu:Lane {
  name: 'LiteRT CPU',
  tier: 3,
  type: 'client',
  runtime: 'LiteRT-LM',
  model: 'Gemma 4 E2B 2.3B',
  quantization: 'INT4',
  backend: 'XNNPACK',
  features: ['MTP 4-head speculative decode'],
  latency_ms: 4000,
  throughput_tps: 40,
  vram_gb: 0,
  port: 8070,
  status: 'integrated',
  optional: true
})

CREATE (onnx_wasm:Lane {
  name: 'ONNX WASM',
  tier: 4,
  type: 'client',
  runtime: 'ONNX Runtime',
  model: 'Gemma 3 270M',
  quantization: 'INT8',
  backend: 'WASM SIMD',
  latency_ms: 6500,
  throughput_tps: 25,
  vram_gb: 0,
  status: 'production'
})

// Client cascade
CREATE (client_router)-[:TIER_1 {latency_ms: 500, timeout_ms: 500}]->(bifrost_l2)
CREATE (client_router)-[:TIER_2 {latency_ms: 1500}]->(e2b_webgpu)
CREATE (client_router)-[:TIER_3 {latency_ms: 4000}]->(litert_cpu)
CREATE (client_router)-[:TIER_4 {latency_ms: 6500}]->(onnx_wasm)

CREATE (e2b_webgpu)-[:FALLS_BACK_TO {when: 'no WebGPU'}]->(litert_cpu)
CREATE (litert_cpu)-[:FALLS_BACK_TO {when: 'sidecar down'}]->(onnx_wasm)

// Client lanes cache in Bifrost L2
CREATE (e2b_webgpu)-[:STORES_IN]->(bifrost_l2)
CREATE (litert_cpu)-[:STORES_IN]->(bifrost_l2)
CREATE (onnx_wasm)-[:STORES_IN]->(bifrost_l2)

// ═══════════════════════════════════════════════════════════════
// SERVER INFERENCE LANES
// ═══════════════════════════════════════════════════════════════

CREATE (server_router:Router {
  name: 'Server Router',
  type: 'server',
  file: 'inference-router.ts',
  tiers: 7,
  status: 'production'
})

CREATE (tensorrt_gpu:Lane {
  name: 'TensorRT GPU',
  tier: 3,
  type: 'server',
  runtime: 'TensorRT',
  model: 'Gemma 4 E4B',
  quantization: 'INT4',
  backend: 'CUDA',
  latency_ms: 17500,
  throughput_tps: 12,
  vram_gb: 4.5,
  port: 8099,
  status: 'optional',
  enabled: false
})

CREATE (turboquant:Lane {
  name: 'TurboQuant',
  tier: 4,
  type: 'server',
  runtime: 'llama-server',
  model: 'gemma4-legal Q4_K_M',
  quantization: 'Q4_K_M + turbo3 KV',
  backend: 'CUDA',
  features: ['turbo3 KV cache', '5× compression', '8× GPU speedup', 'mmproj vision'],
  latency_ms: 17500,
  throughput_tps: 12,
  vram_gb: 3.2,
  port: 8090,
  status: 'production'
})

CREATE (vlm_server:Lane {
  name: 'VLM Server',
  tier: 5,
  type: 'server',
  runtime: 'HuggingFace',
  model: 'Gemma 3 12B VLM',
  quantization: 'NF4',
  backend: 'CUDA',
  features: ['vision + text'],
  latency_ms: 27500,
  throughput_tps: 8,
  vram_gb: 6.5,
  port: 8085,
  status: 'production'
})

CREATE (litert_server:Lane {
  name: 'LiteRT Server',
  tier: 6,
  type: 'server',
  runtime: 'LiteRT-LM',
  model: 'Gemma 4 E2B 2.3B',
  quantization: 'INT4',
  backend: 'XNNPACK',
  latency_ms: 35000,
  throughput_tps: 6,
  vram_gb: 0,
  port: 8070,
  status: 'optional',
  enabled: false
})

CREATE (ollama_server:Lane {
  name: 'Ollama',
  tier: 7,
  type: 'server',
  runtime: 'Ollama',
  model: 'gemma4-legal Q4_K_M',
  quantization: 'Q4_K_M + Q8_0 KV',
  backend: 'CUDA',
  features: ['Flash Attention', 'HTTP keep-alive'],
  latency_ms: 25000,
  throughput_tps: 9,
  vram_gb: 5.8,
  port: 11434,
  status: 'production',
  always_succeeds: true
})

// Server cascade
CREATE (server_router)-[:TIER_1 {latency_ms: 5}]->(redis_l1)
CREATE (server_router)-[:TIER_2 {latency_ms: 3000}]->(bifrost_l2)
CREATE (server_router)-[:TIER_3 {latency_ms: 17500}]->(tensorrt_gpu)
CREATE (server_router)-[:TIER_4 {latency_ms: 17500}]->(turboquant)
CREATE (server_router)-[:TIER_5 {latency_ms: 27500}]->(vlm_server)
CREATE (server_router)-[:TIER_6 {latency_ms: 35000}]->(litert_server)
CREATE (server_router)-[:TIER_7 {latency_ms: 25000, final_fallback: true}]->(ollama_server)

CREATE (tensorrt_gpu)-[:FALLS_BACK_TO {when: 'TRT down'}]->(turboquant)
CREATE (turboquant)-[:FALLS_BACK_TO {when: 'health check failed'}]->(vlm_server)
CREATE (vlm_server)-[:FALLS_BACK_TO]->(litert_server)
CREATE (litert_server)-[:FALLS_BACK_TO]->(ollama_server)

// Server lanes cache in L1+L2
CREATE (tensorrt_gpu)-[:STORES_IN]->(redis_l1)
CREATE (tensorrt_gpu)-[:STORES_IN]->(bifrost_l2)
CREATE (turboquant)-[:STORES_IN]->(redis_l1)
CREATE (turboquant)-[:STORES_IN]->(bifrost_l2)
CREATE (vlm_server)-[:STORES_IN]->(redis_l1)
CREATE (vlm_server)-[:STORES_IN]->(bifrost_l2)
CREATE (litert_server)-[:STORES_IN]->(redis_l1)
CREATE (litert_server)-[:STORES_IN]->(bifrost_l2)
CREATE (ollama_server)-[:STORES_IN]->(redis_l1)
CREATE (ollama_server)-[:STORES_IN]->(bifrost_l2)

// ═══════════════════════════════════════════════════════════════
// SUPPORTING ANALYSIS LANE
// ═══════════════════════════════════════════════════════════════

CREATE (libtorch_analysis:Lane {
  name: 'LibTorch Analysis',
  tier: 0,
  type: 'analysis',
  runtime: 'LibTorch C++ (N-API)',
  backend: 'CUDA 12.1',
  features: ['Batch cosine similarity', 'K-means clustering', 'GPU tensor ops'],
  latency_ms: 25,
  speedup_vs_cpu: 100,
  vram_gb: 2.0,
  addon_path: 'tensorrt_bridge.node',
  gpu_functions: 17,
  status: 'production'
})

CREATE (simdjson_parser:Lane {
  name: 'simdjson Parser',
  tier: 0,
  type: 'analysis',
  runtime: 'simdjson C++ (N-API)',
  backend: 'AVX2/SSE4.2',
  features: ['SIMD JSON parsing', 'LRU cache', 'Zero-copy extraction'],
  latency_ms: 2,
  speedup_vs_v8: 4,
  cache_size: 200,
  addon_path: 'tensorrt_bridge.node',
  status: 'production'
})

// Analysis lanes used by services
CREATE (qdrant)-[:USES_FOR {purpose: 'parse large responses'}]->(simdjson_parser)
CREATE (ollama_server)-[:USES_FOR {purpose: 'parse completions'}]->(simdjson_parser)
CREATE (rabbitmq)-[:USES_FOR {purpose: 'deserialize messages'}]->(simdjson_parser)
CREATE (qdrant)-[:USES_FOR {purpose: 'batch similarity'}]->(libtorch_analysis)

// ═══════════════════════════════════════════════════════════════
// CLIENT ↔ SERVER ESCALATION
// ═══════════════════════════════════════════════════════════════

CREATE (client_router)-[:ESCALATES_TO {
  when: 'tier 4 fails OR score >= 0.3',
  endpoint: '/api/sse/chat',
  score_threshold: 0.3
}]->(server_router)

// ═══════════════════════════════════════════════════════════════
// OBSERVABILITY & MONITORING
// ═══════════════════════════════════════════════════════════════

CREATE (langfuse)-[:TRACES {endpoints: 7}]->(redis_l1)
CREATE (langfuse)-[:TRACES {endpoints: 7}]->(bifrost_l2)
CREATE (langfuse)-[:TRACES {endpoints: 7}]->(ollama_server)
CREATE (langfuse)-[:TRACES {endpoints: 5}]->(rabbitmq)

// ═══════════════════════════════════════════════════════════════
// CONSTRAINTS & INDEXES (for query performance)
// ═══════════════════════════════════════════════════════════════

CREATE CONSTRAINT lane_name IF NOT EXISTS FOR (l:Lane) REQUIRE l.name IS UNIQUE;
CREATE CONSTRAINT service_name IF NOT EXISTS FOR (s:Service) REQUIRE s.name IS UNIQUE;
CREATE CONSTRAINT cache_tier IF NOT EXISTS FOR (c:CacheTier) REQUIRE c.tier IS UNIQUE;

CREATE INDEX lane_tier IF NOT EXISTS FOR (l:Lane) ON (l.tier);
CREATE INDEX lane_status IF NOT EXISTS FOR (l:Lane) ON (l.status);
CREATE INDEX service_port IF NOT EXISTS FOR (s:Service) ON (s.port);

// ═══════════════════════════════════════════════════════════════
// DONE! View the graph with these queries:
// ═══════════════════════════════════════════════════════════════

// 1. Full architecture overview:
// MATCH (n) RETURN n LIMIT 100

// 2. Client cascade only:
// MATCH path = (client:Router {type: 'client'})-[*]->(tier)
// RETURN path

// 3. Server cascade only:
// MATCH path = (server:Router {type: 'server'})-[*]->(tier)
// RETURN path

// 4. Cache tier hierarchy:
// MATCH path = (l1:CacheTier {tier: 'L1'})-[:FALLS_BACK_TO*]->(next)
// RETURN path

// 5. All lanes sorted by latency:
// MATCH (l:Lane)
// RETURN l.name, l.latency_ms, l.type, l.tier, l.status
// ORDER BY l.latency_ms

// 6. Services and their ports:
// MATCH (s:Service)
// RETURN s.name, s.port, s.type, s.status
// ORDER BY s.port

// 7. Critical path (fastest route to response):
// MATCH path = (client:Router {type: 'client'})-[:TIER_1]->(cache)-[:TIER_1]->(l1)
// RETURN path

// 8. Full fallback chain (worst case):
// MATCH path = (client:Router {type: 'client'})-[:TIER_4*..10]->(final)
// WHERE final.always_succeeds = true
// RETURN path