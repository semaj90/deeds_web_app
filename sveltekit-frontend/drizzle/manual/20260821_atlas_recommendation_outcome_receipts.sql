-- Parent Atlas recommendation outcome receipt durability
--
-- RecommendationOutcomeReceiptV1 remains the semantic contract owner in
-- packages/parent-atlas. This table is append-only persistence keyed by the
-- SHA-256 checksum of the complete immutable receipt.

CREATE TABLE IF NOT EXISTS atlas_recommendation_outcome_receipts (
  receipt_checksum        text        PRIMARY KEY CHECK (receipt_checksum ~ '^[a-f0-9]{64}$'),
  recommendation_id       text        NOT NULL,
  selected_action_id      text,
  resulting_execution_key text        NOT NULL CHECK (resulting_execution_key ~ '^[a-f0-9]{64}$'),
  followed_recommendation boolean     NOT NULL,
  outcome                 text,
  downstream_success      boolean,
  observed_at             timestamptz NOT NULL,
  producer_revision       text        NOT NULL,
  receipt_json             jsonb       NOT NULL,
  persisted_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atlas_recommendation_outcome_recommendation
  ON atlas_recommendation_outcome_receipts (recommendation_id, observed_at ASC);

CREATE INDEX IF NOT EXISTS idx_atlas_recommendation_outcome_execution
  ON atlas_recommendation_outcome_receipts (resulting_execution_key, observed_at ASC);

CREATE INDEX IF NOT EXISTS idx_atlas_recommendation_outcome_success
  ON atlas_recommendation_outcome_receipts (downstream_success, observed_at ASC)
  WHERE downstream_success IS NOT NULL;
