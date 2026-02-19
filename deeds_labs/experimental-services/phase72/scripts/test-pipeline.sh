#!/bin/bash

# Phase 72 End-to-End Test Script
# Tests the complete AST error reduction pipeline

set -e

echo "🧪 Starting Phase 72 End-to-End Pipeline Test"

# Check if services are running
echo "Checking service health..."

services=(
    "http://localhost:8072/api/v1/health:Go Service"
    "http://localhost:8073/health:Python Service"
    "http://localhost:8074/api/v1/health:Node.js Service"
    "http://localhost:7474:Neo4j"
    "http://localhost:6379:Redis"
    "http://localhost:6333/health:Qdrant"
)

for service in "${services[@]}"; do
    url=$(echo $service | cut -d: -f1)
    name=$(echo $service | cut -d: -f2)

    if curl -f -s "$url" > /dev/null 2>&1; then
        echo "✅ $name is healthy"
    else
        echo "❌ $name is not responding"
        exit 1
    fi
done

echo ""
echo "📥 Step 1: Running svelte-check to generate error data..."

# Run svelte-check in the frontend directory
cd sveltekit-frontend
if command -v npx &> /dev/null; then
    npx svelte-check --tsconfig ./tsconfig.json --output json > ../phase72-svelte-check-output.json 2>&1 || true
else
    echo "⚠️ npx not found, skipping svelte-check generation"
    # Create sample error data for testing
    cat > ../phase72-svelte-check-output.json << 'EOF'
[
  {
    "type": "error",
    "filename": "src/lib/components/CommandMenu.svelte",
    "line": 45,
    "column": 10,
    "message": "Cannot find name 'onClick'. Did you mean 'onclick'?",
    "code": "TS2304"
  },
  {
    "type": "error",
    "filename": "src/lib/components/Checkbox.svelte",
    "line": 23,
    "column": 15,
    "message": "Property 'onChange' does not exist on type 'HTMLInputElement'",
    "code": "TS2339"
  }
]
EOF
fi
cd ..

echo "📊 Step 2: Ingesting errors into Phase 72 system..."

# Send errors to the Node.js service for ingestion
curl -X POST \
  -H "Content-Type: application/json" \
  -d @"phase72-svelte-check-output.json" \
  http://localhost:8074/api/v1/ingest-errors

echo ""
echo "🧮 Step 3: Triggering error embedding and clustering..."

# Wait a moment for ingestion to complete
sleep 5

# Trigger the embedding pipeline
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"batch_size": 10, "cluster_eps": 0.3}' \
  http://localhost:8073/embed-and-cluster

echo ""
echo "🤖 Step 4: Generating AI patches for error clusters..."

# Wait for clustering to complete
sleep 10

# Get clusters and generate patches
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "max_patches": 5,
    "min_confidence": 0.7
  }' \
  http://localhost:8074/api/v1/generate-all-patches

echo ""
echo "🔄 Step 5: Applying patches and validating fixes..."

# Wait for patch generation
sleep 15

# Apply validated patches
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "dry_run": false,
    "auto_apply": true
  }' \
  http://localhost:8074/api/v1/apply-validated-patches

echo ""
echo "📈 Step 6: Checking error reduction results..."

# Get final statistics
curl -s http://localhost:8074/api/v1/pipeline-stats | jq . 2>/dev/null || curl -s http://localhost:8074/api/v1/pipeline-stats

echo ""
echo "🎉 Phase 72 pipeline test completed!"
echo ""
echo "📊 To monitor ongoing progress:"
echo "  curl http://localhost:8074/api/v1/pipeline-stats"
echo ""
echo "🔍 To view generated patches:"
echo "  curl http://localhost:8074/api/v1/patches"
echo ""
echo "📝 Check the logs for detailed information:"
echo "  docker-compose -f docker-compose.phase72.yml logs -f"