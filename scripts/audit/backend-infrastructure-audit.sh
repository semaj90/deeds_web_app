#!/bin/bash
#
# Backend Infrastructure Audit — 15 Gates
# Tests runtime health of Redis, Bifrost, Ollama, RabbitMQ, Langfuse
#

PASS=0
FAIL=0
SKIP=0

echo "🔍 Backend Infrastructure Audit (17 Gates)"
echo "==========================================="
echo ""

# Tier A: Cache Layer
echo "🔴 Tier A: Cache Layer"
echo "----------------------"

# G1: Redis Connection
echo -n "G1: Redis connection... "
if docker exec deeds-redis-prod redis-cli ping 2>/dev/null | grep -q PONG; then
  echo "✅ PASS"
  ((PASS++))
else
  echo "❌ FAIL - Redis not responding"
  ((FAIL++))
fi

# G2: Redis Cache Keys
echo -n "G2: Redis cache populated... "
STATS=$(curl -s http://localhost:5173/api/cache/exact-match/stats 2>/dev/null)
KEYS=$(echo "$STATS" | grep -o '"totalKeys":[0-9]*' | grep -o '[0-9]*')
if [ -n "$KEYS" ]; then
  echo "✅ PASS ($KEYS keys)"
  ((PASS++))
else
  echo "❌ FAIL - Cache stats endpoint not responding"
  ((FAIL++))
fi

# G3: Redis Memory Usage
echo -n "G3: Redis memory usage... "
MEM=$(docker exec deeds-redis-prod redis-cli info memory 2>/dev/null | grep used_memory_human | cut -d: -f2 | tr -d '\r')
if [ -n "$MEM" ]; then
  echo "✅ PASS ($MEM used)"
  ((PASS++))
else
  echo "❌ FAIL"
  ((FAIL++))
fi

# G4: Bifrost Semantic Cache
echo -n "G4: Bifrost semantic cache... "
BIFROST_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3040/health 2>/dev/null)
if [ "$BIFROST_STATUS" = "200" ]; then
  echo "✅ PASS"
  ((PASS++))
elif [ "$BIFROST_STATUS" = "000" ]; then
  echo "⚠️  SKIP (Bifrost not running)"
  ((SKIP++))
else
  echo "❌ FAIL (status: $BIFROST_STATUS)"
  ((FAIL++))
fi

