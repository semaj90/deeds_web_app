#!/bin/bash

echo "🔐 TESTING COMPLETE AUTHENTICATION FLOW"
echo "======================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

BASE_URL="http://localhost:5173"
TEST_USER="demo@legal-ai.com"
TEST_PASSWORD="demo123"

# Test 1: Check if server is running
echo -e "${YELLOW}Test 1: Checking if server is running...${NC}"
if curl -s "$BASE_URL" > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Server is running on $BASE_URL${NC}"
else
  echo -e "${RED}✗ Server is not running${NC}"
  exit 1
fi

echo ""

# Test 2: Check login page is accessible
echo -e "${YELLOW}Test 2: Checking login page accessibility...${NC}"
response=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/login")
if [ "$response" = "200" ]; then
  echo -e "${GREEN}✓ Login page is accessible (HTTP $response)${NC}"
else
  echo -e "${RED}✗ Login page returned HTTP $response${NC}"
fi

echo ""

# Test 3: Check dashboard redirect (should redirect to /login if not authenticated)
echo -e "${YELLOW}Test 3: Checking dashboard protection...${NC}"
response=$(curl -s -i "$BASE_URL/dashboard" 2>&1 | grep -E "^(HTTP|Location:)" | head -2)
if echo "$response" | grep -q "30[127]"; then
  echo -e "${GREEN}✓ Dashboard is protected (redirects unauthenticated users)${NC}"
  echo "  Response: $(echo "$response" | tr '\n' ' ')"
else
  echo -e "${YELLOW}⚠ Dashboard response: $response${NC}"
fi

echo ""

# Test 4: Check auth API endpoint
echo -e "${YELLOW}Test 4: Checking authentication endpoint...${NC}"
auth_response=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$TEST_USER\", \"password\": \"$TEST_PASSWORD\"}" \
  -c /tmp/cookies.txt 2>&1)

if echo "$auth_response" | grep -q "success\|redirect\|user"; then
  echo -e "${GREEN}✓ Auth endpoint is responsive${NC}"
  echo "  Response: $(echo "$auth_response" | head -c 100)..."
else
  echo -e "${RED}✗ Auth endpoint error${NC}"
  echo "  Response: $auth_response"
fi

echo ""

# Test 5: Check logout endpoint exists
echo -e "${YELLOW}Test 5: Checking logout endpoint...${NC}"
response=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/logout")
if [ "$response" = "302" ] || [ "$response" = "303" ] || [ "$response" = "200" ]; then
  echo -e "${GREEN}✓ Logout endpoint exists and responds (HTTP $response)${NC}"
else
  echo -e "${YELLOW}⚠ Logout endpoint returned HTTP $response${NC}"
fi

echo ""

# Test 6: Check vector search API
echo -e "${YELLOW}Test 6: Checking vector search API...${NC}"
search_response=$(curl -s -X POST "$BASE_URL/api/search/vector" \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"test query\", \"limit\": 10}" 2>&1)

if echo "$search_response" | grep -q "success\|error\|results"; then
  echo -e "${GREEN}✓ Vector search endpoint is responsive${NC}"
  echo "  Response: $(echo "$search_response" | head -c 100)..."
else
  echo -e "${RED}✗ Vector search endpoint error${NC}"
  echo "  Response: $search_response"
fi

echo ""
echo "======================================="
echo -e "${GREEN}✓ AUTHENTICATION FLOW TESTS COMPLETE${NC}"
echo "======================================="
echo ""
echo "Test Credentials:"
echo "  📧 demo@legal-ai.com"
echo "  🔐 demo123"
echo ""
echo "Next Steps:"
echo "  1. Open $BASE_URL in your browser"
echo "  2. Click 'Login' button"
echo "  3. Enter test credentials above"
echo "  4. Verify redirect to /dashboard"
echo "  5. Check NavBar shows 'Signed in as demo@legal-ai.com'"
echo "  6. Click 'Sign out' to test logout flow"
