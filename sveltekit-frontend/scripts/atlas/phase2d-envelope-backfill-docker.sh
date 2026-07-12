#!/bin/bash
# Phase 2D Backfill via docker exec (avoids password issue)

LIMIT=${1:-100}
DRY_RUN=${2:-"--dry"}

docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db << 'EOF'

\echo '📦 Phase 2D: Envelope Backfill via Docker Exec'

-- Dry-run mode: show what would be updated
SELECT
  ap.packet_key,
  ap.feature_label,
  array_length(apf.ast_symbols, 1) as ast_count,
  array_length(apf.lexical_features, 1) as lexical_count,
  afe.tree_node_id IS NULL as needs_tree_node_id
FROM atlas_packets ap
LEFT JOIN atlas_packet_features apf ON ap.packet_key = apf.packet_key
LEFT JOIN atlas_feature_envelopes afe ON ap.packet_key = afe.packet_key
WHERE ap.packet_key IS NOT NULL
  AND (apf.ast_symbols IS NOT NULL OR apf.lexical_features IS NOT NULL)
LIMIT 10;

\echo ''
\echo 'Coverage metrics:'
SELECT
  COUNT(*) as total_packets,
  COUNT(DISTINCT CASE WHEN apf.ast_symbols IS NOT NULL THEN ap.packet_key END) as with_ast,
  COUNT(DISTINCT CASE WHEN apf.lexical_features IS NOT NULL THEN ap.packet_key END) as with_lexical,
  COUNT(DISTINCT CASE WHEN afe.tree_node_id IS NOT NULL THEN ap.packet_key END) as with_tree_node_id
FROM atlas_packets ap
LEFT JOIN atlas_packet_features apf ON ap.packet_key = apf.packet_key
LEFT JOIN atlas_feature_envelopes afe ON ap.packet_key = afe.packet_key;

EOF
