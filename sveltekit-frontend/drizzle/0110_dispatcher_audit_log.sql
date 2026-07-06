-- Dispatcher Audit Log Table
-- Persists all dispatcher decisions for traceability + debugging
-- Supports 30-day rolling retention (partition by month)

CREATE TABLE IF NOT EXISTS dispatcher_audit_log (
  id BIGSERIAL PRIMARY KEY,

  -- Identity
  packet_key VARCHAR(255) NOT NULL,
  source_ref VARCHAR(500),
  feature_id VARCHAR(255),

  -- Dispatch Decision
  dispatch_decision VARCHAR(50) NOT NULL,
  dispatch_confidence REAL,
  identity_lane VARCHAR(50),
  parity_status VARCHAR(50),

  -- Mirror Sync Results (JSON for flexibility)
  mirror_syncs JSONB,

  -- Events
  events_emitted INTEGER DEFAULT 0,

  -- Execution Details
  synthesis_path TEXT[],
  tool_calls JSONB,
  errors TEXT[],
  latency_ms INTEGER,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'success', -- success | partial_failure | failure
  result JSONB,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_dispatcher_audit_packet_key
  ON dispatcher_audit_log(packet_key);

CREATE INDEX IF NOT EXISTS idx_dispatcher_audit_decision
  ON dispatcher_audit_log(dispatch_decision);

CREATE INDEX IF NOT EXISTS idx_dispatcher_audit_created_at
  ON dispatcher_audit_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dispatcher_audit_status
  ON dispatcher_audit_log(status);

-- Composite index for time-range + status queries
CREATE INDEX IF NOT EXISTS idx_dispatcher_audit_created_status
  ON dispatcher_audit_log(created_at DESC, status);

-- JSONB index for mirror_syncs queries
CREATE INDEX IF NOT EXISTS idx_dispatcher_audit_mirror_syncs
  ON dispatcher_audit_log USING GIN(mirror_syncs);
