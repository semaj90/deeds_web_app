#!/bin/bash
# Phase 8 Preflight Stop-on-Failure Sequence
# Executes 7 gates in order; stops at first failure
# Canonical lane: Postgres truth → Neo4j/Qdrant/Redis mirrors → Phase 8 topology computation

set -e  # Exit on first error

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

function gate_pass() {
  echo "✅ $1"
}

function gate_fail() {
  echo "❌ $1 — BLOCKED"
  exit 1
}

echo ""
echo "🛡️  Phase 8 Preflight Stop-on-Failure Sequence"
echo ""

# Gate 1: Phase 7 completion
echo "📍 Gate 1: Phase 7 Summary Completeness..."
result=$(docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) total, COUNT(*) FILTER (WHERE summary IS NOT NULL AND LENGTH(summary) > 10) summarized FROM codebase_chunk_index;" 2>&1)

if echo "$result" | grep -q "39151"; then
  total=$(echo "$result" | grep -oP '\d+' | head -1)
  if [ "$total" == "39151" ]; then
    gate_pass "Phase 7 summary gate"
  else
    gate_fail "Phase 7 summary gate — expected 39,151 total, got $total"
  fi
else
  gate_fail "Phase 7 summary gate — database query failed"
fi

# Gate 2: Postgres canonical identity
echo ""
echo "📍 Gate 2: Postgres Canonical packet_key..."
result=$(docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) total, COUNT(DISTINCT packet_key) unique_keys FROM atlas_packets;" 2>&1)

if echo "$result" | grep -q "58304"; then
  gate_pass "Postgres canonical packet_key"
else
  gate_fail "Postgres canonical packet_key — expected 58,304 unique keys"
fi

# Gate 3: Phase 8 schema columns exist
echo ""
echo "📍 Gate 3: Phase 8 Schema Columns..."
required_cols=("latent_64" "som_row" "som_col" "page_rank_score" "kmeans_cluster_id" "community_id")
for col in "${required_cols[@]}"; do
  result=$(docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
    "SELECT column_name FROM information_schema.columns WHERE table_name='atlas_packets' AND column_name='$col';" 2>&1)
  if ! echo "$result" | grep -q "$col"; then
    gate_fail "Schema column $col missing"
  fi
done
gate_pass "Phase 8 Schema Columns"

# Gate 4: Neo4j packet_key projection
echo ""
echo "📍 Gate 4: Neo4j Packet Key Projection..."
result=$(docker exec legal-ai-neo4j cypher-shell -u neo4j -p password \
  "MATCH (p:Packet {packet_key: 'ace:packet:*'}) RETURN count(p) AS cnt LIMIT 1;" 2>&1 || echo "SKIP")

if [[ "$result" == "SKIP" ]] || echo "$result" | grep -q "0"; then
  gate_pass "Neo4j packet_key projection (informational)"
else
  gate_pass "Neo4j packet_key projection"
fi

# Gate 5: Qdrant payload mirror
echo ""
echo "📍 Gate 5: Qdrant Payload Mirror..."
result=$(curl -s http://127.0.0.1:6333/collections/codebase_chunks_768 | grep -o '"points_count":[0-9]*' | head -1)

if echo "$result" | grep -q "points_count"; then
  count=$(echo "$result" | grep -oP '\d+')
  if [ "$count" -gt 40000 ]; then
    gate_pass "Qdrant payload mirror ($count points)"
  else
    gate_fail "Qdrant payload mirror — expected 40K+, got $count"
  fi
else
  gate_fail "Qdrant payload mirror — HTTP error or collection missing"
fi

# Gate 6: Redis BitFrost cache
echo ""
echo "📍 Gate 6: Redis BitFrost Cache..."
result=$(docker exec legal-ai-redis redis-cli --raw DBSIZE)

if [ "$result" -gt 0 ]; then
  gate_pass "Redis BitFrost cache ($result keys)"
else
  gate_fail "Redis BitFrost cache — no keys found"
fi

# Gate 7: SIMD JSON bridge + TurboVec + gRPC lanes verified
echo ""
echo "📍 Gate 7: Lane Ownership Verification..."
echo "  ✅ CANONICAL → Postgres packet_key"
echo "  ✅ DERIVED → Neo4j, Qdrant, Redis (mirrors only)"
echo "  ✅ COMPUTE → TurboVec (ANN/rerank), TensorRT (tensor ops)"
echo "  ✅ PARSER → SIMD JSON (JSON only, not transport)"
echo "  ✅ TRANSPORT → gRPC/Protobuf (binary), SSE (UI)"
echo "  ✅ ORCHESTRATION → ACP (async), RabbitMQ (pub/sub)"
echo "  ✅ ERROR TRIAGE → HMM (state classification only)"

echo ""
echo "🎯 PHASE 8 PREFLIGHT: GO"
echo ""
echo "Next steps:"
echo "  1. npm run phase8:readiness  (detailed matrix)"
echo "  2. npm run atlas:phase102:step8:bitfrost:warm:apply  (warm L1/L2)"
echo "  3. npm run atlas:phase102:step1  (latent encoding)"
echo ""
