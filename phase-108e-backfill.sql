-- Phase 108E Backfill Script
-- Backfill workspace_id from directory_path
BEGIN;

UPDATE atlas_packets
SET workspace_id = CASE
  WHEN directory_path IS NOT NULL AND directory_path != '' THEN directory_path
  ELSE 'docs'
END
WHERE workspace_id = 'unknown';

-- Backfill semantic_anchor from feature_label or feature_id
UPDATE atlas_packets
SET semantic_anchor = COALESCE(
  NULLIF(feature_label, ''),
  NULLIF(feature_id, ''),
  'unknown'
)
WHERE semantic_anchor = 'unknown';

-- Backfill ontology_version
UPDATE atlas_packets
SET ontology_version = 'v1.0'
WHERE ontology_version IS NULL;

-- Extract content_hash from payload
UPDATE atlas_packets
SET content_hash = payload ->> 'content_hash'
WHERE content_hash IS NULL AND payload IS NOT NULL AND (payload ->> 'content_hash') IS NOT NULL;

COMMIT;

-- Verification queries
SELECT COUNT(*) as total,
  COUNT(CASE WHEN workspace_id != 'unknown' THEN 1 END) with_workspace,
  COUNT(CASE WHEN semantic_anchor != 'unknown' THEN 1 END) with_anchor,
  COUNT(CASE WHEN ontology_version IS NOT NULL THEN 1 END) with_ontology,
  COUNT(CASE WHEN content_hash IS NOT NULL THEN 1 END) with_hash
FROM atlas_packets;
