#!/bin/bash

# SvelteKit 2 Cluster Shutdown Script
# Graceful shutdown with cleanup

set -e

# Configuration
PID_FILE="${PID_FILE:-./cluster.pid}"
LOG_DIR="${LOG_DIR:-./logs}"
GRACEFUL_TIMEOUT="${GRACEFUL_TIMEOUT:-30}"

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

# Stop cluster gracefully
stop_cluster() {
    if [[ ! -f "$PID_FILE" ]]; then
        log "${YELLOW}No PID file found, cluster may not be running${NC}"
        return 0
    fi
    
    PID=$(cat "$PID_FILE")
    
    if ! kill -0 "$PID" 2>/dev/null; then
        log "${YELLOW}Process $PID is not running, cleaning up PID file${NC}"
        rm -f "$PID_FILE"
        return 0
    fi
    
    log "${BLUE}Stopping cluster (PID: $PID)...${NC}"
    
    # Send SIGTERM for graceful shutdown
    kill -TERM "$PID"
    
    # Wait for graceful shutdown
    log "Waiting for graceful shutdown (timeout: ${GRACEFUL_TIMEOUT}s)..."
    local wait_count=0
    while kill -0 "$PID" 2>/dev/null && [[ $wait_count -lt $GRACEFUL_TIMEOUT ]]; do
        sleep 1
        wait_count=$((wait_count + 1))
        
        # Show progress every 5 seconds
        if [[ $((wait_count % 5)) -eq 0 ]]; then
            log "Still waiting... (${wait_count}s/${GRACEFUL_TIMEOUT}s)"
        fi
    done
    
    # Check if process is still running
    if kill -0 "$PID" 2>/dev/null; then
        log "${YELLOW}Graceful shutdown timeout, force killing...${NC}"
        kill -KILL "$PID"
        
        # Wait a bit more for cleanup
        sleep 2
        
        if kill -0 "$PID" 2>/dev/null; then
            log "${RED}Error: Failed to kill process $PID${NC}"
            return 1
        fi
    fi
    
    # Clean up PID file
    rm -f "$PID_FILE"
    
    log "${GREEN}✓ Cluster stopped successfully${NC}"
    return 0
}

# Clean up temporary files and logs (optional)
cleanup() {
    local clean_logs=$1
    
    log "${BLUE}Cleaning up...${NC}"
    
    # Clean temporary files
    if [[ -d "./tmp" ]]; then
        rm -rf "./tmp"
        log "Removed temporary files"
    fi
    
    # Optionally clean logs
    if [[ "$clean_logs" == "true" && -d "$LOG_DIR" ]]; then
        rm -rf "$LOG_DIR"
        log "Removed log files"
    fi
    
    # Clean any socket files
    find . -name "*.sock" -type f -delete 2>/dev/null || true
    
    log "${GREEN}✓ Cleanup completed${NC}"
}

# Show cluster status before stopping
show_pre_stop_status() {
    log "${BLUE}Current cluster status:${NC}"
    
    if [[ -f "$PID_FILE" ]]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            # Try to get worker count
            if command -v jq >/dev/null 2>&1; then
                STATUS=$(curl -s "http://localhost:3000/api/admin/cluster/status" 2>/dev/null)
                if [[ -n "$STATUS" ]]; then
                    WORKERS=$(echo "$STATUS" | jq -r '.health.totalWorkers // "unknown"')
                    HEALTHY=$(echo "$STATUS" | jq -r '.health.healthyWorkers // "unknown"')
                    REQUESTS=$(echo "$STATUS" | jq -r '.health.totalRequests // "unknown"')
                    
                    log "  • PID: $PID"
                    log "  • Workers: $HEALTHY/$WORKERS"
                    log "  • Requests processed: $REQUESTS"
                else
                    log "  • PID: $PID (status API unavailable)"
                fi
            else
                log "  • PID: $PID"
            fi
        else
            log "  • Process not running"
        fi
    else
        log "  • No PID file found"
    fi
}

# Check for active connections before stopping
check_active_connections() {
    local port="${PORT:-3000}"
    
    if command -v netstat >/dev/null 2>&1; then
        local connections=$(netstat -an | grep ":$port" | grep ESTABLISHED | wc -l)
        if [[ $connections -gt 0 ]]; then
            log "${YELLOW}Warning: $connections active connections on port $port${NC}"
            log "Shutting down anyway, connections will be terminated"
        fi
    elif command -v ss >/dev/null 2>&1; then
        local connections=$(ss -an | grep ":$port" | grep ESTAB | wc -l)
        if [[ $connections -gt 0 ]]; then
            log "${YELLOW}Warning: $connections active connections on port $port${NC}"
            log "Shutting down anyway, connections will be terminated"
        fi
    fi
}

# Force stop (immediate kill)
force_stop() {
    if [[ ! -f "$PID_FILE" ]]; then
        log "${YELLOW}No PID file found${NC}"
        return 0
    fi
    
    PID=$(cat "$PID_FILE")
    
    if ! kill -0 "$PID" 2>/dev/null; then
        log "${YELLOW}Process $PID is not running${NC}"
        rm -f "$PID_FILE"
        return 0
    fi
    
    log "${RED}Force stopping cluster (PID: $PID)...${NC}"
    kill -KILL "$PID"
    rm -f "$PID_FILE"
    
    log "${GREEN}✓ Cluster force stopped${NC}"
}

# Main execution
main() {
    local command="${1:-stop}"
    local clean_logs="${2:-false}"
    
    case "$command" in
        stop)
            log "${BLUE}🛑 Stopping SvelteKit Cluster${NC}"
            show_pre_stop_status
            check_active_connections
            
            if stop_cluster; then
                log "${GREEN}🎉 Cluster stopped successfully${NC}"
            else
                log "${RED}❌ Failed to stop cluster gracefully${NC}"
                exit 1
            fi
            ;;
            
        force)
            log "${RED}🔥 Force stopping SvelteKit Cluster${NC}"
            force_stop
            ;;
            
        clean)
            log "${BLUE}🧹 Cleaning up SvelteKit Cluster${NC}"
            stop_cluster
            cleanup "$clean_logs"
            ;;
            
        status)
            show_pre_stop_status
            ;;
            
        *)
            echo "Usage: $0 {stop|force|clean|status}"
            echo "  stop   - Graceful shutdown (default)"
            echo "  force  - Force kill cluster immediately"
            echo "  clean  - Stop cluster and clean up files"
            echo "  status - Show current status"
            echo ""
            echo "Environment variables:"
            echo "  PID_FILE         - Path to PID file (default: ./cluster.pid)"
            echo "  GRACEFUL_TIMEOUT - Shutdown timeout in seconds (default: 30)"
            echo "  LOG_DIR          - Log directory (default: ./logs)"
            exit 1
            ;;
    esac
}

# Handle Ctrl+C gracefully
trap 'log "${YELLOW}Interrupted${NC}"; exit 1' INT

main "$@"