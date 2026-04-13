#!/bin/bash

# Neo4j Health Check Script
# Tests Neo4j connection, node count, and basic Cypher queries

set -e

echo "🔍 Neo4j Health Check"
echo "===================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Neo4j credentials (from docker-compose)
NEO4J_USER="neo4j"
NEO4J_PASS="neo4j123"
NEO4J_HTTP="http://localhost:7474"
NEO4J_BOLT="bolt://localhost:7687"

# Test 1: Docker container status
echo "📦 Test 1: Docker Container Status"
if docker ps --filter "name=legal-ai-neo4j" --format "{{.Status}}" | grep -q "Up"; then
  STATUS=$(docker ps --filter "name=legal-ai-neo4j" --format "{{.Status}}")
  echo -e "  ${GREEN}✅ Container running:${NC} $STATUS"
else
  echo -e "  ${RED}❌ Container not running${NC}"
  exit 1
fi
echo ""

# Test 2: HTTP API connection
echo "🌐 Test 2: HTTP API Connection"
HTTP_RESPONSE=$(curl -s -u ${NEO4J_USER}:${NEO4J_PASS} \
  ${NEO4J_HTTP}/db/neo4j/tx/commit \
  -H "Content-Type: application/json" \
  -d '{"statements":[{"statement":"RETURN 1 as num"}]}')

if echo "$HTTP_RESPONSE" | grep -q '"errors":\[\]'; then
  echo -e "  ${GREEN}✅ HTTP API responding correctly${NC}"
else
  echo -e "  ${RED}❌ HTTP API error${NC}"
  echo "  Response: $HTTP_RESPONSE"
  exit 1
fi
echo ""

# Test 3: Node count
echo "📊 Test 3: Graph Node Count"
NODE_COUNT_RESPONSE=$(curl -s -u ${NEO4J_USER}:${NEO4J_PASS} \
  ${NEO4J_HTTP}/db/neo4j/tx/commit \
  -H "Content-Type: application/json" \
  -d '{"statements":[{"statement":"MATCH (n) RETURN count(n) as total"}]}')

NODE_COUNT=$(echo "$NODE_COUNT_RESPONSE" | grep -o '"row":\[[0-9]*\]' | grep -o '[0-9]*')

if [ -n "$NODE_COUNT" ]; then
  echo -e "  ${GREEN}✅ Total nodes: $NODE_COUNT${NC}"
else
  echo -e "  ${YELLOW}⚠️  Could not parse node count${NC}"
fi
echo ""

# Test 4: Node labels
echo "🏷️  Test 4: Node Labels (Top 5)"
LABELS_RESPONSE=$(curl -s -u ${NEO4J_USER}:${NEO4J_PASS} \
  ${NEO4J_HTTP}/db/neo4j/tx/commit \
  -H "Content-Type: application/json" \
  -d '{"statements":[{"statement":"CALL db.labels() YIELD label RETURN label LIMIT 5"}]}')

if echo "$LABELS_RESPONSE" | grep -q '"errors":\[\]'; then
  echo -e "  ${GREEN}✅ Labels query successful${NC}"
  # Try to extract label names (basic parsing)
  LABELS=$(echo "$LABELS_RESPONSE" | grep -o '"row":\["[^"]*"\]' | grep -o '"\([^"]*\)"' | head -5)
  if [ -n "$LABELS" ]; then
    echo "  Labels found:"
    echo "$LABELS" | sed 's/^/    - /'
  fi
else
  echo -e "  ${YELLOW}⚠️  Could not retrieve labels${NC}"
fi
echo ""

# Test 5: Relationship count
echo "🔗 Test 5: Relationship Count"
REL_COUNT_RESPONSE=$(curl -s -u ${NEO4J_USER}:${NEO4J_PASS} \
  ${NEO4J_HTTP}/db/neo4j/tx/commit \
  -H "Content-Type: application/json" \
  -d '{"statements":[{"statement":"MATCH ()-[r]->() RETURN count(r) as total"}]}')

REL_COUNT=$(echo "$REL_COUNT_RESPONSE" | grep -o '"row":\[[0-9]*\]' | grep -o '[0-9]*')

if [ -n "$REL_COUNT" ]; then
  echo -e "  ${GREEN}✅ Total relationships: $REL_COUNT${NC}"
else
  echo -e "  ${YELLOW}⚠️  Could not parse relationship count${NC}"
fi
echo ""

# Test 6: SvelteKit API proxy test
echo "🔌 Test 6: SvelteKit API Proxy (optional)"
if curl -s http://localhost:5173/api/codebase-index/graph > /dev/null 2>&1; then
  GRAPH_API=$(curl -s http://localhost:5173/api/codebase-index/graph | grep -o '"nodes"' | wc -l)
  if [ "$GRAPH_API" -gt 0 ]; then
    echo -e "  ${GREEN}✅ /api/codebase-index/graph responding${NC}"
  else
    echo -e "  ${YELLOW}⚠️  /api/codebase-index/graph exists but unexpected format${NC}"
  fi
else
  echo -e "  ${YELLOW}⚠️  SvelteKit dev server not running or endpoint not implemented${NC}"
fi
echo ""

# Summary
echo "===================="
echo -e "${GREEN}✅ Neo4j Health Check: PASSING${NC}"
echo ""
echo "📋 Summary:"
echo "  - Container: Running"
echo "  - HTTP API: Responding"
echo "  - Nodes: $NODE_COUNT"
echo "  - Relationships: $REL_COUNT"
echo "  - Authentication: neo4j:neo4j123 ✅"
echo ""
echo "🔗 Endpoints:"
echo "  - HTTP: $NEO4J_HTTP"
echo "  - Bolt: $NEO4J_BOLT"
echo "  - Browser: $NEO4J_HTTP/browser/"
echo ""
echo "🚀 Next Steps:"
echo "  - Open Neo4j Browser: $NEO4J_HTTP/browser/"
echo "  - Run Playwright tests: cd sveltekit-frontend && npx playwright test analysis-routes.spec.ts"
echo "  - View test results: cat ../PLAYWRIGHT_NEO4J_TEST_RESULTS.md"
echo ""
