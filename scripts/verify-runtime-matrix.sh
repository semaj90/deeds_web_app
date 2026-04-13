#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Runtime Matrix Verification Script
# ═══════════════════════════════════════════════════════════════
#
# Verifies all lanes, cache tiers, and services from RUNTIME_MATRIX.md
# Updates Neo4j graph with verification results
#
# Usage:
#   bash scripts/verify-runtime-matrix.sh
#
# ═══════════════════════════════════════════════════════════════

set -e

echo "═══════════════════════════════════════════════════════════════"
echo "Runtime Matrix Verification"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ═══════════════════════════════════════════════════════════════
# TIER 1: Cache Infrastructure
# ═══════════════════════════════════════════════════════════════

echo "━━━ TIER 1: Cache Infrastructure ━━━"
echo ""

# Redis L1
echo -n "Redis L1 (port 6379): "
if docker exec deeds-redis-prod redis-cli ping 2>/dev/null | grep -q PONG; then
    echo "✅ PASS"
    REDIS_L1="true"
else
    echo "❌ FAIL (Redis not running)"
    REDIS_L1="false"
fi

# Bifrost L2
echo -n "Bifrost L2 (port 3040): "
if curl -s http://localhost:3040/health 2>/dev/null | grep -q '"status":"ok"'; then
    echo "✅ PASS"
    BIFROST_L2="true"
else
    echo "❌ FAIL (Bifrost not running)"
    BIFROST_L2="false"
fi

# Qdrant L3
echo -n "Qdrant L3 (port 6333): "
if curl -s http://localhost:6333/ 2>/dev/null | grep -q qdrant; then
    echo "✅ PASS"
    QDRANT_L3="true"
else
    echo "❌ FAIL (Qdrant not running)"
    QDRANT_L3="false"
fi

echo ""

# ═══════════════════════════════════════════════════════════════
# TIER 2: Server Infrastructure
# ═══════════════════════════════════════════════════════════════

echo "━━━ TIER 2: Server Infrastructure ━━━"
echo ""

# PostgreSQL
echo -n "PostgreSQL (port 5434): "
if docker exec deeds-postgres-prod pg_isready 2>/dev/null | grep -q "accepting connections"; then
    echo "✅ PASS"
    POSTGRES="true"
else
    echo "❌ FAIL"
    POSTGRES="false"
fi

# RabbitMQ
echo -n "RabbitMQ (port 5672): "
if curl -s -u guest:guest http://localhost:15672/api/overview 2>/dev/null | grep -q rabbitmq; then
    echo "✅ PASS"
    RABBITMQ="true"
else
    echo "❌ FAIL"
    RABBITMQ="false"
fi

# Ollama
echo -n "Ollama (port 11434): "
if curl -s http://localhost:11434/api/tags 2>/dev/null | grep -q models; then
    echo "✅ PASS"
    OLLAMA="true"
else
    echo "❌ FAIL"
    OLLAMA="false"
fi

# Langfuse
echo -n "Langfuse (port 3030): "
if curl -s http://localhost:3030/ 2>/dev/null | grep -q langfuse; then
    echo "✅ PASS"
    LANGFUSE="true"
else
    echo "❌ FAIL (optional)"
    LANGFUSE="false"
fi

echo ""

# ═══════════════════════════════════════════════════════════════
# TIER 3: Inference Lanes (Server)
# ═══════════════════════════════════════════════════════════════

echo "━━━ TIER 3: Server Inference Lanes ━━━"
echo ""

# TurboQuant
echo -n "TurboQuant (port 8090): "
if curl -s http://localhost:8090/health 2>/dev/null | grep -q ok; then
    echo "✅ PASS"
    TURBOQUANT="true"
else
    echo "⚠️  OPTIONAL (not running)"
    TURBOQUANT="false"
fi

# TensorRT
echo -n "TensorRT (port 8099): "
if curl -s http://localhost:8099/health 2>/dev/null; then
    echo "✅ PASS"
    TENSORRT="true"
else
    echo "⚠️  OPTIONAL (not running)"
    TENSORRT="false"
fi

# LiteRT Sidecar
echo -n "LiteRT Sidecar (port 8070): "
if curl -s http://localhost:8070/health 2>/dev/null; then
    echo "✅ PASS"
    LITERT_SERVER="true"
else
    echo "⚠️  OPTIONAL (not running)"
    LITERT_SERVER="false"
fi

# VLM Server
echo -n "VLM Server (port 8085): "
if curl -s http://localhost:8085/health 2>/dev/null; then
    echo "✅ PASS"
    VLM_SERVER="true"
else
    echo "⚠️  OPTIONAL (not running)"
    VLM_SERVER="false"
fi

echo ""

# ═══════════════════════════════════════════════════════════════
# TIER 4: Client-Side Verification (Manual)
# ═══════════════════════════════════════════════════════════════

echo "━━━ TIER 4: Client-Side Lanes (Manual Verification Required) ━━━"
echo ""

# Check if dev server is running
echo -n "SvelteKit Dev Server (port 5173): "
if curl -s http://localhost:5173/ 2>/dev/null | grep -q "<!doctype html"; then
    echo "✅ PASS"
    DEV_SERVER="true"
