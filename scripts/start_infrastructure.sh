#!/bin/bash

# Start Infrastructure Services with Docker (bare docker run, not compose)
#
# This script starts all infrastructure services individually:
# - Postgres 17 + pgvector
# - Redis
# - RabbitMQ
# - Qdrant
# - Ollama (optional, on host)
#
# Usage:
#   ./scripts/start_infrastructure.sh
#   ./scripts/start_infrastructure.sh --stop
#   ./scripts/start_infrastructure.sh --status

set -e

# Configuration
POSTGRES_CONTAINER="postgres-pgvector"
REDIS_CONTAINER="legal-ai-valkey"
RABBITMQ_CONTAINER="rabbitmq-legal"
QDRANT_CONTAINER="legal-ai-qdrant"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
ACTION="${1:-start}"

# ============================================================================
# Helper Functions
# ============================================================================

log_info() {
    echo -e "${GREEN}✅${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}⚠️${NC} $1"
}

log_error() {
    echo -e "${RED}❌${NC} $1"
}

log_section() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

container_exists() {
    docker ps -a --format '{{.Names}}' | grep -q "^${1}$"
}

container_running() {
    docker ps --format '{{.Names}}' | grep -q "^${1}$"
}

# ============================================================================
# Start Actions
# ============================================================================

start_postgres() {
    log_section "Starting Postgres 17 + pgvector"

    if container_running "$POSTGRES_CONTAINER"; then
        log_warn "Postgres is already running"
        return
    fi

    if container_exists "$POSTGRES_CONTAINER"; then
        log_info "Removing stopped Postgres container..."
        docker rm "$POSTGRES_CONTAINER"
    fi

    log_info "Starting Postgres 17..."
    docker run -d \
        --name "$POSTGRES_CONTAINER" \
        -e POSTGRES_DB=legal_ai_db \
        -e POSTGRES_USER=legal_admin \
        -e POSTGRES_PASSWORD=123456 \
        -e POSTGRES_HOST_AUTH_METHOD=md5 \
        -p 5432:5432 \
        -v postgres_data:/var/lib/postgresql/data \
        postgres:17

    # Wait for Postgres to be ready
    log_info "Waiting for Postgres to be ready..."
    sleep 3
    for i in {1..30}; do
        if docker exec "$POSTGRES_CONTAINER" pg_isready -U legal_admin -d legal_ai_db > /dev/null 2>&1; then
            log_info "Postgres is ready"
            break
        fi
        if [ $i -eq 30 ]; then
            log_error "Postgres failed to start"
            exit 1
        fi
        sleep 1
    done

    # Install pgvector extension
    log_info "Installing pgvector extension..."
    docker exec -i "$POSTGRES_CONTAINER" psql -U legal_admin -d legal_ai_db -c "CREATE EXTENSION IF NOT EXISTS vector;"
    log_info "pgvector extension installed"
}

start_redis() {
    log_section "Starting Redis"

    if container_running "$REDIS_CONTAINER"; then
        log_warn "Redis is already running"
        return
    fi

    if container_exists "$REDIS_CONTAINER"; then
        log_info "Removing stopped Redis container..."
        docker rm "$REDIS_CONTAINER"
    fi

    log_info "Starting Redis..."
    docker run -d \
        --name "$REDIS_CONTAINER" \
        -p 6379:6379 \
        -p 8001:8001 \
        -v redis_data:/data \
        redis/redis-stack:latest \
        redis-server \
        --appendonly yes \
        --port 6379 \
        --protected-mode no \
        --bind 0.0.0.0 \
        --maxmemory 2gb \
        --maxmemory-policy allkeys-lru \
        --save 900 1 \
        --save 300 10 \
        --save 60 10000

    # Wait for Redis to be ready
    log_info "Waiting for Redis to be ready..."
    sleep 2
    for i in {1..30}; do
        if docker exec "$REDIS_CONTAINER" redis-cli ping > /dev/null 2>&1; then
            log_info "Redis is ready"
            break
        fi
        if [ $i -eq 30 ]; then
            log_error "Redis failed to start"
            exit 1
        fi
        sleep 1
    done
}

