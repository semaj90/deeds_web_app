#!/bin/bash

# POI Backend Smoke Test Script
# Tests all 9 POI endpoints

set -e

BASE_URL="http://localhost:8000"
CASE_ID="smoke-test-$(date +%s)"

echo "🧪 POI Backend Smoke Tests"
echo "================================"
echo "Base URL: $BASE_URL"
echo "Case ID: $CASE_ID"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function to test endpoint
test_endpoint() {
    local method=$1
    local endpoint=$2
    local data=$3
    local expected_status=$4
    local description=$5

    echo -n "Testing: $description... "

    if [ -z "$data" ]; then
        response=$(curl -s -w "\n%{http_code}" -X $method "$BASE_URL$endpoint")
    else
        response=$(curl -s -w "\n%{http_code}" -X $method "$BASE_URL$endpoint" \
            -H "Content-Type: application/json" \
            -d "$data")
    fi

    status_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)

    if [ "$status_code" = "$expected_status" ]; then
        echo -e "${GREEN}✓ PASS${NC} (HTTP $status_code)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        echo "$body"
    else
        echo -e "${RED}✗ FAIL${NC} (Expected $expected_status, got $status_code)"
        echo "Response: $body"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
    echo ""
}

# 1. Health Check
echo "📋 Health Checks"
echo "--------------------------------"
test_endpoint "GET" "/health" "" "200" "Basic health check"
test_endpoint "GET" "/api/health" "" "200" "Detailed health check"
echo ""

# 2. Create POI
echo "📋 POI CRUD Operations"
echo "--------------------------------"

POI_DATA='{
    "case_id": "'$CASE_ID'",
    "name": "John Doe",
    "date_of_birth": "1990-01-15",
    "email": "john@example.com",
    "phone": "+1-555-0123",
    "address": "123 Main St, City, State 12345",
    "status": "suspect",
    "priority": "high",
    "threat_level": "medium",
    "occupation": "Software Engineer",
    "last_known_location": "Downtown",
    "physical_description": "6ft tall, brown hair, blue eyes"
}'

test_endpoint "POST" "/api/persons-of-interest" "$POI_DATA" "200" "Create POI"

# Extract POI ID from response (simplified - assumes it's in the response)
POI_ID=$(curl -s -X POST "$BASE_URL/api/persons-of-interest" \
    -H "Content-Type: application/json" \
    -d "$POI_DATA" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$POI_ID" ]; then
    echo -e "${YELLOW}⚠️  Could not extract POI ID, using placeholder${NC}"
    POI_ID="test-poi-id"
fi

echo "Using POI ID: $POI_ID"
echo ""

# 3. List POIs
test_endpoint "GET" "/api/persons-of-interest?case_id=$CASE_ID" "" "200" "List POIs"

# 4. Get POI
test_endpoint "GET" "/api/persons-of-interest/$POI_ID" "" "200" "Get POI details"

# 5. Update POI
UPDATE_DATA='{
    "status": "witness",
    "priority": "medium"
}'
test_endpoint "PUT" "/api/persons-of-interest/$POI_ID" "$UPDATE_DATA" "200" "Update POI"

# 6. Add Associate
ASSOCIATE_DATA='{
    "associate_id": "associate-001",
    "relationship_type": "colleague",
    "notes": "Works at same company"
}'
test_endpoint "POST" "/api/persons-of-interest/$POI_ID/associates" "$ASSOCIATE_DATA" "200" "Add associate"

# 7. List Associates
test_endpoint "GET" "/api/persons-of-interest/$POI_ID/associates" "" "200" "List associates"

# 8. Search POIs
SEARCH_DATA='{
    "query": "John Doe",
    "case_id": "'$CASE_ID'",
    "limit": 10
}'
test_endpoint "POST" "/api/persons-of-interest/search" "$SEARCH_DATA" "200" "Search POIs"

# 9. Remove Associate
test_endpoint "DELETE" "/api/persons-of-interest/$POI_ID/associates/associate-001" "" "200" "Remove associate"

# 10. Delete POI
test_endpoint "DELETE" "/api/persons-of-interest/$POI_ID" "" "200" "Delete POI"

echo ""
echo "================================"
echo "📊 Test Results"
echo "================================"
echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    exit 1
fi
