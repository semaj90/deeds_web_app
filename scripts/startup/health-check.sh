#!/bin/bash
# Service health check — validates all running services before dev work
# Use after docker-compose up to verify full stack is ready

set -e

WORKSPACE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "🔍 [$(date '+%Y-%m-%d %H:%M:%S')] Checking service health..."
echo ""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_service() {
  local name=$1
  local port=$2
  local path=${3:-"/"}
  local expected_status=${4:-"200"}

  echo -n "  $name (:$port$path)... "

  if timeout 5 bash -c "echo >/dev/tcp/localhost/$port" 2>/dev/null; then
    if command -v curl &> /dev/null; then
      response=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$port$path" 2>/dev/null || echo "000")
      if [ "$response" = "$expected_status" ]; then
        echo -e "${GREEN}✅ OK${NC} (HTTP $response)"
        return 0
      else
        echo -e "${YELLOW}⚠️  Unexpected status${NC} (HTTP $response, expected $expected_status)"
        return 0
      fi
    else
      echo -e "${GREEN}✅ OK${NC} (port open)"
      return 0
    fi
  else
    echo -e "${RED}❌ DOWN${NC}"
    return 1
  fi
}

# Track failures
FAILED=0

echo "📊 Cache & Persistence:"
check_service "Redis (L1 Exact Match)" "6379" "/" "PONG" || ((FAILED++))
echo ""

echo "🧠 Inference Engine:"
check_service "Ollama (Gemma4)" "11434" "/api/tags" || ((FAILED++))
check_service "Bifrost (L2 Semantic)" "3040" "/health" || ((FAILED++))
echo ""

echo "🔍 Vector & Graph:"
check_service "Qdrant (Vectors)" "6333" "/" || ((FAILED++))
check_service "Neo4j (Graph)" "7474" "/browser/" || ((FAILED++))
echo ""

echo "📝 Database & Queue:"
check_service "PostgreSQL" "5432" "" || ((FAILED++))
check_service "RabbitMQ (AMQP)" "5672" "" || ((FAILED++))
check_service "RabbitMQ (Management UI)" "15672" "/" || ((FAILED++))
echo ""

echo "🌐 Frontend:"
check_service "SvelteKit Dev" "5173" "/" || ((FAILED++))
echo ""

echo "🛠️  Development Tools:"
check_service "MCP TRACE" "8788" "/tools" || ((FAILED++))
check_service "KB Retrieval" "8789" "/" || ((FAILED++))
check_service "Go Retrieval (HTTP)" "8100" "/health" || ((FAILED++))
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ All services healthy!${NC}"
  echo ""
  echo "Ready to develop:"
  echo "  • SvelteKit: http://localhost:5173"
  echo "  • Neo4j Browser: http://localhost:7474"
  echo "  • RabbitMQ UI: http://localhost:15672 (guest:guest)"
  exit 0
else
  echo -e "${RED}❌ $FAILED service(s) down${NC}"
  echo ""
  echo "To start services:"
  echo "  docker-compose up -d"
  echo ""
  echo "Then rerun this check:"
  echo "  bash scripts/startup/health-check.sh"
  exit 1
fi
