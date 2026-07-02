#!/usr/bin/env bash
# Test harness for the cache invalidation cascade.
#
# Seeds Redis with fake keys matching every pattern in CACHE_PATTERNS,
# then simulates the two cascade functions (invalidateIndexingCaches +
# invalidateResearchCaches) to prove the Redis delete-by-pattern logic
# matches the actual key shapes.
#
# Runs against Docker container `legal-ai-valkey`. Does NOT require the
# SvelteKit dev server — this is a pure Redis-layer smoke test.
#
# Usage:
#   bash scripts/test-cache-invalidation.sh

set -e

REDIS_CONTAINER="${REDIS_CONTAINER:-legal-ai-valkey}"
PASS=0
FAIL=0

redis() { docker exec "$REDIS_CONTAINER" redis-cli "$@"; }

cleanup() {
  local exit_code=$?
  for pattern in "turbo:prefix:test*" "turbo:warm:test*" "turbo:dym:test*" \
                 "summary:cluster:default:*:fake" "kb_bundle:test*" \
                 "research_bundle:test*" "graph:case:abc:*" \
                 "rag:search:test*" "llm:semantic:test*"; do
    keys=$(redis --scan --pattern "$pattern" 2>/dev/null | tr '\r\n' ' ' | xargs)
    [ -n "$keys" ] && redis DEL $keys > /dev/null 2>&1 || true
  done
  exit $exit_code
}
trap cleanup EXIT

echo "=== Test 1: invalidateIndexingCaches (full cascade) ==="
redis SET turbo:prefix:test1 v EX 120 > /dev/null
redis SET turbo:warm:test2 v EX 120 > /dev/null
redis SET turbo:dym:test3 v EX 120 > /dev/null
redis SET summary:cluster:default:3:fake v EX 120 > /dev/null
redis SET kb_bundle:test v EX 120 > /dev/null
redis SET research_bundle:test v EX 120 > /dev/null
redis SET graph:case:abc:neighbors v EX 120 > /dev/null
redis SET rag:search:test v EX 120 > /dev/null
redis SET llm:semantic:test v EX 120 > /dev/null

# The 9 patterns in invalidateIndexingCaches
for pattern in "turbo:prefix:*" "turbo:warm:*" "turbo:dym:*" \
               "graph:case:*:neighbors" "kb_bundle:*" "research_bundle:*" \
               "summary:cluster:*" "rag:search*" "llm:semantic:*"; do
  keys=$(redis --scan --pattern "$pattern" 2>/dev/null | tr '\r\n' ' ' | xargs)
  [ -n "$keys" ] && redis DEL $keys > /dev/null
done

remaining=0
for pattern in "turbo:*" "summary:cluster:*" "kb_bundle:*" "research_bundle:*" \
               "graph:case:*:neighbors" "rag:search*" "llm:semantic:*"; do
  c=$(redis --scan --pattern "$pattern" 2>/dev/null | grep -v '^$' | wc -l)
  remaining=$((remaining + c))
done

if [ "$remaining" -eq 0 ]; then
  echo "  ✅ PASS: full cascade cleared all 9 seeded keys"
  PASS=$((PASS + 1))
else
  echo "  ❌ FAIL: $remaining keys still present after full cascade"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "=== Test 2: invalidateResearchCaches (lighter — skips summary + graph) ==="
redis SET turbo:prefix:test1 v EX 120 > /dev/null
redis SET turbo:warm:test2 v EX 120 > /dev/null
redis SET research_bundle:test v EX 120 > /dev/null
redis SET kb_bundle:test v EX 120 > /dev/null
redis SET rag:search:test v EX 120 > /dev/null
redis SET summary:cluster:default:3:fake v EX 120 > /dev/null

# The 5 patterns in invalidateResearchCaches
for pattern in "turbo:prefix:*" "turbo:warm:*" "research_bundle:*" \
               "kb_bundle:*" "rag:search*"; do
  keys=$(redis --scan --pattern "$pattern" 2>/dev/null | tr '\r\n' ' ' | xargs)
  [ -n "$keys" ] && redis DEL $keys > /dev/null
done

summary_remaining=$(redis --scan --pattern "summary:cluster:*" 2>/dev/null | grep -v '^$' | wc -l)
turbo_remaining=$(redis --scan --pattern "turbo:*" 2>/dev/null | grep -v '^$' | wc -l)

if [ "$summary_remaining" -eq 1 ] && [ "$turbo_remaining" -eq 0 ]; then
  echo "  ✅ PASS: research cascade cleared turbo keys, preserved summary:cluster"
  PASS=$((PASS + 1))
else
  echo "  ❌ FAIL: expected summary=1 turbo=0, got summary=$summary_remaining turbo=$turbo_remaining"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "=== Summary ==="
echo "  Passed: $PASS"
echo "  Failed: $FAIL"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