start_rabbitmq() {
    log_section "Starting RabbitMQ"

    if container_running "$RABBITMQ_CONTAINER"; then
        log_warn "RabbitMQ is already running"
        return
    fi

    if container_exists "$RABBITMQ_CONTAINER"; then
        log_info "Removing stopped RabbitMQ container..."
        docker rm "$RABBITMQ_CONTAINER"
    fi

    log_info "Starting RabbitMQ..."
    docker run -d \
        --name "$RABBITMQ_CONTAINER" \
        -e RABBITMQ_DEFAULT_USER=legalai \
        -e RABBITMQ_DEFAULT_PASS=legalai123 \
        -e RABBITMQ_DEFAULT_VHOST=/legalai \
        -p 5672:5672 \
        -p 15672:15672 \
        -v rabbitmq_data:/var/lib/rabbitmq \
        rabbitmq:3-management-alpine

    # Wait for RabbitMQ to be ready
    log_info "Waiting for RabbitMQ to be ready..."
    sleep 3
    for i in {1..30}; do
        if curl -s http://localhost:15672/api/overview > /dev/null 2>&1; then
            log_info "RabbitMQ is ready"
            break
        fi
        if [ $i -eq 30 ]; then
            log_error "RabbitMQ failed to start"
            exit 1
        fi
        sleep 1
    done

    # Bootstrap RabbitMQ (create vhost and user)
    log_info "Bootstrapping RabbitMQ..."
    docker exec "$RABBITMQ_CONTAINER" rabbitmqctl add_vhost /legalai || true
    docker exec "$RABBITMQ_CONTAINER" rabbitmqctl add_user legalai legalai123 || true
    docker exec "$RABBITMQ_CONTAINER" rabbitmqctl set_permissions -p /legalai legalai ".*" ".*" ".*"
    log_info "RabbitMQ bootstrap complete"
}

start_qdrant() {
    log_section "Starting Qdrant"

    if container_running "$QDRANT_CONTAINER"; then
        log_warn "Qdrant is already running"
        return
    fi

    if container_exists "$QDRANT_CONTAINER"; then
        log_info "Removing stopped Qdrant container..."
        docker rm "$QDRANT_CONTAINER"
    fi

    log_info "Starting Qdrant..."
    docker run -d \
        --name "$QDRANT_CONTAINER" \
        -p 6333:6333 \
        -p 6334:6334 \
        -v qdrant_data:/qdrant/storage \
        -e QDRANT__SERVICE__HTTP_PORT=6333 \
        -e QDRANT__SERVICE__GRPC_PORT=6334 \
        qdrant/qdrant:latest

    # Wait for Qdrant to be ready
    log_info "Waiting for Qdrant to be ready..."
    sleep 2
    for i in {1..30}; do
        if curl -s http://localhost:6333/collections > /dev/null 2>&1; then
            log_info "Qdrant is ready"
            break
        fi
        if [ $i -eq 30 ]; then
            log_error "Qdrant failed to start"
            exit 1
        fi
        sleep 1
    done
}

# ============================================================================
# Stop Actions
# ============================================================================

stop_all() {
    log_section "Stopping All Infrastructure Services"

    for container in "$POSTGRES_CONTAINER" "$REDIS_CONTAINER" "$RABBITMQ_CONTAINER" "$QDRANT_CONTAINER"; do
        if container_running "$container"; then
            log_info "Stopping $container..."
            docker stop "$container"
        fi
    done

    log_info "All services stopped"
}

# ============================================================================
# Status Actions
# ============================================================================

status_all() {
    log_section "Infrastructure Services Status"

    echo ""
    for container in "$POSTGRES_CONTAINER" "$REDIS_CONTAINER" "$RABBITMQ_CONTAINER" "$QDRANT_CONTAINER"; do
        if container_running "$container"; then
            echo -e "${GREEN}✅${NC} $container (running)"
        elif container_exists "$container"; then
            echo -e "${YELLOW}⏸️${NC} $container (stopped)"
        else
            echo -e "${RED}❌${NC} $container (not found)"
        fi
    done

    echo ""
    log_section "Service Endpoints"
    echo ""
    echo "Postgres:  postgresql://legal_admin:123456@localhost:5432/legal_ai_db"
    echo "Redis:     redis://localhost:6379"
    echo "RabbitMQ:  amqp://legalai:legalai123@localhost:5672/legalai"
    echo "RabbitMQ UI: http://localhost:15672 (guest/guest)"
    echo "Qdrant:    http://localhost:6333"
    echo ""
}

# ============================================================================
# Main
# ============================================================================

case "$ACTION" in
    start)
        echo ""
        echo -e "${BLUE}🚀 Starting Infrastructure Services${NC}"
        echo ""

        start_postgres
        start_redis
        start_rabbitmq
        start_qdrant

        echo ""
        log_section "✅ All Services Started"
        echo ""
        echo "Next steps:"
        echo "  1. Start Python workers:"
        echo "     ./scripts/start_workers.sh"
        echo ""
        echo "  2. Monitor services:"
        echo "     docker ps"
        echo ""
        echo "  3. View logs:"
        echo "     docker logs -f $POSTGRES_CONTAINER"
        echo "     docker logs -f $REDIS_CONTAINER"
        echo "     docker logs -f $RABBITMQ_CONTAINER"
        echo "     docker logs -f $QDRANT_CONTAINER"
        echo ""
        ;;

    stop)
        stop_all
        ;;

    status)
        status_all
        ;;

    restart)
        log_section "Restarting Infrastructure Services"
        stop_all
        sleep 2
        "$0" start
        ;;

    *)
        echo "Usage: $0 {start|stop|status|restart}"
        echo ""
        echo "Actions:"
        echo "  start              Start all infrastructure services"
        echo "  stop               Stop all infrastructure services"
        echo "  status             Show service status"
        echo "  restart            Restart all services"
        echo ""
        exit 1
        ;;
esac
