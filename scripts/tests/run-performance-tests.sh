#!/bin/bash

# Performance Testing Runner
# Executes all 6 cache performance tests via Playwright

set -e

echo "======================================"
echo "Performance Cache Testing Suite"
echo "======================================"
echo ""

# Check if dev server is running
echo "Checking if dev server is running on port 5173..."
if ! curl -s http://localhost:5173 > /dev/null; then
    echo "❌ Dev server is not running!"
    echo ""
    echo "Please start the dev server first:"
    echo "  cd sveltekit-frontend && npm run dev"
    echo ""
    exit 1
fi

echo "✅ Dev server is running"
echo ""

# Check Docker services
echo "Checking Docker services..."
SERVICES=("phase66-postgres" "phase66-redis" "phase66-qdrant" "phase66-rabbitmq")
MISSING=()

for service in "${SERVICES[@]}"; do
    if ! docker ps | grep -q "$service"; then
        MISSING+=("$service")
    fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
    echo "⚠️  Warning: Some Docker services are not running:"
    for service in "${MISSING[@]}"; do
        echo "  - $service"
    done
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo "✅ All Docker services running"
fi

echo ""
echo "Starting performance tests..."
echo ""

# Run Playwright tests
npx playwright test scripts/tests/performance-cache.spec.ts \
    --reporter=list \
    --timeout=60000

echo ""
echo "======================================"
echo "Performance Testing Complete!"
echo "======================================"
echo ""
echo "Results saved to:"
echo "  - scripts/tests/performance-results/performance-results-*.json"
echo "  - PERFORMANCE_TEST_RESULTS.md (updated)"
echo ""
