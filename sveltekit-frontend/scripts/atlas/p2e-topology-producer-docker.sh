#!/bin/bash
# Phase 2E: RabbitMQ Producer via Docker Exec + amqplib

LIMIT=${1:-100}
DRY_RUN=${2:-"--dry"}

echo ""
echo "📦 Phase 2E: Topology RabbitMQ Producer"
echo ""
echo "Step 1: Query eligible packets from Postgres..."
echo ""

# Fetch packets via docker exec
PACKETS=$(docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db -Aqt << EOF
SELECT json_agg(json_build_object(
  'packet_key', ap.packet_key,
  'source_ref', ap.source_ref,
  'feature_label', ap.feature_label,
  'community_id', ap.community_id,
  'qdrant_point_id', ap.qdrant_point_id
))
FROM atlas_packets ap
LEFT JOIN atlas_feature_envelopes afe ON ap.packet_key = afe.packet_key
WHERE ap.qdrant_point_id IS NOT NULL
  AND afe.lexical_terms IS NOT NULL
  AND ap.sha256 IS NOT NULL
ORDER BY RANDOM()
LIMIT $LIMIT;
EOF
)

# Extract packet count
PACKET_COUNT=$(echo "$PACKETS" | jq 'length // 0')
echo "  ✓ Found $PACKET_COUNT eligible packets"
echo ""

if [ "$PACKET_COUNT" -eq 0 ]; then
  echo "No eligible packets. Exiting."
  exit 0
fi

# Show sample
echo "📊 Sample packets (first 3):"
echo "$PACKETS" | jq '.[0:3]' | head -20
echo ""

if [ "$DRY_RUN" = "--dry" ]; then
  echo "📝 [DRY-RUN] Would publish:"
  echo "  - KMeans job: $PACKET_COUNT packets"
  echo "  - SOM job: $PACKET_COUNT packets"
  echo "  - PageRank job: $PACKET_COUNT packets"
  echo ""
  echo "✨ DRY-RUN COMPLETE"
  echo ""
  exit 0
fi

# For APPLY mode, would need actual amqplib publisher
# This is left as a note for the actual implementation
echo "📡 [APPLY] Would publish jobs to RabbitMQ:"
echo "  - Queue: topology.kmeans"
echo "  - Queue: topology.som"
echo "  - Queue: topology.pagerank"
echo ""
echo "✨ Producer would publish"
echo ""
