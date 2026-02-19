#!/bin/bash

# Phase 72 Deployment Script
# Deploys the Neo4j-based AST Error Reduction system

set -e

echo "🚀 Starting Phase 72: Neo4j-Based AST Error Reduction Deployment"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose is not installed."
    exit 1
fi

# Set environment variables
export NEO4J_PASSWORD=${NEO4J_PASSWORD:-password}
export REDIS_PASSWORD=${REDIS_PASSWORD:-redis}

echo "📦 Building Phase 72 services..."

# Build the services
docker-compose -f docker-compose.phase72.yml build

echo "🐳 Starting Phase 72 services..."

# Start the services
docker-compose -f docker-compose.phase72.yml up -d

echo "⏳ Waiting for services to be healthy..."

# Wait for Neo4j to be ready
echo "Waiting for Neo4j..."
timeout=300
counter=0
while ! docker-compose -f docker-compose.phase72.yml exec -T neo4j cypher-shell -u neo4j -p "$NEO4J_PASSWORD" "MATCH () RETURN count(*) limit 1" > /dev/null 2>&1; do
    if [ $counter -gt $timeout ]; then
        echo "❌ Neo4j failed to start within $timeout seconds"
        exit 1
    fi
    counter=$((counter + 10))
    echo "Still waiting for Neo4j... ($counter/$timeout seconds)"
    sleep 10
done

echo "✅ Neo4j is ready!"

# Wait for other services
services=("phase72-go-service" "phase72-python-service" "phase72-node-service")
for service in "${services[@]}"; do
    echo "Waiting for $service..."
    counter=0
    while ! docker-compose -f docker-compose.phase72.yml exec -T "$service" curl -f http://localhost:8072/api/v1/health > /dev/null 2>&1; do
        if [ $counter -gt 120 ]; then
            echo "❌ $service failed to start within 120 seconds"
            exit 1
        fi
        counter=$((counter + 10))
        echo "Still waiting for $service... ($counter/120 seconds)"
        sleep 10
    done
    echo "✅ $service is ready!"
done

echo ""
echo "🎉 Phase 72 deployment completed successfully!"
echo ""
echo "📊 Service Endpoints:"
echo "  • Neo4j Browser: http://localhost:7474 (neo4j/$NEO4J_PASSWORD)"
echo "  • Go Service: http://localhost:8072"
echo "  • Python Service: http://localhost:8073"
echo "  • Node.js Service: http://localhost:8074"
echo "  • Redis: localhost:6379"
echo "  • Qdrant: http://localhost:6333"
echo "  • Ollama: http://localhost:11434"
echo ""
echo "🔧 To check service health:"
echo "  docker-compose -f docker-compose.phase72.yml ps"
echo ""
echo "🛑 To stop services:"
echo "  docker-compose -f docker-compose.phase72.yml down"
echo ""
echo "📝 Next steps:"
echo "  1. Run svelte-check to generate error data"
echo "  2. Use the Node.js service to ingest errors"
echo "  3. Monitor the error reduction process"