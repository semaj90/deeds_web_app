#!/usr/bin/env bash
# Phase 70: Development Environment Setup
# Sets up the complete development environment for Phase 70 AI stack

set -e

echo "🚀 Phase 70 Development Environment Setup"
echo "=========================================="

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is available
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not available. Please install Docker Compose."
    exit 1
fi

echo "✅ Docker environment detected"

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p logs
mkdir -p data/chroma_db
mkdir -p data/models
mkdir -p data/tensorrt_engines
mkdir -p data/uploads

echo "✅ Directories created"

# Set environment variables
export PHASE70_ENV=development
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

echo "🔧 Environment variables set"

# Pull cached NVIDIA containers (if available)
echo "🐳 Pulling NVIDIA containers..."
docker pull nvcr.io/nvidia/tensorrt:24.01-py3 || echo "⚠️  Could not pull TensorRT container (may be cached)"

echo "✅ Container pull completed"

# Build Phase 70 services
echo "🔨 Building Phase 70 services..."
if command -v docker-compose &> /dev/null; then
    docker-compose -f docker-compose-phase70.yml build --parallel
else
    docker compose -f docker-compose-phase70.yml build --parallel
fi

echo "✅ Services built"

# Start services
echo "🚀 Starting Phase 70 services..."
if command -v docker-compose &> /dev/null; then
    docker-compose -f docker-compose-phase70.yml up -d
else
    docker compose -f docker-compose-phase70.yml up -d
fi

echo "✅ Services started"

# Wait for services to be healthy
echo "⏳ Waiting for services to be healthy..."
sleep 30

# Health checks
echo "🏥 Running health checks..."

# TensorRT-LLM Service
if curl -f http://localhost:8099/health &> /dev/null; then
    echo "✅ TensorRT-LLM service is healthy"
else
    echo "❌ TensorRT-LLM service is not responding"
fi

# PyTorch Fallback Service
if curl -f http://localhost:8100/health &> /dev/null; then
    echo "✅ PyTorch fallback service is healthy"
else
    echo "❌ PyTorch fallback service is not responding"
fi

# OCR Service
if curl -f http://localhost:8101/health &> /dev/null; then
    echo "✅ OCR service is healthy"
else
    echo "❌ OCR service is not responding"
fi

# Language Extraction Service
if curl -f http://localhost:8102/health &> /dev/null; then
    echo "✅ Language extraction service is healthy"
else
    echo "❌ Language extraction service is not responding"
fi

# Web Crawl Service
if curl -f http://localhost:8103/health &> /dev/null; then
    echo "✅ Web crawl service is healthy"
else
    echo "❌ Web crawl service is not responding"
fi

# RAG Ingest Service
if curl -f http://localhost:8104/health &> /dev/null; then
    echo "✅ RAG ingest service is healthy"
else
    echo "❌ RAG ingest service is not responding"
fi

echo ""
echo "🎉 Phase 70 development environment setup complete!"
echo ""
echo "📋 Service Endpoints:"
echo "  TensorRT-LLM:     http://localhost:8099"
echo "  PyTorch Fallback: http://localhost:8100"
echo "  OCR Service:      http://localhost:8101"
echo "  Lang Extract:     http://localhost:8102"
echo "  Web Crawl:        http://localhost:8103"
echo "  RAG Ingest:       http://localhost:8104"
echo ""
echo "🔧 Next steps:"
echo "  1. Run engine builder: ./engine-builder/build_engine.py"
echo "  2. Run QLoRA training: ./training/qlora_train.py"
echo "  3. Test services with: ./dev/test_services.py"
echo ""
echo "📊 Monitor services:"
echo "  docker-compose -f docker-compose-phase70.yml logs -f"