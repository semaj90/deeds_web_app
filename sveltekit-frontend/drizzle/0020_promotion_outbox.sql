-- Step 6-7: Transactional Promotion with Outbox Pattern
-- Enables reliable promotion of retrieval results back through canonical layers
-- without loss on process restart (Postgres transaction → outbox → worker queue)

-- 1. Create outbox table for reliable job queueing
CREATE TABLE IF NOT EXISTS promotion_outbox (
  id BIGSERIAL PRIMARY KEY,
  packet_key TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  content_hash TEXT,
  summary TEXT,
  operation TEXT NOT NULL CHECK (operation IN ('promote_summary', 'promote_embedding', 'promote_qdrant', 'promote_neo4j')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  payload JSONB NOT NULL DEFAULT '{}',
  error_message TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 3,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Partial unique index for pending jobs (ensures no duplicate pending promotions)
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_promotion_outbox_unique_pending
ON promotion_outbox (packet_key, source_ref, operation)
WHERE status = 'pending';

-- 2. Create indexes for efficient dequeue
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_promotion_outbox_pending
ON promotion_outbox (created_at ASC)
WHERE status = 'pending';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_promotion_outbox_processing
ON promotion_outbox (started_at ASC)
WHERE status = 'processing';

-- 3. Create table to track promotion decision ledger
CREATE TABLE IF NOT EXISTS retrieval_promotion_decisions (
  id BIGSERIAL PRIMARY KEY,
  packet_key TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  query_text TEXT,
  user_id TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('promote', 'defer', 'skip', 'error')),
  reason JSONB NOT NULL DEFAULT '{}',
  stages_completed TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  stages_failed TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  retrieval_score REAL,
  fusion_score REAL,
  rerank_score REAL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 4. Index for decision auditing
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_retrieval_promotion_decisions_decision
ON retrieval_promotion_decisions (decision)
WHERE decision = 'promote';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_retrieval_promotion_decisions_user
ON retrieval_promotion_decisions (user_id, created_at DESC);

-- 5. Create function to safely insert promotion records in transaction
CREATE OR REPLACE FUNCTION enqueue_promotion(
  p_packet_key TEXT,
  p_source_ref TEXT,
  p_content_hash TEXT,
  p_summary TEXT,
  p_operation TEXT,
  p_payload JSONB DEFAULT '{}'::JSONB
)
RETURNS BIGINT AS $$
DECLARE
  v_outbox_id BIGINT;
BEGIN
  INSERT INTO promotion_outbox (packet_key, source_ref, content_hash, summary, operation, payload, status)
  VALUES (p_packet_key, p_source_ref, p_content_hash, p_summary, p_operation, p_payload, 'pending')
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_outbox_id;

  RETURN COALESCE(v_outbox_id, 0);
END;
$$ LANGUAGE plpgsql;

-- 6. Create function to mark jobs as processing
CREATE OR REPLACE FUNCTION dequeue_promotion(p_batch_size INT DEFAULT 10)
RETURNS TABLE(
  id BIGINT,
  packet_key TEXT,
  source_ref TEXT,
  content_hash TEXT,
  summary TEXT,
  operation TEXT,
  payload JSONB
) AS $$
BEGIN
  UPDATE promotion_outbox
  SET status = 'processing', started_at = NOW()
  WHERE id IN (
    SELECT id FROM promotion_outbox
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING promotion_outbox.id, promotion_outbox.packet_key, promotion_outbox.source_ref,
            promotion_outbox.content_hash, promotion_outbox.summary, promotion_outbox.operation,
            promotion_outbox.payload INTO id, packet_key, source_ref, content_hash, summary, operation, payload;
END;
$$ LANGUAGE plpgsql;

-- 7. Create function to mark jobs as completed
CREATE OR REPLACE FUNCTION mark_promotion_completed(
  p_id BIGINT,
  p_success BOOLEAN DEFAULT TRUE,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  UPDATE promotion_outbox
  SET
    status = CASE WHEN p_success THEN 'completed' ELSE 'failed' END,
    completed_at = NOW(),
    error_message = p_error_message,
    retry_count = CASE WHEN NOT p_success THEN retry_count + 1 ELSE retry_count END
  WHERE id = p_id;

  -- If failed but retries remain, requeue as pending
  IF NOT p_success AND (SELECT retry_count FROM promotion_outbox WHERE id = p_id) < (SELECT max_retries FROM promotion_outbox WHERE id = p_id) THEN
    UPDATE promotion_outbox
    SET status = 'pending', started_at = NULL
    WHERE id = p_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Verify tables created
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('promotion_outbox', 'retrieval_promotion_decisions')
ORDER BY table_name;
