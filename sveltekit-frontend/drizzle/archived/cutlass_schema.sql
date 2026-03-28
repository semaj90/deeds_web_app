-- Phase 78: Cutlass Error Brain Schema
-- Safe migration (IF NOT EXISTS)

-- 1. Route Health Tracking
CREATE TABLE IF NOT EXISTS route_health (
  id SERIAL PRIMARY KEY,
  route_path TEXT NOT NULL UNIQUE,
  error_state TEXT NOT NULL,
  last_checked TIMESTAMP DEFAULT NOW(),
  error_count INTEGER DEFAULT 0,
  health_score INTEGER DEFAULT 100,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_route_health_path ON route_health(route_path);

-- 2. Error Events Log
CREATE TABLE IF NOT EXISTS error_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_path TEXT NOT NULL,
  file_path TEXT,
  message TEXT NOT NULL,
  stack_trace TEXT,
  ts_code TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_events_route ON error_events(route_path);
CREATE INDEX IF NOT EXISTS idx_error_events_created ON error_events(created_at);

-- 3. Error Suggestions (Brain Cache)
CREATE TABLE IF NOT EXISTS error_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_path TEXT NOT NULL,
  summary TEXT NOT NULL,
  patch TEXT NOT NULL,
  risk_level TEXT DEFAULT 'medium',
  source TEXT DEFAULT 'synthesized',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_suggestions_route ON error_suggestions(route_path);
