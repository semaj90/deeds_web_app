#!/usr/bin/env bash

# Redis + Bifrost Load Testing Suite
# Runs multiple test scenarios with increasing load

set -e

echo "╔═══════════════════════════════════════════════════════════════════════════════╗"
echo "║                   Redis + Bifrost Load Testing Suite                         ║"
echo "╚═══════════════════════════════════════════════════════════════════════════════╝"
echo ""

# Check if dev server is running
if ! curl -s http://localhost:5173/api/health > /dev/null 2>&1; then
    echo "❌ Dev server not running on port 5173"
    echo "   Start with: npm run dev"
    exit 1
fi

echo "✅ Dev server is running"
echo ""

# Test scenarios
echo "Running load test scenarios..."
echo ""

# Scenario 1: Warm-up (low load, 30s)
echo "📊 Scenario 1: Warm-up Test"
echo "   Duration: 30s | Concurrency: 10 | Target: 1,000 QPM"
echo ""
node scripts/tests/redis-load-test.mjs --duration=30 --concurrency=10
echo ""
sleep 5

# Scenario 2: Medium load (60s)
echo "📊 Scenario 2: Medium Load Test"
echo "   Duration: 60s | Concurrency: 50 | Target: 12,000 QPM"
echo ""
node scripts/tests/redis-load-test.mjs --duration=60 --concurrency=50
echo ""
sleep 5

# Scenario 3: High load (60s)
echo "📊 Scenario 3: High Load Test"
echo "   Duration: 60s | Concurrency: 100 | Target: 12,000 QPM"
echo ""
node scripts/tests/redis-load-test.mjs --duration=60 --concurrency=100
echo ""
sleep 5

# Scenario 4: Sustained load (300s = 5 min)
echo "📊 Scenario 4: Sustained Load Test"
echo "   Duration: 300s | Concurrency: 100 | Target: 12,000 QPM"
echo ""
node scripts/tests/redis-load-test.mjs --duration=300 --concurrency=100
echo ""

echo "╔═══════════════════════════════════════════════════════════════════════════════╗"
echo "║                        All Test Scenarios Complete                            ║"
echo "╚═══════════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "Reports saved to: scripts/tests/redis-load-test-report.json"
echo ""
echo "Next steps:"
echo "  1. Review hit rates (target: ≥90%)"
echo "  2. Check p99 latency (target: <20ms)"
echo "  3. Monitor Redis memory growth"
echo "  4. Verify no evictions occurred"
echo ""
