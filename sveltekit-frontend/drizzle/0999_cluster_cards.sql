-- Migration: Add cluster_cards table for idempotent cluster artifact storage
-- Purpose: Store validated cluster-cards.jsonl NDJSON artifacts as Postgres JSONB
-- Status: Safe - IF NOT EXISTS guards prevent re-run errors

CREATE TABLE IF NOT EXISTS cluster_cards (
  id text PRIMARY KEY,
  card jsonb NOT NULL,
  centroid_dim int,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Full-text search index on card JSONB for label/description/summary fields
CREATE INDEX IF NOT EXISTS cluster_cards_card_gin
ON cluster_cards USING gin(card);

-- Optimize for (id, created_at) range queries (warm cache by date range)
CREATE INDEX IF NOT EXISTS cluster_cards_created_at
ON cluster_cards(created_at DESC);

-- Optimize for (centroid_dim) filtering (query by embedding dimension)
CREATE INDEX IF NOT EXISTS cluster_cards_centroid_dim
ON cluster_cards(centroid_dim);

-- Add trigger to auto-update updated_at on row modification
CREATE OR REPLACE FUNCTION update_cluster_cards_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cluster_cards_update_trigger ON cluster_cards;
CREATE TRIGGER cluster_cards_update_trigger
BEFORE UPDATE ON cluster_cards
FOR EACH ROW
EXECUTE FUNCTION update_cluster_cards_updated_at();
