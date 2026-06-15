#!/bin/bash

# Test script: Verify legal GGUF is loaded and working
# Usage: bash scripts/atlas/test-legal-gguf.sh

set -e

TURBO_URL="http://127.0.0.1:8090"
MODEL="gemma4-legal-iq4xs-direct.gguf"

echo "🧪 Testing Legal GGUF via TurboQuant..."
echo ""

# 1. Health check
echo "1️⃣  Health check..."
if curl -s "$TURBO_URL/health" > /dev/null 2>&1; then
  echo "   ✅ TurboQuant is running"
else
  echo "   ❌ TurboQuant is NOT running"
  echo "   → Start with: npm run turbo:start:detached"
  exit 1
fi

# 2. Model list
echo ""
echo "2️⃣  Checking loaded model..."
MODEL_LIST=$(curl -s "$TURBO_URL/v1/models")
if echo "$MODEL_LIST" | grep -q "gemma4-legal"; then
  echo "   ✅ Legal GGUF model is loaded"
else
  echo "   ❌ Legal GGUF not found in model list"
  echo "   Available models:"
  echo "$MODEL_LIST" | jq '.data[] | .id' 2>/dev/null || echo "$MODEL_LIST"
  exit 1
fi

# 3. Context length
echo ""
echo "3️⃣  Checking context length..."
CONTEXT=$(curl -s "$TURBO_URL/v1/models" | jq -r '.data[0].metadata.context_length // "unknown"')
echo "   Context length: $CONTEXT tokens"

# 4. Simple inference test
echo ""
echo "4️⃣  Testing inference with legal prompt..."
RESPONSE=$(curl -s "$TURBO_URL/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "'$MODEL'",
    "messages": [
      {"role": "system", "content": "You are a legal expert. Answer concisely."},
      {"role": "user", "content": "What is hearsay evidence in one sentence?"}
    ],
    "max_tokens": 100,
    "temperature": 0.3,
    "stream": false
  }')

if echo "$RESPONSE" | jq -e '.choices[0].message.content' > /dev/null 2>&1; then
  CONTENT=$(echo "$RESPONSE" | jq -r '.choices[0].message.content')
  echo "   ✅ Inference successful"
  echo "   Response: $CONTENT"
else
  echo "   ❌ Inference failed"
  echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
  exit 1
fi

# 5. Bifrost caching test
echo ""
echo "5️⃣  Testing Bifrost cache integration..."
BIFROST_URL="http://127.0.0.1:3040"
if curl -s "$BIFROST_URL/health" > /dev/null 2>&1; then
  echo "   ✅ Bifrost is running"
  echo "   → Cache should now route to legal GGUF via TurboQuant intercept"
else
  echo "   ⚠️  Bifrost is not responding (optional, cache won't work)"
fi

echo ""
echo "═══════════════════════════════════════"
echo "✅ Legal GGUF is ready for Atlas!"
echo "═══════════════════════════════════════"
echo ""
echo "Next steps:"
echo "  1. Start warm: npm run atlas:warm"
echo "  2. Check cache: docker exec legal-ai-redis redis-cli KEYS 'bifrost:*' | wc -l"
echo "  3. Monitor: docker logs legal-ai-bifrost --tail 50 --follow"
