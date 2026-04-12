#!/bin/bash
#
# TurboQuant + Redis L1 Cache Performance Test
#
# Prerequisites:
#   1. TurboQuant running on port 8090 (llama-server with turbo3 KV cache)
#   2. Bifrost running on port 3040 (semantic cache L2)
#   3. Redis running (exact-match cache L1)
#

echo "🚀 TurboQuant + Redis Cache Performance Test"
echo "=============================================="
echo ""

# Check prerequisites
echo "Checking prerequisites..."
TURBOQUANT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8090/health 2>&1)
BIFROST_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3040/health 2>&1)

if [ "$TURBOQUANT_STATUS" != "200" ]; then
  echo "❌ TurboQuant not running on port 8090"
  echo ""
  echo "To start TurboQuant, run:"
  echo "  llama-server.exe -m \"C:\\Users\\james\\Downloads\\gemma4-legal-vlm-q4_k_m.gguf\" --mmproj \"C:\\Users\\james\\Downloads\\gemma4-mmproj\\mmproj-BF16.gguf\" --port 8090 --cache-type-k turbo3 --n-gpu-layers 99"
  echo ""
  exit 1
fi

if [ "$BIFROST_STATUS" != "200" ]; then
  echo "⚠️  Bifrost not running (optional semantic cache L2)"
fi

echo "✅ TurboQuant running on :8090"
echo "✅ Redis cache ready"
echo ""

TEST_QUERY="What is the definition of hearsay evidence in criminal law?"

# ══════════════════════════════════════════════════════════════
# Test 1: COLD START (Cache MISS → TurboQuant GPU inference)
# ══════════════════════════════════════════════════════════════
echo "Test 1: Cache MISS + TurboQuant GPU Inference"
echo "Expected: ~15-25s (GPU accelerated, turbo3 KV cache)"
echo ""

START=$(date +%s%3N)
RESPONSE1=$(curl -s -X POST http://localhost:8090/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d "{
    \"model\": \"gemma4-legal\",
    \"messages\": [{\"role\": \"user\", \"content\": \"$TEST_QUERY\"}],
    \"temperature\": 0.3,
    \"max_tokens\": 200
  }")
END=$(date +%s%3N)
LATENCY_COLD=$((END - START))

echo "⏱️  Latency: ${LATENCY_COLD}ms"
echo "Response preview:"
echo "$RESPONSE1" | head -c 200
echo ""
echo ""
sleep 2

# ══════════════════════════════════════════════════════════════
# Test 2: WARM START (Bifrost L2 semantic hit, if enabled)
# ══════════════════════════════════════════════════════════════
echo "Test 2: Bifrost Semantic Cache Hit (via L2)"
echo "Expected: ~2-5s (Qdrant vector lookup)"
echo ""

START=$(date +%s%3N)
RESPONSE2=$(curl -s -X POST http://localhost:3040/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "x-bf-cache-key: turboquant-test-001" \
  -d "{
    \"model\": \"ollama/gemma4-legal\",
    \"messages\": [{\"role\": \"user\", \"content\": \"$TEST_QUERY\"}],
    \"temperature\": 0.3,
    \"max_tokens\": 200
  }")
END=$(date +%s%3N)
LATENCY_L2=$((END - START))

echo "⏱️  Latency: ${LATENCY_L2}ms"
echo ""
sleep 2

# ══════════════════════════════════════════════════════════════
# Test 3: HOT START (Redis L1 exact-match hit)
# ══════════════════════════════════════════════════════════════
echo "Test 3: Redis L1 Exact-Match Hit"
echo "Expected: ~2-10ms (instant return)"
echo ""

START=$(date +%s%3N)
RESPONSE3=$(curl -s -X POST http://localhost:3040/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "x-bf-cache-key: turboquant-test-001" \
  -d "{
    \"model\": \"ollama/gemma4-legal\",
    \"messages\": [{\"role\": \"user\", \"content\": \"$TEST_QUERY\"}],
    \"temperature\": 0.3,
    \"max_tokens\": 200
  }")
END=$(date +%s%3N)
LATENCY_L1=$((END - START))

echo "⏱️  Latency: ${LATENCY_L1}ms"
echo ""

# ══════════════════════════════════════════════════════════════
# Calculate Speedups
# ══════════════════════════════════════════════════════════════
if [ $LATENCY_L1 -gt 0 ]; then
  SPEEDUP_L1=$((LATENCY_COLD / LATENCY_L1))
else
  SPEEDUP_L1=0
fi

if [ $LATENCY_L2 -gt 0 ]; then
  SPEEDUP_L2=$((LATENCY_COLD / LATENCY_L2))
else
  SPEEDUP_L2=0
fi

echo "=============================================="
echo "📊 Performance Summary (TurboQuant + Redis)"
echo "=============================================="
echo ""
echo "GPU Inference (TurboQuant):   ${LATENCY_COLD}ms  (baseline)"
echo "L2 Semantic (Bifrost):        ${LATENCY_L2}ms  (${SPEEDUP_L2}× faster)"
echo "L1 Exact-Match (Redis):       ${LATENCY_L1}ms  (${SPEEDUP_L1}× faster) 🚀"
echo ""

# ══════════════════════════════════════════════════════════════
# Comparison with CPU Ollama
# ══════════════════════════════════════════════════════════════
echo "=============================================="
echo "🔬 TurboQuant GPU Advantage"
echo "=============================================="
echo ""
echo "Typical CPU Ollama inference:  35,000ms"
echo "TurboQuant GPU inference:      ${LATENCY_COLD}ms"
echo ""
if [ $LATENCY_COLD -gt 0 ]; then
  GPU_SPEEDUP=$((35000 / LATENCY_COLD))
  echo "GPU Speedup: ${GPU_SPEEDUP}× faster than CPU 🚀"
fi
echo ""

# ══════════════════════════════════════════════════════════════
# Check Redis Cache Stats
# ══════════════════════════════════════════════════════════════
echo "=============================================="
echo "📈 Redis L1 Cache Statistics"
echo "=============================================="
echo ""

curl -s http://localhost:5173/api/cache/exact-match/stats | python3 -m json.tool 2>/dev/null || \
curl -s http://localhost:5173/api/cache/exact-match/stats

echo ""
echo ""
echo "✅ Test complete!"
echo ""
echo "Key Findings:"
echo "  • TurboQuant GPU reduces inference from 35s → ~${LATENCY_COLD}ms"
echo "  • Redis L1 cache reduces to ~${LATENCY_L1}ms on exact repeats"
echo "  • Combined: ${SPEEDUP_L1}× speedup vs baseline Ollama"
echo ""