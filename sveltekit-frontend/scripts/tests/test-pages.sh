#!/bin/bash

# Test script for new case pages (overview + reports)

BASE_URL="http://localhost:5173"
CASE_ID="test-case-001"

echo "🧪 Testing Cases Pages Integration"
echo "=================================="
echo ""

# Test 1: Overview page renders
echo "Test 1: Overview page"
echo "  GET $BASE_URL/cases/$CASE_ID/overview"
curl -s -I "$BASE_URL/cases/$CASE_ID/overview" | grep -E "HTTP|Content-Type"
echo ""

# Test 2: Reports page renders
echo "Test 2: Reports page"
echo "  GET $BASE_URL/cases/$CASE_ID/reports"
curl -s -I "$BASE_URL/cases/$CASE_ID/reports" | grep -E "HTTP|Content-Type"
echo ""

# Test 3: Errors summary endpoint
echo "Test 3: Phase 72 - Errors summary"
echo "  GET $BASE_URL/api/errors/summary"
curl -s "$BASE_URL/api/errors/summary" | jq '.' 2>/dev/null || echo "  (JSON parse failed - endpoint may not be ready)"
echo ""

# Test 4: Consolidation status endpoint
echo "Test 4: Phase 72 - Consolidation status"
echo "  GET $BASE_URL/api/consolidation/status"
curl -s "$BASE_URL/api/consolidation/status" | jq '.' 2>/dev/null || echo "  (JSON parse failed - endpoint may not be ready)"
echo ""

# Test 5: Case API (stub)
echo "Test 5: Case data endpoint"
echo "  GET $BASE_URL/api/cases/$CASE_ID"
curl -s "$BASE_URL/api/cases/$CASE_ID" 2>&1 | head -5
echo ""

echo "✅ All page tests complete!"
echo ""
echo "📋 Next steps:"
echo "  1. Open http://localhost:5173/cases/test-case-001/overview in browser"
echo "  2. Open http://localhost:5173/cases/test-case-001/reports in browser"
echo "  3. Click buttons and verify Phase 72 diagnostics load"
