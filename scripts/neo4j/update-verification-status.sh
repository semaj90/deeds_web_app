#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Neo4j Verification Status Updater
# ═══════════════════════════════════════════════════════════════
#
# Updates Neo4j graph nodes with verification results
# Run this AFTER manual client-side testing completes
#
# Usage:
#   bash scripts/neo4j/update-verification-status.sh
#
# ═══════════════════════════════════════════════════════════════

set -e

echo "═══════════════════════════════════════════════════════════════"
echo "Neo4j Verification Status Updater"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Check if Neo4j is running
echo -n "Checking Neo4j connection: "
if curl -s http://localhost:7474 2>/dev/null | grep -q "neo4j"; then
    echo "✅ Connected"
else
    echo "❌ Neo4j not running"
    echo ""
    echo "Start Neo4j with:"
    echo "  docker run -d --name neo4j-runtime -p 7474:7474 -p 7687:7687 -e NEO4J_AUTH=neo4j/legal123 neo4j:5.15"
    echo ""
    exit 1
fi

echo ""

# ═══════════════════════════════════════════════════════════════
# Interactive Verification Collection
# ═══════════════════════════════════════════════════════════════

echo "━━━ E2B WebGPU Verification ━━━"
echo ""
echo "Did E2B WebGPU load successfully?"
echo "  (http://localhost:5173/scripts/tests/test-e2b-loading.html)"
echo ""
read -p "E2B verified? (y/n): " E2B_VERIFIED

if [ "$E2B_VERIFIED" = "y" ]; then
    E2B_STATUS="verified"
    E2B_NEEDS_VERIFICATION="false"
    echo "  → E2B marked as verified ✅"
else
    E2B_STATUS="needs_verification"
    E2B_NEEDS_VERIFICATION="true"
    echo "  → E2B still needs verification ⚠️"
fi

echo ""
echo "━━━ LiteRT Sidecar Verification ━━━"
echo ""
echo "Is LiteRT sidecar running? (port 8070)"
echo ""
read -p "LiteRT verified? (y/n): " LITERT_VERIFIED

if [ "$LITERT_VERIFIED" = "y" ]; then
    LITERT_STATUS="verified"
    LITERT_ENABLED="true"
    echo "  → LiteRT marked as verified ✅"
else
    LITERT_STATUS="optional"
    LITERT_ENABLED="false"
    echo "  → LiteRT marked as optional (not enabled) ⚠️"
fi

echo ""
echo "━━━ Cache Hit Rate Check ━━━"
echo ""
echo "Check cache stats at: http://localhost:5173/api/cache/exact-match/stats"
echo ""
read -p "What is the L1 hit rate? (0.0-1.0, press Enter to skip): " L1_HIT_RATE

if [ -n "$L1_HIT_RATE" ]; then
    echo "  → L1 hit rate: $L1_HIT_RATE"
else
    L1_HIT_RATE="0.25"  # Default from docs
    echo "  → Using default L1 hit rate: 0.25"
fi

echo ""

# ═══════════════════════════════════════════════════════════════
# Generate Neo4j Cypher Update Script
# ═══════════════════════════════════════════════════════════════

CYPHER_FILE="scripts/neo4j/verification-update.cypher"

cat > "$CYPHER_FILE" <<EOF
// ═══════════════════════════════════════════════════════════════
// Verification Status Update — Generated $(date)
// ═══════════════════════════════════════════════════════════════

// Update E2B WebGPU verification status
MATCH (e2b:Lane {name: 'E2B WebGPU'})
SET e2b.status = '$E2B_STATUS',
    e2b.needs_verification = $E2B_NEEDS_VERIFICATION,
    e2b.verified_at = timestamp(),
    e2b.verified_date = '$(date +%Y-%m-%d)'
RETURN e2b.name AS lane, e2b.status AS status;

// Update LiteRT CPU verification status
MATCH (litert:Lane {name: 'LiteRT CPU'})
SET litert.status = '$LITERT_STATUS',
    litert.enabled = $LITERT_ENABLED,
    litert.verified_at = timestamp(),
    litert.verified_date = '$(date +%Y-%m-%d)'
RETURN litert.name AS lane, litert.status AS status;

// Update Redis L1 hit rate
MATCH (redis_l1:CacheTier {tier: 'L1'})
SET redis_l1.hit_rate = $L1_HIT_RATE,
    redis_l1.updated_at = timestamp()
RETURN redis_l1.name AS cache, redis_l1.hit_rate AS hit_rate;

// Show all lane statuses
MATCH (l:Lane)
RETURN l.name AS lane,
       l.tier AS tier,
       l.status AS status,
       l.needs_verification AS needs_verification,
       l.enabled AS enabled
ORDER BY l.tier;
EOF

echo "━━━ Cypher Update Script Generated ━━━"
echo ""
echo "File: $CYPHER_FILE"
echo ""
cat "$CYPHER_FILE"
echo ""

# ═══════════════════════════════════════════════════════════════
# Instructions for Manual Update
# ═══════════════════════════════════════════════════════════════

echo "═══════════════════════════════════════════════════════════════"
echo "Next Steps: Update Neo4j Graph"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "1. Open Neo4j Browser: http://localhost:7474"
echo "2. Login: neo4j / legal123"
echo "3. Copy-paste this file into query editor:"
echo "   → $CYPHER_FILE"
echo "4. Click Run (Ctrl+Enter)"
echo ""
echo "Expected Results:"
echo "  ✅ E2B status: $E2B_STATUS"
echo "  ✅ LiteRT status: $LITERT_STATUS"
echo "  ✅ Redis L1 hit rate: $L1_HIT_RATE"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ═══════════════════════════════════════════════════════════════
# Optional: Auto-update via cypher-shell (if installed)
# ═══════════════════════════════════════════════════════════════

if command -v cypher-shell &> /dev/null; then
    echo ""
    read -p "Auto-update Neo4j via cypher-shell? (y/n): " AUTO_UPDATE

    if [ "$AUTO_UPDATE" = "y" ]; then
        echo ""
        echo "Running cypher-shell..."
        cat "$CYPHER_FILE" | cypher-shell -u neo4j -p legal123 -a bolt://localhost:7687
        echo ""
        echo "✅ Neo4j graph updated successfully!"
    else
        echo ""
        echo "⚠️  Manual update required (see instructions above)"
    fi
else
    echo "⚠️  cypher-shell not installed — manual update required"
    echo "   (Install: pip install neo4j-driver)"
fi

echo ""
echo "Done! 🎉"