else
    echo "❌ FAIL (dev server not running)"
    echo ""
    echo "Start dev server with:"
    echo "  cd sveltekit-frontend && npm run dev"
    echo ""
    DEV_SERVER="false"
fi

if [ "$DEV_SERVER" = "true" ]; then
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "MANUAL VERIFICATION REQUIRED"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    echo "1. E2B WebGPU Test:"
    echo "   → Open: http://localhost:5173/scripts/tests/test-e2b-loading.html"
    echo ""
    echo "   Expected Results:"
    echo "   ✅ WebGPU adapter detected"
    echo "   ✅ GPU: <Your GPU name>"
    echo "   ✅ Est. VRAM: <Your VRAM>MB"
    echo "   ✅ Model loads in 5-10s (first time)"
    echo "   ✅ Inference completes in 1-2s"
    echo ""
    echo "   If WebGPU NOT available:"
    echo "   ⚠️  Browser: Chrome 113+, Edge 113+, Safari 18+"
    echo "   ⚠️  System will auto-fallback to LiteRT/ONNX (still works)"
    echo ""
    echo "2. Unified Generation API Test:"
    echo "   → Open browser console: http://localhost:5173"
    echo "   → Run:"
    echo ""
    echo "   import { chat } from '/src/lib/ai/unified-generation.ts';"
    echo "   const answer = await chat('What is hearsay evidence?');"
    echo "   console.log(answer);"
    echo ""
    echo "   Expected Results:"
    echo "   ✅ Response in 1-5s (depending on tier hit)"
    echo "   ✅ Check network tab for tier used"
    echo ""
    echo "3. Cache Stats Verification:"
    echo "   → Open: http://localhost:5173/api/cache/exact-match/stats"
    echo ""
    echo "   Expected Results:"
    echo "   ✅ hit_rate: 0.0-1.0"
    echo "   ✅ avg_latency_ms: <5ms"
    echo "   ✅ total_requests: <number>"
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
fi

echo ""

# ═══════════════════════════════════════════════════════════════
# Summary
# ═══════════════════════════════════════════════════════════════

echo "━━━ Verification Summary ━━━"
echo ""

TOTAL=0
PASSED=0

# Count cache tier results
[ "$REDIS_L1" = "true" ] && PASSED=$((PASSED + 1))
TOTAL=$((TOTAL + 1))

[ "$BIFROST_L2" = "true" ] && PASSED=$((PASSED + 1))
TOTAL=$((TOTAL + 1))

[ "$QDRANT_L3" = "true" ] && PASSED=$((PASSED + 1))
TOTAL=$((TOTAL + 1))

# Count infrastructure results
[ "$POSTGRES" = "true" ] && PASSED=$((PASSED + 1))
TOTAL=$((TOTAL + 1))

[ "$RABBITMQ" = "true" ] && PASSED=$((PASSED + 1))
TOTAL=$((TOTAL + 1))

[ "$OLLAMA" = "true" ] && PASSED=$((PASSED + 1))
TOTAL=$((TOTAL + 1))

# Dev server (required for client tests)
[ "$DEV_SERVER" = "true" ] && PASSED=$((PASSED + 1))
TOTAL=$((TOTAL + 1))

echo "Core Services: $PASSED/$TOTAL passed"
echo ""

# Optional services (don't count toward pass/fail)
OPTIONAL_PASSED=0
OPTIONAL_TOTAL=0

[ "$LANGFUSE" = "true" ] && OPTIONAL_PASSED=$((OPTIONAL_PASSED + 1))
OPTIONAL_TOTAL=$((OPTIONAL_TOTAL + 1))

[ "$TURBOQUANT" = "true" ] && OPTIONAL_PASSED=$((OPTIONAL_PASSED + 1))
OPTIONAL_TOTAL=$((OPTIONAL_TOTAL + 1))

[ "$TENSORRT" = "true" ] && OPTIONAL_PASSED=$((OPTIONAL_PASSED + 1))
OPTIONAL_TOTAL=$((OPTIONAL_TOTAL + 1))

[ "$LITERT_SERVER" = "true" ] && OPTIONAL_PASSED=$((OPTIONAL_PASSED + 1))
OPTIONAL_TOTAL=$((OPTIONAL_TOTAL + 1))

[ "$VLM_SERVER" = "true" ] && OPTIONAL_PASSED=$((OPTIONAL_PASSED + 1))
OPTIONAL_TOTAL=$((OPTIONAL_TOTAL + 1))

echo "Optional Services: $OPTIONAL_PASSED/$OPTIONAL_TOTAL running"
echo ""

# Overall status
if [ $PASSED -eq $TOTAL ]; then
    echo "Status: ✅ ALL CORE SERVICES HEALTHY"
    echo ""
    echo "Next Steps:"
    echo "1. Run manual client-side tests (see above)"
    echo "2. Update Neo4j graph with verification results"
    echo "3. Run: bash scripts/neo4j/update-verification-status.sh"
    exit 0
else
    echo "Status: ❌ SOME CORE SERVICES FAILED"
    echo ""
    echo "Fix failed services before proceeding with client tests"
    exit 1
fi
