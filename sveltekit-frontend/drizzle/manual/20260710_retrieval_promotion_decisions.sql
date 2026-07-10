-- Retrieval Promotion Decisions Table
-- Records where packets are promoted/routed after ranking
-- Used for telemetry + feedback loop

CREATE TABLE IF NOT EXISTS retrieval_promotion_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Trace correlation
  trace_id VARCHAR(100) NOT NULL,

  -- Packet identity
  packet_key VARCHAR(255) NOT NULL,
  rank INTEGER NOT NULL,
  final_score REAL NOT NULL,

  -- Promotion outcome
  selected BOOLEAN NOT NULL,
  destination VARCHAR(50) NOT NULL,

  -- Validation state
  validation_gate_passed BOOLEAN NOT NULL,
  reason_codes TEXT[] DEFAULT ARRAY[]::TEXT[],

  -- Audit trail
  created_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT valid_destination CHECK (
    destination IN (
      'browser-l1',
      'valkey-hot',
      'valkey-warm',
      'analytics-only',
      'cold-archive'
    )
  )
);

-- Index for trace correlation
CREATE INDEX IF NOT EXISTS idx_retrieval_promo_trace_id ON retrieval_promotion_decisions(trace_id);

-- Index for destination routing analysis
CREATE INDEX IF NOT EXISTS idx_retrieval_promo_destination ON retrieval_promotion_decisions(destination);

-- Index for packet analysis
CREATE INDEX IF NOT EXISTS idx_retrieval_promo_packet_key ON retrieval_promotion_decisions(packet_key);

-- Partial index for selected winners only (common query)
CREATE INDEX IF NOT EXISTS idx_retrieval_promo_selected ON retrieval_promotion_decisions(packet_key, final_score DESC)
  WHERE selected = true;
