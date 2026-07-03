#!/bin/bash
# Launch Phase 7 workers in parallel

set -e

WORKER_COUNT=${1:-4}
LLM_CONCURRENCY=${LLM_CONCURRENCY:-2}
WORK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../sveltekit-frontend" && pwd)"

cd "$WORK_DIR"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  Phase 7: Multi-Worker Launcher                               ║"
echo "║  Workers: $WORKER_COUNT | LLM Concurrency: $LLM_CONCURRENCY                          ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Kill any existing workers
pkill -f "phase7-gemma4-worker" 2>/dev/null || true
sleep 1

# Start workers
for i in $(seq 1 $WORKER_COUNT); do
  LOG_FILE="/tmp/phase7-worker-$i.log"
  echo "🚀 Starting worker $i (logging to $LOG_FILE)..."

  cross-env LLM_CONCURRENCY=$LLM_CONCURRENCY npx tsx scripts/atlas/phase7-gemma4-worker-patched.mts \
    > "$LOG_FILE" 2>&1 &

  sleep 2
done

echo ""
echo "✅ All $WORKER_COUNT workers launched"
echo ""
echo "To monitor:"
echo "  tail -f /tmp/phase7-worker-1.log"
echo ""
echo "To stop all workers:"
echo "  pkill -f 'phase7-gemma4-worker'"
echo ""
echo "Note: Each worker has LLM_CONCURRENCY=$LLM_CONCURRENCY (shared limit with other workers)"
echo "      Total potential throughput: ~${LLM_CONCURRENCY} active requests at a time"

wait
