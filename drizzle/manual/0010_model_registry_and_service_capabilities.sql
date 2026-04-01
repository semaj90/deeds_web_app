-- Model Registry + Service Capabilities
-- March 31, 2026 — Infrastructure wiring audit

DO $$ BEGIN
  CREATE TYPE inference_backend AS ENUM ('ollama', 'tensorrt', 'litellm', 'pytorch', 'onnx');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE model_capability AS ENUM ('chat', 'embedding', 'vlm', 'code', 'summarization', 'rerank');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE service_tier AS ENUM ('core', 'data', 'inference', 'future');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Central model registry
CREATE TABLE IF NOT EXISTS model_registry (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  backend inference_backend NOT NULL,
  capability model_capability NOT NULL DEFAULT 'chat',
  version VARCHAR(50),
  parameter_count BIGINT,
  quantization VARCHAR(50),
  context_window INTEGER,
  embedding_dims INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  health_endpoint VARCHAR(500),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name, backend)
);

CREATE INDEX IF NOT EXISTS model_registry_backend_idx ON model_registry (backend);
CREATE INDEX IF NOT EXISTS model_registry_capability_idx ON model_registry (capability);
CREATE INDEX IF NOT EXISTS model_registry_active_idx ON model_registry (is_active);

-- Seed known models
INSERT INTO model_registry (name, backend, capability, version, parameter_count, quantization, context_window, embedding_dims, is_active, is_default, health_endpoint, metadata)
VALUES
  ('gemma3-legal:latest', 'ollama', 'chat', '3.0', 27000000000, 'Q4_K_M', 8192, NULL, true, true, 'http://localhost:11434/api/tags', '{"role": "primary LLM", "notes": "Legal fine-tuned Gemma 3"}'),
  ('embeddinggemma:latest', 'ollama', 'embedding', '1.0', 300000000, 'FP16', 2048, 768, true, true, 'http://localhost:11434/api/tags', '{"role": "primary embeddings"}'),
  ('nomic-embed-text', 'ollama', 'embedding', '1.5', 137000000, 'FP16', 8192, 768, true, false, 'http://localhost:11434/api/tags', '{"role": "fallback embeddings"}'),
  ('gemma3-legal-trt', 'tensorrt', 'chat', '3.0', 27000000000, 'INT4', 8192, NULL, false, false, 'http://localhost:8099/health', '{"role": "GPU-accelerated LLM", "notes": "INT4 AWQ quantized"}'),
  ('gemma3-vlm', 'pytorch', 'vlm', '3.0', 27000000000, 'FP16', 4096, NULL, false, false, NULL, '{"role": "Vision-Language Model", "notes": "Document image analysis"}'),
  ('gemma3_270m_onnx', 'onnx', 'chat', '1.0', 270000000, 'INT8', 2048, NULL, true, false, NULL, '{"role": "Client-side lightweight LLM", "notes": "WebGPU/WASM"}'),
  ('embeddinggemma_300m_onnx', 'onnx', 'embedding', '1.0', 300000000, 'INT8', 512, 768, true, false, NULL, '{"role": "Client-side embeddings"}')
ON CONFLICT (name, backend) DO NOTHING;

-- Service capabilities matrix
CREATE TABLE IF NOT EXISTS service_capabilities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  service_name VARCHAR(100) NOT NULL UNIQUE,
  tier service_tier NOT NULL,
  port INTEGER,
  health_endpoint VARCHAR(500),
  fallback_service VARCHAR(100),
  is_required BOOLEAN NOT NULL DEFAULT false,
  docker_profile VARCHAR(50),
  last_health_check TIMESTAMPTZ,
  last_health_status BOOLEAN,
  last_latency_ms INTEGER,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS svc_capabilities_tier_idx ON service_capabilities (tier);

-- Seed service matrix
INSERT INTO service_capabilities (service_name, tier, port, health_endpoint, fallback_service, is_required, docker_profile, metadata)
VALUES
  ('ollama',      'core',      11434, 'http://localhost:11434/api/tags',                NULL,          true,  NULL,     '{"notes": "Native install, not Docker"}'),
  ('qdrant',      'core',      6333,  'http://localhost:6333/healthz',                  NULL,          true,  NULL,     '{"container": "phase66-qdrant"}'),
  ('redis',       'core',      6379,  NULL,                                              NULL,          true,  NULL,     '{"container": "phase66-redis", "probe": "PING"}'),
  ('postgres',    'core',      5432,  NULL,                                              NULL,          true,  NULL,     '{"container": "postgres-pgvector", "probe": "SELECT 1"}'),
  ('minio',       'data',      9000,  'http://localhost:9000/minio/health/live',         NULL,          true,  NULL,     '{"container": "phase66-minio"}'),
  ('rabbitmq',    'data',      5672,  NULL,                                              NULL,          true,  NULL,     '{"container": "phase66-rabbitmq", "management": 15672, "probe": "TCP"}'),
  ('langextract', 'data',      8095,  'http://localhost:8095/health',                    NULL,          false, NULL,     '{"container": "phase66-langextract", "notes": "NER + spaCy extraction"}'),
  ('trtllm',      'future',    8099,  'http://localhost:8099/health',                    'ollama',      false, 'gpu',    '{"notes": "TRT-LLM INT4 AWQ, requires WSL2 Docker GPU"}'),
  ('triton',      'future',    8000,  'http://localhost:8000/v2/health/ready',           'ollama',      false, 'gpu',    '{"notes": "Triton Inference Server"}'),
  ('grpc',        'future',    50051, NULL,                                              'ollama',      false, NULL,     '{"notes": "gRPC embedding bridge, falls back to Ollama HTTP"}'),
  ('couchdb',     'future',    5984,  'http://localhost:5984/_up',                       NULL,          false, 'full',   '{"notes": "ACE knowledge base, document store"}'),
  ('neo4j',       'future',    7687,  'http://localhost:7474/',                           NULL,          false, 'full',   '{"notes": "Graph DB for case relationships + entity graph"}'),
  ('nats',        'future',    4222,  NULL,                                              NULL,          false, 'full',   '{"notes": "QUIC bridge transport, type stubs only"}'),
  ('goSearch',    'future',    8096,  'http://localhost:8096/health',                    NULL,          false, NULL,     '{"notes": "Go microservice, not deployed"}')
ON CONFLICT (service_name) DO NOTHING;
