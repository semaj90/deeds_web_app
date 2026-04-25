#!/bin/bash

# Docker Desktop + QUIC Development Environment Setup
# This script sets up the complete development environment with Docker Desktop

set -e

echo "🚀 Setting up Docker Desktop + QUIC Development Environment"
echo "============================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check if Docker Desktop is running
check_docker() {
    print_info "Checking Docker Desktop..."
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker Desktop is not running. Please start Docker Desktop and try again."
        exit 1
    fi
    print_status "Docker Desktop is running"
}

# Check if required ports are available
check_ports() {
    print_info "Checking port availability..."
    local ports=(6379 5432 7474 7687 9000 9001 6333 6334 11434 8094)
    local occupied_ports=()
    
    for port in "${ports[@]}"; do
        if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
            occupied_ports+=($port)
        fi
    done
    
    if [ ${#occupied_ports[@]} -gt 0 ]; then
        print_warning "The following ports are already in use: ${occupied_ports[*]}"
        print_info "You may need to stop existing services or change port mappings in docker-compose.dev.yml"
    else
        print_status "All required ports are available"
    fi
}

# Create necessary directories
create_directories() {
    print_info "Creating necessary directories..."
    mkdir -p ./data/{redis,postgres,neo4j,minio,qdrant,ollama}
    print_status "Directories created"
}

# Start Docker services
start_services() {
    print_info "Starting Docker services..."
    docker-compose -f docker-compose.dev.yml up -d
    
    print_info "Waiting for services to be ready..."
    sleep 10
    
    # Check service health
    local services=(redis postgres neo4j minio qdrant ollama)
    for service in "${services[@]}"; do
        if docker-compose -f docker-compose.dev.yml ps $service | grep -q "Up"; then
            print_status "$service is running"
        else
            print_warning "$service may not be ready yet"
        fi
    done
}

# Install Go dependencies for RAG service
setup_rag_service() {
    print_info "Setting up Go RAG service dependencies..."
    cd ../go-enhanced-rag-service
    
    # Add sonic dependency
    if ! grep -q "github.com/bytedance/sonic" go.mod; then
        go get github.com/bytedance/sonic
        print_status "Added sonic JSON library"
    fi
    
    # Build the service
    go mod tidy
    go build -o rag-service .
    print_status "Go RAG service built successfully"
    
    cd ../sveltekit-frontend
}

# Setup environment variables
setup_env() {
    print_info "Setting up environment variables..."
    
    # Copy Docker environment file
    if [ ! -f .env ]; then
        cp env.docker .env
        print_status "Created .env file from Docker configuration"
    fi
    
    # Add to .gitignore if not already present
    if ! grep -q ".env" .gitignore 2>/dev/null; then
        echo ".env" >> .gitignore
        print_status "Added .env to .gitignore"
    fi
}

# Install Node.js dependencies
install_dependencies() {
    print_info "Installing Node.js dependencies..."
    npm install
    print_status "Dependencies installed"
}

# Test service connectivity
test_services() {
    print_info "Testing service connectivity..."
    
    # Test Redis
    if docker exec deeds-redis redis-cli ping > /dev/null 2>&1; then
        print_status "Redis is accessible"
    else
        print_warning "Redis connection test failed"
    fi
    
    # Test PostgreSQL
    if docker exec deeds-postgres pg_isready -U postgres > /dev/null 2>&1; then
        print_status "PostgreSQL is accessible"
    else
        print_warning "PostgreSQL connection test failed"
    fi
    
    # Test Neo4j
    if curl -s http://localhost:7474 > /dev/null 2>&1; then
        print_status "Neo4j is accessible"
    else
        print_warning "Neo4j connection test failed"
    fi
    
    # Test MinIO
    if curl -s http://localhost:9000/minio/health/live > /dev/null 2>&1; then
        print_status "MinIO is accessible"
    else
        print_warning "MinIO connection test failed"
    fi
    
    # Test Qdrant
    if curl -s http://localhost:6333/health > /dev/null 2>&1; then
        print_status "Qdrant is accessible"
    else
        print_warning "Qdrant connection test failed"
    fi
    
    # Test Ollama
    if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        print_status "Ollama is accessible"
    else
        print_warning "Ollama connection test failed"
    fi
}

# Main setup function
main() {
    echo "Starting Docker Desktop + QUIC Development Environment Setup"
    echo "============================================================"
    
    check_docker
    check_ports
    create_directories
    setup_env
    install_dependencies
    setup_rag_service
    start_services
    
    # Wait a bit more for services to fully initialize
    print_info "Waiting for services to fully initialize..."
    sleep 15
    
    test_services
    
    echo ""
    echo "🎉 Setup Complete!"
    echo "=================="
    echo ""
    echo "Services are running at:"
    echo "  • Redis: localhost:6379"
    echo "  • PostgreSQL: localhost:5432"
    echo "  • Neo4j: http://localhost:7474 (neo4j/password)"
    echo "  • MinIO: http://localhost:9000 (minioadmin/minioadmin)"
    echo "  • Qdrant: http://localhost:6333"
    echo "  • Ollama: http://localhost:11434"
    echo ""
    echo "To start the development server:"
    echo "  npm run dev:quic:docker"
    echo ""
    echo "To stop all services:"
    echo "  docker-compose -f docker-compose.dev.yml down"
    echo ""
    echo "To view logs:"
    echo "  docker-compose -f docker-compose.dev.yml logs -f"
}

# Run main function
main "$@"
