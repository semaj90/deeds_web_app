#!/bin/bash
set -e

echo "🚀 Migrating Legal AI Platform to Docker..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker Desktop."
    exit 1
fi

print_status "Docker is running ✓"

# Stop existing containers if they exist
print_status "Stopping any existing Legal AI containers..."
docker-compose down -v 2>/dev/null || true

# Export current database (backup)
print_status "Creating backup of current database..."
PGPASSWORD=123456 pg_dump -h localhost -p 5432 -U legal_admin -d legal_ai_db > backup-$(date +%Y%m%d-%H%M%S).sql
print_success "Database backup created"

# Start Docker services
print_status "Starting Docker services..."
docker-compose up -d

# Wait for PostgreSQL to be ready
print_status "Waiting for PostgreSQL to be ready..."
timeout=60
counter=0
while ! docker-compose exec postgres pg_isready -U legal_admin -d legal_ai_db > /dev/null 2>&1; do
    if [ $counter -eq $timeout ]; then
        print_error "PostgreSQL failed to start within $timeout seconds"
        docker-compose logs postgres
        exit 1
    fi
    sleep 2
    counter=$((counter + 2))
    echo -n "."
done

print_success "PostgreSQL is ready"

# Test vector extension
print_status "Testing pgvector extension..."
docker-compose exec postgres psql -U legal_admin -d legal_ai_db -c "SELECT extname FROM pg_extension WHERE extname = 'vector';"

# Verify all services
print_status "Verifying service health..."

# PostgreSQL
if docker-compose exec postgres pg_isready -U legal_admin -d legal_ai_db > /dev/null 2>&1; then
    print_success "PostgreSQL: Healthy"
else
    print_error "PostgreSQL: Not responding"
fi

# MinIO
if curl -s http://localhost:9000/minio/health/live > /dev/null 2>&1; then
    print_success "MinIO: Healthy"
else
    print_warning "MinIO: Not responding (may still be starting)"
fi

# Redis
if docker-compose exec redis redis-cli ping > /dev/null 2>&1; then
    print_success "Redis: Healthy"
else
    print_error "Redis: Not responding"
fi

# Qdrant
if curl -s http://localhost:6333/health > /dev/null 2>&1; then
    print_success "Qdrant: Healthy"
else
    print_warning "Qdrant: Not responding (optional service)"
fi

print_status "Docker migration complete! Services are now running on:"
echo "  PostgreSQL: localhost:5433 (legal_admin/123456)"
echo "  MinIO: http://localhost:9000 (minio/minio123)"
echo "  MinIO Console: http://localhost:9001"
echo "  Redis: localhost:6379"
echo "  Qdrant: http://localhost:6333"

print_warning "Update your application to use port 5433 for PostgreSQL"
print_success "Migration completed successfully! 🎉"