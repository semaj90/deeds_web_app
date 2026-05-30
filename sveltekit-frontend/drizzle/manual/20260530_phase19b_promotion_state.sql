/**
 * Phase 19B: Atlas Card Promotion State Tracking
 *
 * Adds promotion_state, promotion_boost, and base_score columns to chunk_hit_log
 * for memory lifecycle tracking in the ACE context assembler.
 *
 * These columns allow us to:
 * 1. Track which promotion state a chunk was in when retrieved
 * 2. Measure the impact of promotion boosts on ranking
 * 3. Analyze promotion state progression over time
 * 4. Build training pairs for LoRA fine-tuning
 */

-- Add promotion state columns to chunk_hit_log
ALTER TABLE chunk_hit_log
  ADD COLUMN IF NOT EXISTS promotion_state TEXT DEFAULT 'fresh' CHECK (promotion_state IN ('fresh', 'engaged', 'warm', 'hot', 'archived')),
  ADD COLUMN IF NOT EXISTS promotion_boost REAL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS base_score REAL;

-- Create index for fast promotion state queries
CREATE INDEX IF NOT EXISTS chunk_hit_promotion_state_idx
  ON chunk_hit_log(promotion_state, hit_at DESC);

-- Create index for boost analysis (sorting by promotion_boost)
CREATE INDEX IF NOT EXISTS chunk_hit_promotion_boost_idx
  ON chunk_hit_log(promotion_boost DESC, hit_at DESC);

-- Comment explaining the new columns for future developers
COMMENT ON COLUMN chunk_hit_log.promotion_state IS 'Atlas card lifecycle state when hit: fresh (0 uses), engaged (1-3 uses), warm (reward>0.6), hot (reuse>80%), archived (30d unused)';
COMMENT ON COLUMN chunk_hit_log.promotion_boost IS 'Ranking boost applied: 1.0 (fresh), 1.2 (engaged), 1.8 (warm), 3.0 (hot), 0.1 (archived)';
COMMENT ON COLUMN chunk_hit_log.base_score IS 'Original score before promotion boost applied (for analysis of boost impact)';
