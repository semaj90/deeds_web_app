#!/bin/bash

# SvelteKit 2 Cluster Startup Script
# Production deployment with monitoring and health checks

set -e

# Configuration
CLUSTER_CONFIG="${CLUSTER_CONFIG_PATH:-./cluster.config.json}"
LOG_DIR="${LOG_DIR:-./logs}"
PID_FILE="${PID_FILE:-./cluster.pid}"
MAX_RETRIES="${MAX_RETRIES:-3}"
HEALTH_CHECK_URL="${HEALTH_CHECK_URL:-http://localhost:3000/health}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Create necessary directories
setup_directories() {
    log "${BLUE}Setting up directories...${NC}"
    mkdir -p "$LOG_DIR"
    mkdir -p "./tmp"
}

# Check prerequisites
check_prerequisites() {
    log "${BLUE}Checking prerequisites...${NC}"
    
    # Check Node.js version
    NODE_VERSION=$(node --version | cut -d'v' -f2)
    REQUIRED_VERSION="18.0.0"
    
    if ! node -e "process.exit(require('semver').gte('$NODE_VERSION', '$REQUIRED_VERSION') ? 0 : 1)" 2>/dev/null; then
        log "${RED}Error: Node.js version $REQUIRED_VERSION or higher required (found: $NODE_VERSION)${NC}"
        exit 1
    fi
    
    # Check if cluster config exists
    if [[ ! -f "$CLUSTER_CONFIG" ]]; then
        log "${YELLOW}Warning: Cluster config not found at $CLUSTER_CONFIG, using defaults${NC}"
    fi
    
    # Check if build exists
    if [[ ! -d "./build" ]]; then
        log "${RED}Error: SvelteKit build not found. Run 'npm run build' first.${NC}"
        exit 1
    fi
    
    log "${GREEN}Prerequisites check passed${NC}"
}

# Check if cluster is already running
check_running() {
    if [[ -f "$PID_FILE" ]]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            log "${YELLOW}Cluster is already running (PID: $PID)${NC}"
            log "Use 'npm run cluster:stop' to stop the cluster first"
            exit 1
        else
            log "${YELLOW}Removing stale PID file${NC}"
            rm -f "$PID_FILE"
        fi
    fi
}

# Start cluster with monitoring
start_cluster() {
    log "${BLUE}Starting SvelteKit cluster...${NC}"
    
    # Set environment variables
    export NODE_ENV="${NODE_ENV:-production}"
    export CLUSTER_CONFIG_PATH="$CLUSTER_CONFIG"
    export LOG_LEVEL="${LOG_LEVEL:-info}"
    
    # Start cluster in background
    nohup node cluster.js > "$LOG_DIR/cluster.log" 2>&1 &
    CLUSTER_PID=$!
    
    # Save PID
    echo "$CLUSTER_PID" > "$PID_FILE"
    
    log "${GREEN}Cluster started with PID: $CLUSTER_PID${NC}"
    log "Logs: $LOG_DIR/cluster.log"
    log "Config: $CLUSTER_CONFIG"
}

# Wait for cluster to be healthy
wait_for_health() {
    log "${BLUE}Waiting for cluster to be healthy...${NC}"
    
    local retry_count=0
    local max_wait=60  # seconds
    local wait_interval=2
    
    while [[ $retry_count -lt $((max_wait / wait_interval)) ]]; do
        if curl -sf "$HEALTH_CHECK_URL" >/dev/null 2>&1; then
            log "${GREEN}Cluster is healthy and ready!${NC}"
            return 0
        fi
        
        retry_count=$((retry_count + 1))
        log "Health check attempt $retry_count/$((max_wait / wait_interval))..."
        sleep $wait_interval
    done
    
    log "${RED}Error: Cluster failed to become healthy within ${max_wait}s${NC}"
    
    # Show recent logs for debugging
    log "${YELLOW}Recent logs:${NC}"
    tail -20 "$LOG_DIR/cluster.log" 2>/dev/null || true
    
    return 1
}

