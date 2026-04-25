#!/bin/bash
# Complete startup script for Triton Legal AI deployment

set -e

echo "🚀 Starting Triton Legal AI deployment..."

# Check prerequisites
echo "🔍 Checking prerequisites..."

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Please install Docker first."
    exit 1
fi

# Check Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose not found. Please install Docker Compose first."
    exit 1
fi

# Check NVIDIA Docker runtime
if ! docker info | grep -q nvidia; then
    echo "⚠️  NVIDIA Docker runtime not detected. GPU acceleration may not work."
    echo "   Install nvidia-docker2 for GPU support"
fi

# Check GPU availability
if command -v nvidia-smi &> /dev/null; then
    echo "✅ NVIDIA GPU detected:"
    nvidia-smi --query-gpu=name,memory.total,memory.used --format=csv,noheader,nounits | head -1
else
    echo "⚠️  nvidia-smi not found. GPU detection failed."
fi

# Create necessary directories
echo "📁 Creating required directories..."
mkdir -p triton-models/legal_embedding/1
mkdir -p triton-models/legal_generation/1
mkdir -p triton-logs
mkdir -p models/onnx
mkdir -p models/cache
mkdir -p logs

# Check if TensorRT engines exist
echo "🔍 Checking TensorRT engines..."

if [ ! -f "triton-models/legal_embedding/1/model.plan" ]; then
    echo "❌ Legal embedding TensorRT engine not found!"
    echo "   Please run: ./build-tensorrt-engines.sh"
    echo "   Or place your model.plan files in the appropriate directories"

    read -p "Continue without engines? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo "✅ Legal embedding engine found: $(du -h triton-models/legal_embedding/1/model.plan | cut -f1)"
fi

if [ ! -f "triton-models/legal_generation/1/model.plan" ]; then
    echo "⚠️  Legal generation TensorRT engine not found, but continuing..."
else
    echo "✅ Legal generation engine found: $(du -h triton-models/legal_generation/1/model.plan | cut -f1)"
fi

# Start services
echo "🐳 Starting Triton Legal AI services..."

# Pull latest images
echo "📥 Pulling latest Docker images..."
docker-compose -f docker-compose.triton.yml pull

# Start the stack
echo "🚀 Starting services..."
docker-compose -f docker-compose.triton.yml up -d

# Wait for services to become healthy
echo "⏳ Waiting for services to start..."
sleep 10

# Check service health
echo "🔍 Checking service health..."

# Check Triton server
max_attempts=30
attempt=0

while [ $attempt -lt $max_attempts ]; do
    if curl -f http://localhost:8000/v2/health/ready &> /dev/null; then
        echo "✅ Triton server is ready!"
        break
    fi

    echo "⏳ Waiting for Triton server... (attempt $((attempt + 1))/$max_attempts)"
    sleep 2
    attempt=$((attempt + 1))
done

if [ $attempt -eq $max_attempts ]; then
    echo "❌ Triton server failed to start within timeout"
    echo "📋 Checking logs..."
    docker-compose -f docker-compose.triton.yml logs triton-legal-ai
    exit 1
fi

# Check other services
echo "🔍 Checking other services..."

# PostgreSQL
if curl -f http://localhost:8080/health &> /dev/null; then
    echo "✅ Legal gateway is ready!"
else
    echo "⚠️  Legal gateway not ready yet..."
fi

# Display service status
echo "📊 Service Status:"
docker-compose -f docker-compose.triton.yml ps

# Display endpoints
echo ""
echo "🌐 Available Endpoints:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🔹 Triton HTTP API:      http://localhost:8000"
echo "  🔹 Triton gRPC API:      localhost:8001"
echo "  🔹 Triton Metrics:       http://localhost:8002/metrics"
echo "  🔹 Legal AI Gateway:     http://localhost:8080"
echo "  🔹 PostgreSQL:           localhost:5434"
echo "  🔹 Redis:                localhost:6380"
echo "  🔹 Prometheus:           http://localhost:9090"
echo "  🔹 Grafana:              http://localhost:3001 (admin/admin)"
echo ""

# Test endpoints
echo "🧪 Running basic connectivity tests..."

# Test Triton health
if curl -f http://localhost:8000/v2/health/ready &> /dev/null; then
    echo "✅ Triton server health check passed"
else
    echo "❌ Triton server health check failed"
fi

# Test model availability
if curl -f http://localhost:8000/v2/models &> /dev/null; then
    echo "✅ Triton models endpoint accessible"
    echo "📋 Available models:"
    curl -s http://localhost:8000/v2/models | jq -r '.models[]?.name // "No models found"' 2>/dev/null || echo "   (jq not available for model parsing)"
else
    echo "❌ Triton models endpoint failed"
fi

# Run comprehensive tests
echo ""
echo "🧪 Running comprehensive tests..."
if [ -f "test-triton-endpoints.py" ]; then
    echo "   To run full test suite: python3 test-triton-endpoints.py"
    echo "   To run quick tests:     python3 test-triton-endpoints.py --quick"
else
    echo "   test-triton-endpoints.py not found"
fi

# Display useful commands
echo ""
echo "🛠️  Useful Commands:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  📊 View logs:            docker-compose -f docker-compose.triton.yml logs -f triton-legal-ai"
echo "  🔄 Restart services:     docker-compose -f docker-compose.triton.yml restart"
echo "  🛑 Stop services:        docker-compose -f docker-compose.triton.yml down"
echo "  📈 GPU monitoring:       watch nvidia-smi"
echo "  🧪 Test performance:     python3 test-triton-endpoints.py"
echo ""

echo "🎉 Triton Legal AI deployment started successfully!"
echo "   Ready for high-performance legal document processing!"

# Optional: Start monitoring
read -p "Start GPU monitoring in background? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if command -v nvidia-smi &> /dev/null; then
        echo "📊 Starting GPU monitoring..."
        watch -n 2 'nvidia-smi --query-gpu=timestamp,name,pci.bus_id,driver_version,pstate,pcie.link.gen.max,pcie.link.gen.current,temperature.gpu,utilization.gpu,utilization.memory,memory.total,memory.free,memory.used --format=csv' &
        echo "   GPU monitoring started in background"
    fi
fi