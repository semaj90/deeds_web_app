-- Create GPU Inference Demo Tables
-- Run this migration to set up the demo database schema

-- GPU Inference Sessions Table
CREATE TABLE IF NOT EXISTS gpu_inference_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_name TEXT NOT NULL,
  user_id TEXT,
  engine_used TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB,
  is_active BOOLEAN DEFAULT true
);

-- GPU Inference Messages Table
CREATE TABLE IF NOT EXISTS gpu_inference_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES gpu_inference_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  embedding REAL[], -- Vector embedding of the message
  engine_used TEXT, -- Which AI engine was used for this response
  response_time INTEGER, -- Response time in milliseconds
  tokens_generated INTEGER,
  cache_hit BOOLEAN DEFAULT false,
  metadata JSONB, -- Engine-specific metadata, performance stats
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- GPU Performance Metrics Table
CREATE TABLE IF NOT EXISTS gpu_performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES gpu_inference_sessions(id) ON DELETE CASCADE,
  engine_type TEXT NOT NULL,
  request_count INTEGER,
  avg_response_time REAL,
  cache_hit_rate REAL,
  tokens_per_second REAL,
  gpu_utilization REAL,
  memory_usage REAL,
  error_count INTEGER,
  metadata JSONB, -- Detailed performance data
  measured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- AI Engine Status Table
CREATE TABLE IF NOT EXISTS ai_engine_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_name TEXT NOT NULL UNIQUE,
  is_online BOOLEAN DEFAULT false,
  last_health_check TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  response_time INTEGER, -- Health check response time
  version TEXT,
  capabilities JSONB, -- What features this engine supports
  configuration JSONB, -- Engine-specific config
  error_status TEXT,
  metadata JSONB
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_gpu_inference_messages_session_id ON gpu_inference_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_gpu_inference_messages_created_at ON gpu_inference_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_gpu_inference_messages_role ON gpu_inference_messages(role);
CREATE INDEX IF NOT EXISTS idx_gpu_inference_messages_engine_used ON gpu_inference_messages(engine_used);

CREATE INDEX IF NOT EXISTS idx_gpu_performance_metrics_session_id ON gpu_performance_metrics(session_id);
CREATE INDEX IF NOT EXISTS idx_gpu_performance_metrics_engine_type ON gpu_performance_metrics(engine_type);
CREATE INDEX IF NOT EXISTS idx_gpu_performance_metrics_measured_at ON gpu_performance_metrics(measured_at);

CREATE INDEX IF NOT EXISTS idx_gpu_inference_sessions_user_id ON gpu_inference_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_gpu_inference_sessions_created_at ON gpu_inference_sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_gpu_inference_sessions_is_active ON gpu_inference_sessions(is_active);

CREATE INDEX IF NOT EXISTS idx_ai_engine_status_engine_name ON ai_engine_status(engine_name);
CREATE INDEX IF NOT EXISTS idx_ai_engine_status_is_online ON ai_engine_status(is_online);

-- Create vector embedding index if pgvector is available
DO $$ 
BEGIN
  -- Try to create vector index, ignore if pgvector extension not available
  BEGIN
    CREATE INDEX IF NOT EXISTS idx_gpu_inference_messages_embedding 
    ON gpu_inference_messages USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
  EXCEPTION WHEN OTHERS THEN
    -- Ignore error if vector extension not available
    NULL;
  END;
END $$;

-- Insert default engine status entries
INSERT INTO ai_engine_status (engine_name, is_online, capabilities, configuration) VALUES 
  ('webgpu', false, '{"compute_shaders": true, "texture_streaming": true, "nes_orchestrator": true}', '{"memory_regions": ["PRG_ROM", "CHR_ROM", "PPU_MEMORY", "SPRITE_MEMORY"]}'),
  ('ollama', false, '{"text_generation": true, "legal_analysis": true, "cuda_acceleration": true}', '{"model": "gemma3-legal", "gpu_layers": 35}'),
  ('vllm', false, '{"webgpu_som_caching": true, "quic_streaming": true, "tensor_core_acceleration": true, "concurrent_streams": 1000}', '{"som_cache_size": "64x64", "similarity_threshold": 0.85}'),
  ('fastembed', false, '{"gpu_embeddings": true, "batch_processing": true, "multiple_models": true, "cuda_acceleration": true}', '{"models": ["BAAI/bge-small-en-v1.5", "sentence-transformers/all-MiniLM-L6-v2"]}')
ON CONFLICT (engine_name) DO NOTHING;

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_gpu_inference_sessions_updated_at 
  BEFORE UPDATE ON gpu_inference_sessions 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant appropriate permissions (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO your_app_user;