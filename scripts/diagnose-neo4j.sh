#!/bin/bash
# Neo4j Connection Diagnostics
# Identifies authentication and connectivity issues

echo "🔍 Neo4j Diagnostics"
echo "═══════════════════════════════════════════════════════════════"

# Test 1: Check if Neo4j is running
echo ""
echo "[1] Checking if Neo4j container is running..."
if docker ps | grep -q legal-ai-neo4j; then
    echo "✅ Container: legal-ai-neo4j is RUNNING"
else
    echo "❌ Container: legal-ai-neo4j NOT RUNNING"
    echo "   Fix: docker-compose up -d legal-ai-neo4j"
    exit 1
fi

# Test 2: Check Bolt port
echo ""
echo "[2] Testing Bolt connection (port 7687)..."
if nc -z localhost 7687 2>/dev/null; then
    echo "✅ Bolt port 7687 is OPEN"
else
    echo "❌ Bolt port 7687 is CLOSED"
    echo "   Check: docker-compose logs legal-ai-neo4j | grep -i bolt"
    exit 1
fi

# Test 3: Check HTTP port
echo ""
echo "[3] Testing HTTP connection (port 7474)..."
if curl -s -o /dev/null -w "%{http_code}" http://localhost:7474 | grep -q 200; then
    echo "✅ HTTP port 7474 is OPEN"
else
    echo "❌ HTTP port 7474 is CLOSED"
    echo "   Check: docker-compose logs legal-ai-neo4j | grep -i http"
    exit 1
fi

# Test 4: Test default authentication
echo ""
echo "[4] Testing authentication (default: neo4j:neo4j123)..."
RESULT=$(cypher-shell -a bolt://localhost:7687 -u neo4j -p neo4j123 "RETURN 1" 2>&1)
if echo "$RESULT" | grep -q "1"; then
    echo "✅ Authentication: neo4j:neo4j123 WORKS"
    NEO4J_PASSWORD="neo4j123"
elif echo "$RESULT" | grep -q "unauthorized\|authentication failure"; then
    echo "⚠️  Authentication: neo4j:neo4j123 FAILED (auth error)"
    echo ""
    echo "   Password may have changed. Try these options:"
    echo "   1. Check .env file for NEO4J_PASSWORD value"
    echo "   2. Reset password in Docker:"
    echo "      docker exec legal-ai-neo4j cypher-shell -u neo4j -p neo4j 'ALTER USER neo4j SET PASSWORD \"neo4j123\"'"
    echo "   3. Check Docker logs:"
    echo "      docker logs legal-ai-neo4j | grep -i password"
    exit 1
else
    echo "❌ Authentication: Cannot determine error"
    echo "   Error: $RESULT"
    exit 1
fi

# Test 5: Check Neo4j version
echo ""
echo "[5] Checking Neo4j version..."
VERSION=$(cypher-shell -a bolt://localhost:7687 -u neo4j -p "$NEO4J_PASSWORD" "CALL dbms.components() YIELD name, versions RETURN versions[0]" 2>&1 | grep -oP '\d+\.\d+\.\d+')
if [ -n "$VERSION" ]; then
    echo "✅ Neo4j Version: $VERSION"
else
    echo "⚠️  Could not determine version"
fi

# Test 6: Check GDS installation
echo ""
echo "[6] Checking Graph Data Science (GDS)..."
GDS_CHECK=$(cypher-shell -a bolt://localhost:7687 -u neo4j -p "$NEO4J_PASSWORD" "CALL gds.version()" 2>&1)
if echo "$GDS_CHECK" | grep -q "version"; then
    echo "✅ GDS is INSTALLED"
else
    echo "⚠️  GDS may not be installed"
    echo "   Check: docker logs legal-ai-neo4j | grep -i 'graph-data-science'"
fi

# Test 7: Check Concept/Packet nodes
echo ""
echo "[7] Checking graph data..."
CONCEPT_COUNT=$(cypher-shell -a bolt://localhost:7687 -u neo4j -p "$NEO4J_PASSWORD" "MATCH (c:Concept) RETURN count(c)" 2>&1 | tail -1)
PACKET_COUNT=$(cypher-shell -a bolt://localhost:7687 -u neo4j -p "$NEO4J_PASSWORD" "MATCH (p:Packet) RETURN count(p)" 2>&1 | tail -1)
EDGE_COUNT=$(cypher-shell -a bolt://localhost:7687 -u neo4j -p "$NEO4J_PASSWORD" "MATCH ()-[r:USED_CONCEPT|SIMILAR]->() RETURN count(r)" 2>&1 | tail -1)

echo "   Concept nodes: $CONCEPT_COUNT"
echo "   Packet nodes: $PACKET_COUNT"
echo "   Graph edges (USED_CONCEPT|SIMILAR): $EDGE_COUNT"

if [ "$EDGE_COUNT" -eq 0 ] 2>/dev/null; then
    echo "⚠️  No edges found! Graph is empty."
    echo "   Phase 4B Task 2 will return empty results until edges are created."
fi

# Test 8: Summary
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "✅ All checks passed!"
echo ""
echo "Neo4j is ready for Phase 4B Task 2 (Neo4j graph signal)."
echo ""
echo "Next step:"
echo "  cd sveltekit-frontend"
echo "  npm run dev"
echo "  curl -X POST http://localhost:5173/api/search/rrf ..."
