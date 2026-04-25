#!/bin/bash

# Legal AI Platform - GPU Clustering Orchestration (Linux/Mac)
# Phase 74-80 Complete Build Package

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SESSION_NAME="legal-ai-platform"
LOG_DIR="./logs"
METRICS_DIR="./metrics"

# Create directories
mkdir -p "$LOG_DIR" "$METRICS_DIR"

# Function to log messages
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}" | tee -a "$LOG_DIR/orchestration.log"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}" >&2 | tee -a "$LOG_DIR/orchestration.log"
}

warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}" | tee -a "$LOG_DIR/orchestration.log"
}

info() {
    echo -e "${BLUE}[INFO] $1${NC}" | tee -a "$LOG_DIR/orchestration.log"
}

# Function to check if tmux session exists
session_exists() {
    tmux has-session -t "$SESSION_NAME" 2>/dev/null
}

# Function to kill existing session
kill_session() {
    if session_exists; then
        log "Killing existing tmux session: $SESSION_NAME"
        tmux kill-session -t "$SESSION_NAME"
        sleep 2
    fi
}

# Function to start Docker services
start_docker_services() {
    log "Starting Docker services..."
    docker-compose up -d

    # Wait for services to be healthy
    log "Waiting for services to be healthy..."
    sleep 30

    # Check service health
    services=("triton-server" "quic-gateway" "gemma-reranker" "graph-authority" "ocr-pipeline" "postgres" "neo4j" "redis" "qdrant" "minio" "rabbitmq" "frontend")

    for service in "${services[@]}"; do
        info "Checking health of $service..."
        if docker-compose ps "$service" | grep -q "Up"; then
            log "✓ $service is running"
        else
            error "✗ $service failed to start"
            return 1
        fi
    done

    log "All Docker services started successfully"
}

# Function to create tmux windows and panes
create_tmux_layout() {
    log "Creating tmux session: $SESSION_NAME"

    # Create new session with first window
    tmux new-session -d -s "$SESSION_NAME" -n "core-services"

    # Window 1: Core Services (split vertically)
    tmux split-window -h
    tmux split-window -v
    tmux select-pane -t 0
    tmux send-keys "docker-compose logs -f triton-server redis postgres neo4j" C-m
    tmux select-pane -t 1
    tmux send-keys "docker-compose logs -f quic-gateway gemma-reranker graph-authority" C-m
    tmux select-pane -t 2
    tmux send-keys "docker-compose logs -f ocr-pipeline qdrant minio rabbitmq" C-m

    # Window 2: GPU Services
    tmux new-window -n "gpu-services"
    tmux split-window -h
    tmux split-window -v
    tmux select-pane -t 0
    tmux send-keys "watch -n 5 nvidia-smi" C-m
    tmux select-pane -t 1
    tmux send-keys "docker-compose logs -f triton-server" C-m
    tmux select-pane -t 2
    tmux send-keys "docker-compose logs -f gemma-reranker ocr-pipeline" C-m

    # Window 3: App Services
    tmux new-window -n "app-services"
    tmux split-window -h
    tmux split-window -v
    tmux select-pane -t 0
    tmux send-keys "docker-compose logs -f frontend" C-m
    tmux select-pane -t 1
    tmux send-keys "docker-compose logs -f quic-gateway graph-authority" C-m
    tmux select-pane -t 2
    tmux send-keys "tail -f $LOG_DIR/orchestration.log" C-m

    # Window 4: Monitoring
    tmux new-window -n "monitoring"
    tmux split-window -h
    tmux split-window -v
    tmux select-pane -t 0
    tmux send-keys "htop" C-m
    tmux select-pane -t 1
    tmux send-keys "docker stats" C-m
    tmux select-pane -t 2
    tmux send-keys "watch -n 10 'curl -s http://localhost:8000/v2/health/ready && echo \"Triton: OK\" || echo \"Triton: FAIL\"'" C-m

    # Window 5: Ingestion Pipeline
    tmux new-window -n "ingestion"
    tmux split-window -h
    tmux split-window -v
    tmux select-pane -t 0
    tmux send-keys "docker-compose logs -f rabbitmq" C-m
    tmux select-pane -t 1
    tmux send-keys "watch -n 5 'curl -s http://localhost:15672/api/queues | jq \".[].messages\"'" C-m
    tmux select-pane -t 2
    tmux send-keys "tail -f /dev/null" C-m  # Placeholder for ingestion logs

    # Window 6: Development
    tmux new-window -n "development"
    tmux split-window -h
    tmux select-pane -t 0
    tmux send-keys "npm run dev --prefix svelte_ui" C-m
    tmux select-pane -t 1
    tmux send-keys "tail -f $LOG_DIR/orchestration.log" C-m

    # Set default window
    tmux select-window -t 0

    log "Tmux session created successfully"
}

