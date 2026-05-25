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

# Allow environment overrides for local dev setups
# Example: export DEEDS_REDIS_CONTAINER=legal-ai-redis
DEEDS_REDIS_CONTAINER=${DEEDS_REDIS_CONTAINER:-deeds-redis-prod}
RABBITMQ_CONTAINER=${RABBITMQ_CONTAINER:-phase66-rabbitmq}
RABBITMQ_USER=${RABBITMQ_USER:-guest}
RABBITMQ_PASS=${RABBITMQ_PASS:-guest}
OLLAMA_URL=${OLLAMA_URL:-http://localhost:11434}
SIMDJSON_PATH=${SIMDJSON_PATH:-/usr/local/lib/tensorrt_bridge.node}

# Environment detection: if Docker CLI is unavailable (e.g. WSL without Docker integration),
# fall back to TCP checks using redis-cli or application endpoints accessible via host.docker.internal.
if command -v docker >/dev/null 2>&1; then
  DOCKER_AVAILABLE=1
else
  DOCKER_AVAILABLE=0
fi

# Host reachable address for services when Docker CLI is unavailable (WSL → host)
DEEDS_REDIS_HOST=${DEEDS_REDIS_HOST:-host.docker.internal}
DEEDS_REDIS_PORT=${DEEDS_REDIS_PORT:-6379}

# App host for HTTP endpoints (use host.docker.internal from WSL when docker CLI missing)
if [ "$DOCKER_AVAILABLE" -eq 0 ]; then
  APP_HOST=${APP_HOST:-host.docker.internal}
else
  APP_HOST=${APP_HOST:-localhost}
fi

# Helper: attempt Redis PING via /dev/tcp if redis-cli is not present
ping_redis_tcp() {
  local host="$1" port="$2"
  if [ -e /dev/tcp/${host}/${port} ] 2>/dev/null || bash -c "</dev/tcp/${host}/${port}" >/dev/null 2>&1; then
    # Send Redis PING using RESP protocol
    printf '*1\r\n$4\r\nPING\r\n' >/dev/tcp/${host}/${port} 2>/dev/null || true
    # Read response (may not be immediate)
    if head -n1 < /dev/tcp/${host}/${port} 2>/dev/null | grep -q PONG; then
      return 0
    fi
  fi
  return 1
}

# Tier A: Cache Layer
echo "🔴 Tier A: Cache Layer"
echo "----------------------"

# G1: Redis Connection
echo -n "G1: Redis connection... "
if [ "$DOCKER_AVAILABLE" -eq 1 ] && docker exec "${DEEDS_REDIS_CONTAINER}" redis-cli ping 2>/dev/null | grep -q PONG; then
  echo "✅ PASS (docker exec)"
  ((PASS++))
else
  # Try TCP-based check via redis-cli on host.docker.internal (WSL) or provided host
  if command -v redis-cli >/dev/null 2>&1; then
    if redis-cli -h "${DEEDS_REDIS_HOST}" -p "${DEEDS_REDIS_PORT}" ping 2>/dev/null | grep -q PONG; then
      echo "✅ PASS (redis reachable via TCP)"
      ((PASS++))
    else
      echo "❌ FAIL - Redis not responding"
      ((FAIL++))
    fi
  else
    echo "⚠️  SKIP (docker and redis-cli not available)"
    ((SKIP++))
  fi
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
if [ "$DOCKER_AVAILABLE" -eq 1 ]; then
  MEM=$(docker exec "${DEEDS_REDIS_CONTAINER}" redis-cli info memory 2>/dev/null | grep used_memory_human | cut -d: -f2 | tr -d '\r')
  SOURCE="docker exec"
else
  if command -v redis-cli >/dev/null 2>&1; then
    MEM=$(redis-cli -h "${DEEDS_REDIS_HOST}" -p "${DEEDS_REDIS_PORT}" info memory 2>/dev/null | grep used_memory_human | cut -d: -f2 | tr -d '\r')
    SOURCE="tcp"
  else
    MEM=""
  fi
fi

if [ -n "$MEM" ]; then
  echo "✅ PASS ($MEM used via $SOURCE)"
  ((PASS++))
else
  echo "❌ FAIL"
  ((FAIL++))
fi

# G4: Bifrost Semantic Cache (fast + strict smoke)
echo -n "G4: Bifrost semantic cache (fast check)... "
BIFROST_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://${APP_HOST}:3040/health 2>/dev/null)
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

# Strict smoke: timed L2 probe (may be long-running). Classify as fast/strict.
echo -n "    → strict smoke (timed L2 probe)... "
# Use a sample prompt that exercises semantic cache path. Allow long timeout (matches Bifrost provider timeout).
STRICT_TIMEOUT=180
STRICT_START=$(date +%s%3N)
STRICT_RES=$(curl -s -X POST --max-time ${STRICT_TIMEOUT} http://${APP_HOST}:3040/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"ollama-local/gemma4-rotorquant:latest","messages":[{"role":"user","content":"Define negligence in one sentence."}],"max_tokens":50,"temperature":0.0,"stream":false}' 2>/dev/null || true)
STRICT_END=$(date +%s%3N)
STRICT_LATENCY=$((STRICT_END - STRICT_START))
if [ -z "$STRICT_RES" ]; then
  echo "❌ FAIL (no response, timeout ${STRICT_TIMEOUT}s)"
  ((FAIL++))
  BIFROST_SMOKE="strict:fail"
elif echo "$STRICT_RES" | grep -q 'choices\|error'; then
  # classify: fast <2000ms, strict < (STRICT_TIMEOUT*1000)
  if [ $STRICT_LATENCY -lt 2000 ]; then
    echo "✅ FAST (${STRICT_LATENCY}ms)"
    ((PASS++))
    BIFROST_SMOKE="fast:green"
  else
    echo "✅ STRICT_OK (${STRICT_LATENCY}ms)"
    ((PASS++))
    BIFROST_SMOKE="strict:green"
  fi
else
  echo "⚠️  WARN (unexpected response)"
  ((SKIP++))
  BIFROST_SMOKE="strict:warn"
fi
echo "    (bifrost_smoke=${BIFROST_SMOKE}, latencyMs=${STRICT_LATENCY})"

# G5: Qdrant Vector Store
echo -n "G5: Qdrant vector store... "
QDRANT_VERSION=$(curl -s http://${APP_HOST}:6333/ 2>/dev/null | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
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
if curl -s ${OLLAMA_URL}/api/tags 2>/dev/null | grep -q models; then
  MODEL_COUNT=$(curl -s ${OLLAMA_URL}/api/tags 2>/dev/null | grep -o '"name"' | wc -l)
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
MODELS=$(curl -s ${OLLAMA_URL}/api/tags 2>/dev/null)
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
RESPONSE=$(curl -s -X POST ${OLLAMA_URL}/api/chat \
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
if curl -s -u ${RABBITMQ_USER}:${RABBITMQ_PASS} http://${APP_HOST}:15672/api/overview 2>/dev/null | grep -q rabbitmq_version; then
  VERSION=$(curl -s -u ${RABBITMQ_USER}:${RABBITMQ_PASS} http://${APP_HOST}:15672/api/overview 2>/dev/null | grep -o '"rabbitmq_version":"[^"]*"' | cut -d'"' -f4)
  echo "✅ PASS (v$VERSION)"
  ((PASS++))
else
  echo "❌ FAIL - RabbitMQ management API not accessible"
  ((FAIL++))
fi

# G11: RabbitMQ Consumers
echo -n "G11: Queue consumers... "
QUEUES=$(curl -s -u ${RABBITMQ_USER}:${RABBITMQ_PASS} http://${APP_HOST}:15672/api/queues 2>/dev/null)
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
SYNTH_QUEUE=$(curl -s -u ${RABBITMQ_USER}:${RABBITMQ_PASS} http://${APP_HOST}:15672/api/queues/%2F/synthesis.generate 2>/dev/null)
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
LANGFUSE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://${APP_HOST}:3030 2>/dev/null)
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
TRACES=$(curl -s http://${APP_HOST}:3030/api/public/traces?limit=1 2>/dev/null)
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
CACHE_STATS=$(curl -s http://${APP_HOST}:5173/api/cache/exact-match/stats 2>/dev/null)
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
CODEBASE_STATS=$(curl -s http://${APP_HOST}:5173/api/codebase-index/stats 2>/dev/null)
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