# Show cluster status
show_status() {
    log "${BLUE}Cluster Status:${NC}"
    
    if [[ -f "$PID_FILE" ]]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            log "${GREEN}✓ Cluster is running (PID: $PID)${NC}"
            
            # Get cluster health info
            if curl -sf "$HEALTH_CHECK_URL" >/dev/null 2>&1; then
                log "${GREEN}✓ Health check passed${NC}"
                
                # Try to get detailed status
                if command -v jq >/dev/null 2>&1; then
                    STATUS=$(curl -s "http://localhost:3000/api/admin/cluster/status" 2>/dev/null)
                    if [[ -n "$STATUS" ]]; then
                        HEALTHY_WORKERS=$(echo "$STATUS" | jq -r '.health.healthyWorkers // "N/A"')
                        TOTAL_WORKERS=$(echo "$STATUS" | jq -r '.health.totalWorkers // "N/A"')
                        TOTAL_REQUESTS=$(echo "$STATUS" | jq -r '.health.totalRequests // "N/A"')
                        
                        log "  Workers: $HEALTHY_WORKERS/$TOTAL_WORKERS healthy"
                        log "  Requests handled: $TOTAL_REQUESTS"
                    fi
                fi
            else
                log "${YELLOW}⚠ Health check failed${NC}"
            fi
        else
            log "${RED}✗ Cluster is not running${NC}"
            rm -f "$PID_FILE"
        fi
    else
        log "${RED}✗ No PID file found${NC}"
    fi
}

# Setup signal handlers for graceful shutdown
setup_signal_handlers() {
    trap 'handle_signal SIGTERM' TERM
    trap 'handle_signal SIGINT' INT
    trap 'handle_signal SIGHUP' HUP
}

handle_signal() {
    local signal=$1
    log "${YELLOW}Received $signal, initiating graceful shutdown...${NC}"
    
    if [[ -f "$PID_FILE" ]]; then
        PID=$(cat "$PID_FILE")
        kill -TERM "$PID" 2>/dev/null || true
        
        # Wait for graceful shutdown
        local wait_count=0
        while kill -0 "$PID" 2>/dev/null && [[ $wait_count -lt 30 ]]; do
            sleep 1
            wait_count=$((wait_count + 1))
        done
        
        # Force kill if still running
        if kill -0 "$PID" 2>/dev/null; then
            log "${YELLOW}Force killing cluster...${NC}"
            kill -KILL "$PID" 2>/dev/null || true
        fi
        
        rm -f "$PID_FILE"
        log "${GREEN}Cluster stopped${NC}"
    fi
    
    exit 0
}

# Main execution
main() {
    log "${BLUE}🚀 SvelteKit Cluster Startup${NC}"
    log "Configuration: $CLUSTER_CONFIG"
    
    setup_directories
    check_prerequisites
    check_running
    
    start_cluster
    
    if wait_for_health; then
        show_status
        log "${GREEN}🎉 Cluster successfully started and healthy!${NC}"
        log ""
        log "Management URLs:"
        log "  • Health Check: $HEALTH_CHECK_URL"
        log "  • Admin Panel: http://localhost:3000/admin/cluster"
        log "  • API Status: http://localhost:3000/api/admin/cluster/status"
        log ""
        log "Cluster Management:"
        log "  • Scale up: kill -USR1 $CLUSTER_PID"
        log "  • Scale down: kill -USR2 $CLUSTER_PID"
        log "  • Rolling restart: kill -HUP $CLUSTER_PID"
        log "  • Stop cluster: kill -TERM $CLUSTER_PID"
        log ""
        log "Use 'npm run cluster:stop' or 'npm run cluster:status' for management"
    else
        log "${RED}❌ Cluster startup failed${NC}"
        
        # Cleanup on failure
        if [[ -f "$PID_FILE" ]]; then
            PID=$(cat "$PID_FILE")
            kill -TERM "$PID" 2>/dev/null || true
            rm -f "$PID_FILE"
        fi
        
        exit 1
    fi
}

# Handle command line arguments
case "${1:-start}" in
    start)
        main
        ;;
    status)
        show_status
        ;;
    health)
        if curl -sf "$HEALTH_CHECK_URL" >/dev/null 2>&1; then
            log "${GREEN}✓ Cluster is healthy${NC}"
            exit 0
        else
            log "${RED}✗ Cluster is not healthy${NC}"
            exit 1
        fi
        ;;
    *)
        echo "Usage: $0 {start|status|health}"
        echo "  start  - Start the cluster (default)"
        echo "  status - Show cluster status"
        echo "  health - Check cluster health"
        exit 1
        ;;
esac