# Function to collect GPU metrics
collect_gpu_metrics() {
    log "Starting GPU metrics collection..."

    # Create metrics collection script
    cat > "$METRICS_DIR/collect_metrics.sh" << 'EOF'
#!/bin/bash
METRICS_FILE="./gpu_metrics_$(date +%Y%m%d_%H%M%S).csv"
echo "timestamp,gpu_util,memory_used,memory_total,temperature,power_draw" > "$METRICS_FILE"

while true; do
    TIMESTAMP=$(date +%s)
    GPU_INFO=$(nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw --format=csv,noheader,nounits | head -1)
    echo "$TIMESTAMP,$GPU_INFO" >> "$METRICS_FILE"
    sleep 5
done
EOF

    chmod +x "$METRICS_DIR/collect_metrics.sh"

    # Start metrics collection in background
    nohup "$METRICS_DIR/collect_metrics.sh" > "$LOG_DIR/metrics.log" 2>&1 &
    echo $! > "$METRICS_DIR/collector.pid"

    log "GPU metrics collection started (PID: $(cat $METRICS_DIR/collector.pid))"
}

# Function to start all services
start_all() {
    log "🚀 Starting Legal AI Platform - Phase 74-80"

    # Kill existing session if it exists
    kill_session

    # Start Docker services
    if ! start_docker_services; then
        error "Failed to start Docker services"
        exit 1
    fi

    # Create tmux layout
    create_tmux_layout

    # Start GPU metrics collection
    collect_gpu_metrics

    log "✅ Legal AI Platform started successfully!"
    log "📊 Access monitoring dashboard: tmux attach -t $SESSION_NAME"
    log "🌐 Frontend: http://localhost:3000"
    log "🔍 Triton Models: http://localhost:8000"
    log "⚡ QUIC Gateway: localhost:4242/udp"
    log "📈 MinIO Console: http://localhost:9001"
    log "🐰 RabbitMQ: http://localhost:15672"
}

# Function to stop all services
stop_all() {
    log "🛑 Stopping Legal AI Platform"

    # Stop metrics collection
    if [ -f "$METRICS_DIR/collector.pid" ]; then
        kill "$(cat $METRICS_DIR/collector.pid)" 2>/dev/null || true
        rm -f "$METRICS_DIR/collector.pid"
        log "Stopped GPU metrics collection"
    fi

    # Kill tmux session
    kill_session

    # Stop Docker services
    log "Stopping Docker services..."
    docker-compose down

    log "✅ Legal AI Platform stopped successfully"
}

# Function to show status
show_status() {
    echo -e "${CYAN}=== Legal AI Platform Status ===${NC}"
    echo

    # Check tmux session
    if session_exists; then
        echo -e "${GREEN}✓ Tmux session: $SESSION_NAME (running)${NC}"
        tmux list-windows -t "$SESSION_NAME" 2>/dev/null || true
    else
        echo -e "${RED}✗ Tmux session: $SESSION_NAME (not running)${NC}"
    fi
    echo

    # Check Docker services
    echo -e "${CYAN}Docker Services:${NC}"
    if command -v docker-compose &> /dev/null; then
        docker-compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
    else
        echo "docker-compose not found"
    fi
    echo

    # Check GPU metrics
    if [ -f "$METRICS_DIR/collector.pid" ] && kill -0 "$(cat $METRICS_DIR/collector.pid)" 2>/dev/null; then
        echo -e "${GREEN}✓ GPU metrics collection: running${NC}"
    else
        echo -e "${RED}✗ GPU metrics collection: not running${NC}"
    fi
    echo

    # Show recent logs
    echo -e "${CYAN}Recent Logs:${NC}"
    if [ -f "$LOG_DIR/orchestration.log" ]; then
        tail -5 "$LOG_DIR/orchestration.log"
    else
        echo "No logs available"
    fi
}

# Function to show help
show_help() {
    echo "Legal AI Platform - GPU Clustering Orchestration"
    echo "Phase 74-80 Complete Build Package"
    echo
    echo "Usage: $0 [command]"
    echo
    echo "Commands:"
    echo "  start     Start all services and create tmux session"
    echo "  stop      Stop all services and cleanup"
    echo "  status    Show current status of all components"
    echo "  restart   Restart all services"
    echo "  logs      Show orchestration logs"
    echo "  attach    Attach to tmux session"
    echo "  help      Show this help message"
    echo
    echo "Examples:"
    echo "  $0 start          # Start the platform"
    echo "  $0 attach         # Monitor services in tmux"
    echo "  $0 status         # Check platform status"
    echo "  $0 stop           # Stop everything"
}

# Main script logic
case "${1:-help}" in
    start)
        start_all
        ;;
    stop)
        stop_all
        ;;
    status)
        show_status
        ;;
    restart)
        stop_all
        sleep 5
        start_all
        ;;
    logs)
        if [ -f "$LOG_DIR/orchestration.log" ]; then
            tail -f "$LOG_DIR/orchestration.log"
        else
            echo "No orchestration logs found"
        fi
        ;;
    attach)
        if session_exists; then
            tmux attach -t "$SESSION_NAME"
        else
            error "Tmux session '$SESSION_NAME' does not exist. Run '$0 start' first."
            exit 1
        fi
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        error "Unknown command: $1"
        echo
        show_help
        exit 1
        ;;
esac