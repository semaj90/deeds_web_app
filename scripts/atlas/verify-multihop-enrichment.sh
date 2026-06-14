#!/bin/bash

# verify-multihop-enrichment.sh
# Verify that Qdrant payload and Karpathy GPU enrichment are complete
# before re-generating the multihop enriched map

set -e

echo "╔════════════════════════════════════════════════════════╗"
echo "║ Multihop Enrichment Verification                       ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# ─ Check Qdrant payload enrichment
echo "1️⃣  Qdrant Payload Enrichment"
qdrant_count=$(curl -s 'http://localhost:6333/collections/codebase_chunks_768' | jq '.result.points_count' 2>/dev/null || echo "0")
if [ "$qdrant_count" -gt "0" ]; then
  echo "   ✅ Qdrant points: $qdrant_count"

  # Sample a point to check for enriched payload
  sample=$(curl -s 'http://localhost:6333/collections/codebase_chunks_768/points?limit=1' 2>/dev/null)
  has_feature_id=$(echo "$sample" | jq '.result.points[0].payload.feature_id // empty' | grep -c . || echo "0")
  has_community=$(echo "$sample" | jq '.result.points[0].payload.community_id // empty' | grep -c . || echo "0")

  if [ "$has_feature_id" -gt "0" ] && [ "$has_community" -gt "0" ]; then
    echo "   ✅ Sample point has enriched payload (feature_id, community_id)"
  else
    echo "   ⚠️  Sample point may not be enriched yet"
  fi
else
  echo "   ❌ Qdrant unavailable"
  exit 1
fi

echo ""

# ─ Check Karpathy GPU enrichment
echo "2️⃣  Karpathy GPU Enrichment (Redis)"
karpathy_count=$(docker exec legal-ai-redis redis-cli HLEN gpu:karpathy:scores 2>/dev/null || echo "0")
if [ "$karpathy_count" -gt "0" ]; then
  echo "   ✅ Karpathy scores cached: $karpathy_count entries"

  # Sample a score
  sample_key=$(docker exec legal-ai-redis redis-cli HKEYS gpu:karpathy:scores 2>/dev/null | head -1)
  if [ -n "$sample_key" ]; then
    sample_score=$(docker exec legal-ai-redis redis-cli HGET gpu:karpathy:scores "$sample_key" 2>/dev/null)
    echo "   ✅ Sample score: $sample_score"
  fi
else
  echo "   ⚠️  Karpathy scores not yet computed"
fi

echo ""

# ─ Check PostgreSQL canonical packets
echo "3️⃣  PostgreSQL Canonical Packets"
postgres_count=$(docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM atlas_packets" 2>/dev/null | grep -oE "[0-9]+" | tail -1)
if [ "$postgres_count" -gt "0" ]; then
  echo "   ✅ Canonical packets: $postgres_count"
else
  echo "   ❌ PostgreSQL unavailable"
  exit 1
fi

echo ""

# ─ Summary
echo "╔════════════════════════════════════════════════════════╗"
echo "║ Readiness Status                                       ║"
echo "╚════════════════════════════════════════════════════════╝"

if [ "$karpathy_count" -gt "1000" ]; then
  echo "✅ Ready to re-generate enriched multihop map!"
  echo ""
  echo "Run: npm run atlas:multihop:enriched:generate"
  echo ""
  exit 0
else
  echo "⏳ Waiting for Karpathy GPU enrichment..."
  echo "   Current: $karpathy_count Karpathy scores"
  echo "   Expected: ~17,485 scores"
  echo ""
  echo "Run this script again in 5 minutes:"
  echo "   bash scripts/atlas/verify-multihop-enrichment.sh"
  echo ""
  exit 1
fi