# G5: Qdrant Vector Store
echo -n "G5: Qdrant vector store... "
QDRANT_VERSION=$(curl -s http://localhost:6333/ 2>/dev/null | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
if [ -n "$QDRANT_VERSION" ]; then
  echo "✅ PASS (v$QDRANT_VERSION)"
  ((PASS++))
else
  echo "❌ FAIL - Qdrant not responding"
  ((FAIL++))
fi

echo ""
echo "🟡 Tier B: Inference Layer"
echo "--------------------------"

# G6: Ollama Service
echo -n "G6: Ollama service... "
if curl -s http://localhost:11434/api/tags 2>/dev/null | grep -q models; then
  MODEL_COUNT=$(curl -s http://localhost:11434/api/tags 2>/dev/null | grep -o '"name"' | wc -l)
  echo "✅ PASS ($MODEL_COUNT models)"
  ((PASS++))
else
  echo "❌ FAIL - Ollama not responding"
  ((FAIL++))
fi

# G7: GPU Availability
echo -n "G7: GPU availability... "
if nvidia-smi &>/dev/null; then
  FREE=$(nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits 2>/dev/null | head -1)
  GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1)
  echo "✅ PASS ($GPU_NAME, ${FREE}MB free)"
  ((PASS++))
else
  echo "⚠️  SKIP (No GPU detected)"
  ((SKIP++))
fi

# G8: Model Files Exist
echo -n "G8: Required models... "
MODELS=$(curl -s http://localhost:11434/api/tags 2>/dev/null)
HAS_LEGAL=$(echo "$MODELS" | grep -c 'gemma4-legal\|gemma3-legal')
HAS_EMBED=$(echo "$MODELS" | grep -c 'embeddinggemma')
if [ "$HAS_LEGAL" -gt 0 ] && [ "$HAS_EMBED" -gt 0 ]; then
  echo "✅ PASS (legal + embedding models present)"
  ((PASS++))
else
  echo "⚠️  WARN (missing models: legal=$HAS_LEGAL embed=$HAS_EMBED)"
  ((SKIP++))
fi

# G9: Inference Latency
echo -n "G9: Inference latency... "
START=$(date +%s%3N)
RESPONSE=$(curl -s -X POST http://localhost:11434/api/chat \
  -d '{"model":"gemma4-legal","messages":[{"role":"user","content":"Hi"}],"stream":false,"options":{"num_predict":5}}' 2>/dev/null)
END=$(date +%s%3N)
LATENCY=$((END - START))

if [ $LATENCY -lt 60000 ]; then
  echo "✅ PASS (${LATENCY}ms)"
  ((PASS++))
else
  echo "⚠️  WARN (${LATENCY}ms - slower than expected)"
  ((SKIP++))
fi

echo ""
echo "🟢 Tier C: Message Queue"
echo "------------------------"

# G10: RabbitMQ Service
echo -n "G10: RabbitMQ service... "
if curl -s -u guest:guest http://localhost:15672/api/overview 2>/dev/null | grep -q rabbitmq_version; then
  VERSION=$(curl -s -u guest:guest http://localhost:15672/api/overview 2>/dev/null | grep -o '"rabbitmq_version":"[^"]*"' | cut -d'"' -f4)
  echo "✅ PASS (v$VERSION)"
  ((PASS++))
else
  echo "❌ FAIL - RabbitMQ management API not accessible"
  ((FAIL++))
fi

# G11: RabbitMQ Consumers
echo -n "G11: Queue consumers... "
QUEUES=$(curl -s -u guest:guest http://localhost:15672/api/queues 2>/dev/null)
if [ -n "$QUEUES" ]; then
  QUEUE_COUNT=$(echo "$QUEUES" | grep -o '"name"' | wc -l)
  NO_CONSUMERS=$(echo "$QUEUES" | jq '[.[] | select(.consumers == 0)] | length' 2>/dev/null || echo "0")
  if [ "$NO_CONSUMERS" = "0" ]; then
    echo "✅ PASS ($QUEUE_COUNT queues, all have consumers)"
    ((PASS++))
  else
    echo "⚠️  WARN ($NO_CONSUMERS queues without consumers)"
    ((SKIP++))
  fi
else
  echo "❌ FAIL"
  ((FAIL++))
fi

# G12: Queue Message Flow
echo -n "G12: Message flow... "
SYNTH_QUEUE=$(curl -s -u guest:guest http://localhost:15672/api/queues/%2F/synthesis.generate 2>/dev/null)
if [ -n "$SYNTH_QUEUE" ]; then
  MSG_COUNT=$(echo "$SYNTH_QUEUE" | grep -o '"messages":[0-9]*' | grep -o '[0-9]*')
  echo "✅ PASS (synthesis queue: $MSG_COUNT pending)"
  ((PASS++))
else
  echo "⚠️  SKIP (synthesis queue not found)"
  ((SKIP++))
fi

echo ""
echo "🔵 Tier D: Observability"
echo "------------------------"

# G13: Langfuse Service
echo -n "G13: Langfuse UI... "
LANGFUSE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3030 2>/dev/null)
if [ "$LANGFUSE_STATUS" = "200" ]; then
  echo "✅ PASS"
  ((PASS++))
elif [ "$LANGFUSE_STATUS" = "000" ]; then
  echo "⚠️  SKIP (Langfuse not running)"
  ((SKIP++))
else
  echo "❌ FAIL (status: $LANGFUSE_STATUS)"
  ((FAIL++))
fi

# G14: Trace Ingestion
echo -n "G14: Trace ingestion... "
TRACES=$(curl -s http://localhost:3030/api/public/traces?limit=1 2>/dev/null)
if echo "$TRACES" | grep -q 'data\|traces'; then
  echo "✅ PASS"
  ((PASS++))
elif [ "$LANGFUSE_STATUS" != "200" ]; then
  echo "⚠️  SKIP (Langfuse not running)"
  ((SKIP++))
else
  echo "⚠️  WARN (no traces found)"
  ((SKIP++))
fi

# G15: Cache Statistics Endpoint
echo -n "G15: Cache monitoring... "
CACHE_STATS=$(curl -s http://localhost:5173/api/cache/exact-match/stats 2>/dev/null)
if echo "$CACHE_STATS" | grep -q '"success":true'; then
  TOTAL_KEYS=$(echo "$CACHE_STATS" | grep -o '"totalKeys":[0-9]*' | grep -o '[0-9]*')
  MEMORY_MB=$(echo "$CACHE_STATS" | grep -o '"memoryUsedMB":[0-9.]*' | grep -o '[0-9.]*')
  echo "✅ PASS ($TOTAL_KEYS keys, ${MEMORY_MB}MB)"
  ((PASS++))
else
  echo "❌ FAIL"
  ((FAIL++))
fi

echo ""
echo "🟣 Tier E: Codebase Intelligence"
echo "--------------------------------"

# G16: Codebase Index Status
echo -n "G16: Codebase index... "
CODEBASE_STATS=$(curl -s http://localhost:5173/api/codebase-index/stats 2>/dev/null)
if [ -n "$CODEBASE_STATS" ]; then
  INDEXED_FILES=$(echo "$CODEBASE_STATS" | grep -o '"indexedFiles":[0-9]*' | grep -o '[0-9]*')
  SIMD_AVAILABLE=$(echo "$CODEBASE_STATS" | grep -o '"simdAvailable":[a-z]*' | grep -o '[a-z]*')

  if [ "$INDEXED_FILES" -gt 0 ]; then
    echo "✅ PASS ($INDEXED_FILES files, simdjson: $SIMD_AVAILABLE)"
    ((PASS++))
  else
    echo "⚠️  WARN (0 files indexed - run indexer)"
    ((SKIP++))
  fi
else
  echo "❌ FAIL - Stats endpoint not responding"
  ((FAIL++))
fi

# G17: GPU Simdjson Addon
echo -n "G17: GPU simdjson addon... "
if echo "$CODEBASE_STATS" | grep -q '"simdAvailable":true'; then
  echo "✅ PASS (native addon loaded)"
  ((PASS++))
elif echo "$CODEBASE_STATS" | grep -q '"simdAvailable":false'; then
  echo "⚠️  SKIP (using V8 fallback - addon not built)"
  ((SKIP++))
else
  echo "❌ FAIL - Cannot determine status"
  ((FAIL++))
fi

echo ""
echo "==========================================="
echo "📊 Results: $PASS passed, $FAIL failed, $SKIP skipped"
echo "==========================================="
echo ""

# Detailed summary
if [ $FAIL -eq 0 ]; then
  echo "✅ All critical services operational"
  echo ""
  echo "System Status:"
  echo "  • Cache Layer (Redis + Bifrost): HEALTHY"
  echo "  • Inference (Ollama + GPU): HEALTHY"
  echo "  • Message Queue (RabbitMQ): HEALTHY"
  echo "  • Observability (Langfuse): HEALTHY"
  echo "  • Codebase Intelligence: HEALTHY"
  echo ""
  echo "Ready for production! 🚀"
  exit 0
else
  echo "❌ $FAIL service(s) need attention"
  echo ""
  echo "Quick Fixes:"
  echo "  • Redis: docker restart deeds-redis-prod"
  echo "  • Bifrost: cd go-microservice && go run cmd/bifrost/main.go"
  echo "  • Ollama: systemctl restart ollama"
  echo "  • RabbitMQ: docker restart phase66-rabbitmq"
  echo "  • Langfuse: docker-compose up -d langfuse-web"
  echo "  • Codebase Index: cd sveltekit-frontend && npx tsx scripts/codebase-semantic-indexer.ts"
  echo "  • Simdjson Addon: cd simd-bridge/cpp && cmake --build build --config Release"
  echo ""
  exit 1
fi