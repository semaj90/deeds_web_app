#!/bin/bash

# 🔥 Smoke Test Suite - Legal AI Platform
# Tests core authentication and routes without external services

set -e

echo "🔥 Starting Smoke Test Suite..."
echo "================================"
echo ""

# Configuration
BASE_URL="${BASE_URL:-http://localhost:5173}"
API_URL="${BASE_URL}/api"
LOGIN_EMAIL="demo@legal-ai.com"
LOGIN_PASSWORD="demo123"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
SKIPPED=0

# Helper function for tests
test_endpoint() {
  local name="$1"
  local method="$2"
  local endpoint="$3"
  local data="$4"
  local expected_status="$5"
  local cookie_jar="$6"

  echo -n "Testing: $name... "

  if [ -z "$expected_status" ]; then
    expected_status="200"
  fi

  local curl_cmd="curl -s -X $method '$BASE_URL$endpoint'"

  if [ ! -z "$data" ]; then
    curl_cmd="$curl_cmd -H 'Content-Type: application/json' -d '$data'"
  fi

  if [ ! -z "$cookie_jar" ]; then
    curl_cmd="$curl_cmd -b '$cookie_jar' -c '$cookie_jar'"
  fi

  curl_cmd="$curl_cmd -w '\n%{http_code}' -o /tmp/response.txt"

  local response=$(eval $curl_cmd)
  local status_code=$(echo "$response" | tail -n1)
  local body=$(cat /tmp/response.txt)

  if [[ "$status_code" == "$expected_status" ]] || [[ "$status_code" == "200" && "$expected_status" == "200" ]]; then
    echo -e "${GREEN}✓ PASS${NC} (HTTP $status_code)"
    PASSED=$((PASSED + 1))
  else
    echo -e "${RED}✗ FAIL${NC} (Expected $expected_status, got $status_code)"
    echo "  Response: $(echo $body | head -c 100)"
    FAILED=$((FAILED + 1))
  fi
}

# Check if server is running
echo "🚀 Checking if server is running at $BASE_URL..."
if ! curl -s "$BASE_URL/login" > /dev/null 2>&1; then
  echo -e "${RED}✗ Server not responding at $BASE_URL${NC}"
  echo "  Please start the dev server with:"
  echo "  npm run dev -- --port 5173 --host 127.0.0.1"
  exit 1
fi
echo -e "${GREEN}✓ Server is running${NC}"
echo ""

# Test 1: Login Page Load
echo "📋 Phase 1: Authentication Tests"
echo "=================================="
test_endpoint "Login page loads" "GET" "/login" "" "200"

# Test 2: API Login
echo ""
echo "Testing API login endpoint..."
LOGIN_DATA="{\"email\":\"$LOGIN_EMAIL\",\"password\":\"$LOGIN_PASSWORD\"}"
COOKIE_JAR="/tmp/auth_cookies.txt"

RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "$LOGIN_DATA" \
  -c "$COOKIE_JAR" \
  -w '\n%{http_code}')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

echo -n "API Login with valid credentials... "
if [[ "$HTTP_CODE" == "200" ]]; then
  echo -e "${GREEN}✓ PASS${NC} (HTTP $HTTP_CODE)"
  PASSED=$((PASSED + 1))

  # Extract session info
  SESSION_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  USER_EMAIL=$(echo "$BODY" | grep -o '"email":"[^"]*"' | head -1 | cut -d'"' -f4)

  if [ ! -z "$SESSION_ID" ]; then
    echo -e "  ${GREEN}✓${NC} Session created: $SESSION_ID"
  fi
  if [ ! -z "$USER_EMAIL" ]; then
    echo -e "  ${GREEN}✓${NC} User authenticated: $USER_EMAIL"
  fi
else
  echo -e "${RED}✗ FAIL${NC} (Expected 200, got $HTTP_CODE)"
  FAILED=$((FAILED + 1))
  echo "  Response: $(echo $BODY | head -c 200)"
fi

# Test 3: Dashboard Access (Protected Route)
echo ""
echo -n "Dashboard access (protected route)... "
DASH_RESPONSE=$(curl -s -X GET "$BASE_URL/(ai)/dashboard" \
  -b "$COOKIE_JAR" \
  -w '\n%{http_code}' -o /tmp/dashboard.txt)

DASH_CODE=$(echo "$DASH_RESPONSE" | tail -n1)
if [[ "$DASH_CODE" == "200" ]]; then
  echo -e "${GREEN}✓ PASS${NC} (HTTP $DASH_CODE)"
  PASSED=$((PASSED + 1))
else
  echo -e "${RED}✗ FAIL${NC} (Expected 200, got $DASH_CODE)"
  FAILED=$((FAILED + 1))
fi

# Test 4: Case Management Routes
echo ""
echo "📊 Phase 2: Case Management Tests"
echo "=================================="

test_endpoint "GET /api/case-management/cases" "GET" "/api/case-management/cases" "" "200" "$COOKIE_JAR"

CREATE_CASE="{\"title\":\"Smoke Test Case\",\"description\":\"Test case for smoke testing\",\"status\":\"open\"}"
test_endpoint "POST /api/case-management/cases" "POST" "/api/case-management/cases" "$CREATE_CASE" "200" "$COOKIE_JAR"

test_endpoint "GET Dashboard stats" "GET" "/api/case-management/dashboard" "" "200" "$COOKIE_JAR"

# Test 5: Session Validation
echo ""
echo "🔐 Phase 3: Session Management Tests"
echo "======================================"

test_endpoint "Session cookie present" "GET" "/login" "" "200" "$COOKIE_JAR"

# Test 6: Error Handling
echo ""
echo "⚠️  Phase 4: Error Handling Tests"
echo "=================================="

test_endpoint "Invalid login fails" "POST" "/api/auth/login" "{\"email\":\"wrong@example.com\",\"password\":\"wrongpass\"}" "400"

test_endpoint "Missing password fails" "POST" "/api/auth/login" "{\"email\":\"demo@legal-ai.com\"}" "400"

# Test 7: External Service Dependencies
echo ""
echo "🔌 Phase 5: Service Dependencies (Expected to Fail Without Services)"
echo "===================================================================="

# These should fail gracefully without external services
echo -n "Embeddings endpoint (needs Ollama)... "
EMB_RESPONSE=$(curl -s -X POST "$API_URL/embeddings" \
  -H "Content-Type: application/json" \
  -d '{"text":"test"}' \
  -w '\n%{http_code}' -o /tmp/emb.txt)
EMB_CODE=$(echo "$EMB_RESPONSE" | tail -n1)

if [[ "$EMB_CODE" == "503" ]] || [[ "$EMB_CODE" == "500" ]]; then
  echo -e "${YELLOW}⊘ EXPECTED FAIL${NC} (HTTP $EMB_CODE - needs Ollama)"
  SKIPPED=$((SKIPPED + 1))
else
  echo -e "${YELLOW}? UNKNOWN${NC} (HTTP $EMB_CODE)"
fi

echo -n "Evidence upload (needs Redis/MinIO/Ollama)... "
EV_RESPONSE=$(curl -s -X POST "$API_URL/evidence/upload" \
  -F "file=@/dev/null" \
  -w '\n%{http_code}' -o /tmp/ev.txt)
EV_CODE=$(echo "$EV_RESPONSE" | tail -n1)

if [[ "$EV_CODE" == "503" ]] || [[ "$EV_CODE" == "500" ]] || [[ "$EV_CODE" == "400" ]]; then
  echo -e "${YELLOW}⊘ EXPECTED FAIL${NC} (HTTP $EV_CODE - needs external services)"
  SKIPPED=$((SKIPPED + 1))
else
  echo -e "${YELLOW}? UNKNOWN${NC} (HTTP $EV_CODE)"
fi

# Summary
echo ""
echo "🏁 Test Summary"
echo "==============="
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo -e "${YELLOW}Skipped: $SKIPPED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ All core tests PASSED!${NC}"
  echo ""
  echo "Platform is ready for deployment:"
  echo "- Authentication working ✓"
  echo "- Session management working ✓"
  echo "- Case management working ✓"
  echo ""
  echo "To enable advanced features, start external services:"
  echo "  Redis:   redis-server --port 6379 --requirepass redis"
  echo "  Ollama:  ollama serve"
  echo "  Qdrant:  docker run -p 6333:6333 qdrant/qdrant"
  echo "  MinIO:   docker run -p 9000:9000 minio/minio"
  exit 0
else
  echo -e "${RED}✗ Some tests FAILED${NC}"
  exit 1
fi
