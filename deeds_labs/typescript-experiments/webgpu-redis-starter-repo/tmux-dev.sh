#!/bin/bash
# tmux development workflow for tensor AI system

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Session name
SESSION_NAME="tensor-ai-dev"

# Function to print colored output
print_status() {
    echo -e "${GREEN}[TMUX]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if tmux is installed
if ! command -v tmux &> /dev/null; then
    print_error "tmux is not installed. Please install tmux first."
    exit 1
fi

# Kill existing session if it exists
if tmux has-session -t $SESSION_NAME 2>/dev/null; then
    print_warning "Session $SESSION_NAME already exists. Killing it..."
    tmux kill-session -t $SESSION_NAME
fi

print_status "Starting $SESSION_NAME development environment..."

# Create new session with first window
tmux new-session -d -s $SESSION_NAME -n "services"

# Window 1: Core Services (split into 4 panes)
print_status "Setting up core services window..."
tmux send-keys -t $SESSION_NAME:0 'echo "=== Redis & Storage ==="' C-m
tmux send-keys -t $SESSION_NAME:0 'cd docker && docker-compose up redis minio postgres' C-m

# Split horizontally
tmux split-window -h -t $SESSION_NAME:0
tmux send-keys -t $SESSION_NAME:0.1 'echo "=== Go Tensor Service ==="' C-m
tmux send-keys -t $SESSION_NAME:0.1 'sleep 10 && cd server/go-microservice && go run main.go' C-m

# Split the left pane vertically
tmux split-window -v -t $SESSION_NAME:0.0
tmux send-keys -t $SESSION_NAME:0.2 'echo "=== FastAPI AI Service ==="' C-m
tmux send-keys -t $SESSION_NAME:0.2 'sleep 15 && cd server/fastapi && python main.py' C-m

# Split the right pane vertically
tmux split-window -v -t $SESSION_NAME:0.1
tmux send-keys -t $SESSION_NAME:0.3 'echo "=== SvelteKit Frontend ==="' C-m
tmux send-keys -t $SESSION_NAME:0.3 'sleep 20 && cd sveltekit-frontend && npm run dev' C-m

# Window 2: Workers (3 panes for different worker types)
print_status "Setting up worker processes window..."
tmux new-window -t $SESSION_NAME:1 -n "workers"

tmux send-keys -t $SESSION_NAME:1 'echo "=== Dataset Generation Worker ==="' C-m
tmux send-keys -t $SESSION_NAME:1 'sleep 25 && cd server/fastapi && python worker.py --type dataset' C-m

tmux split-window -h -t $SESSION_NAME:1
tmux send-keys -t $SESSION_NAME:1.1 'echo "=== Embedding Worker ==="' C-m
tmux send-keys -t $SESSION_NAME:1.1 'sleep 30 && cd server/fastapi && python worker.py --type embedding' C-m

tmux split-window -v -t $SESSION_NAME:1.1
tmux send-keys -t $SESSION_NAME:1.2 'echo "=== Clustering Worker ==="' C-m
tmux send-keys -t $SESSION_NAME:1.2 'sleep 35 && cd server/fastapi && python worker.py --type cluster' C-m

# Window 3: Monitoring & Logs
print_status "Setting up monitoring window..."
tmux new-window -t $SESSION_NAME:2 -n "monitoring"

tmux send-keys -t $SESSION_NAME:2 'echo "=== System Monitoring ==="' C-m
tmux send-keys -t $SESSION_NAME:2 'watch -n 2 "echo \"=== Memory Usage ===\" && free -h && echo && echo \"=== GPU Status ===\" && nvidia-smi --query-gpu=index,name,memory.used,memory.total,utilization.gpu --format=csv"' C-m

tmux split-window -h -t $SESSION_NAME:2
tmux send-keys -t $SESSION_NAME:2.1 'echo "=== Redis Monitor ==="' C-m
tmux send-keys -t $SESSION_NAME:2.1 'sleep 5 && redis-cli -a redis MONITOR' C-m

tmux split-window -v -t $SESSION_NAME:2.1
tmux send-keys -t $SESSION_NAME:2.2 'echo "=== Docker Logs ==="' C-m
tmux send-keys -t $SESSION_NAME:2.2 'sleep 10 && docker-compose -f docker/docker-compose.yml logs -f' C-m

# Window 4: Testing & Dataset Generation
print_status "Setting up testing window..."
tmux new-window -t $SESSION_NAME:3 -n "testing"

tmux send-keys -t $SESSION_NAME:3 'echo "=== Dataset Generation ==="' C-m
tmux send-keys -t $SESSION_NAME:3 'cat << EOF

Dataset Generation Commands:
1. Generate test embeddings:
   python scripts/generate_embeddings.py --count 1000

2. Test tensor caching:
   python scripts/test_tensor_cache.py

3. Benchmark WebGPU:
   python scripts/benchmark_webgpu.py

4. Load test system:
   python scripts/load_test.py --concurrent 10

5. Generate legal datasets:
   python scripts/generate_legal_dataset.py --cases 500

Type any command to start testing...
EOF' C-m

tmux split-window -h -t $SESSION_NAME:3
tmux send-keys -t $SESSION_NAME:3.1 'echo "=== API Testing ==="' C-m
tmux send-keys -t $SESSION_NAME:3.1 'cat << EOF

API Test Commands:
1. Test embedding endpoint:
   curl -X POST http://localhost:8000/embed -H "Content-Type: application/json" -d '"'"'{"text": "test legal document", "tensor_id": "test123"}'"'"'

2. Test tensor storage:
   curl -X GET http://localhost:8080/tensor/test123

3. Test clustering:
   curl -X POST http://localhost:8000/api/cluster -H "Content-Type: application/json" -d '"'"'{"tensor_ids": ["test123"], "k": 3}'"'"'

4. Health check:
   curl http://localhost:8000/health

5. WebGPU test:
   open http://localhost:5173/test-webgpu

Ready for testing...
EOF' C-m

# Window 5: Database & Cache Management
print_status "Setting up database management window..."
tmux new-window -t $SESSION_NAME:4 -n "database"

tmux send-keys -t $SESSION_NAME:4 'echo "=== PostgreSQL Console ==="' C-m
tmux send-keys -t $SESSION_NAME:4 'sleep 5 && PGPASSWORD=postgres psql -h localhost -U postgres -d tensor_db' C-m

tmux split-window -h -t $SESSION_NAME:4
tmux send-keys -t $SESSION_NAME:4.1 'echo "=== Redis CLI ==="' C-m
tmux send-keys -t $SESSION_NAME:4.1 'sleep 8 && redis-cli -a redis' C-m

tmux split-window -v -t $SESSION_NAME:4.1
tmux send-keys -t $SESSION_NAME:4.2 'echo "=== MinIO Console ==="' C-m
tmux send-keys -t $SESSION_NAME:4.2 'cat << EOF

MinIO Console: http://localhost:9001
Username: minioadmin
Password: minioadmin123

MinIO CLI Commands:
1. List buckets:
   mc ls local

2. List tensors:
   mc ls local/tensors

3. Get tensor info:
   mc stat local/tensors/tensor_id

Access web console at the URL above...
EOF' C-m

# Window 6: Development Tools
print_status "Setting up development tools window..."
tmux new-window -t $SESSION_NAME:5 -n "dev-tools"

tmux send-keys -t $SESSION_NAME:5 'echo "=== Build & Compile ==="' C-m
tmux send-keys -t $SESSION_NAME:5 'cat << EOF

Build Commands:
1. Compile Go service:
   cd server/go-microservice && go build -o tensor-service main.go

2. Build Rust WASM:
   cd sveltekit-frontend/src/lib/wasm && wasm-pack build

3. Generate Protobuf:
   cd server/go-microservice && protoc --go_out=. proto/*.proto

4. Type check SvelteKit:
   cd sveltekit-frontend && npm run check

5. Build frontend:
   cd sveltekit-frontend && npm run build

Ready for development...
EOF' C-m

tmux split-window -h -t $SESSION_NAME:5
tmux send-keys -t $SESSION_NAME:5.1 'echo "=== Hot Reload & File Watching ==="' C-m
tmux send-keys -t $SESSION_NAME:5.1 'cat << EOF

File Watcher Commands:
1. Watch Go files:
   cd server/go-microservice && air

2. Watch Python files:
   cd server/fastapi && watchmedo auto-restart --pattern="*.py" -- python main.py

3. Watch SvelteKit (already running in services window)

4. Watch Rust WASM:
   cd sveltekit-frontend/src/lib/wasm && cargo watch -x build

Ready for hot reloading...
EOF' C-m

# Select the first window
tmux select-window -t $SESSION_NAME:0

# Create status display script
cat > /tmp/tensor_status.sh << 'EOF'
#!/bin/bash
clear
echo "🚀 Tensor AI Development Environment Status"
echo "=========================================="
echo ""

# Check services
check_service() {
    if curl -s http://localhost:$1 > /dev/null 2>&1; then
        echo "✅ $2 (port $1)"
    else
        echo "❌ $2 (port $1)"
    fi
}

echo "🔧 Core Services:"
check_service 6379 "Redis"
check_service 9000 "MinIO"
check_service 5432 "PostgreSQL"
check_service 8080 "Go Tensor Service"
check_service 8000 "FastAPI"
check_service 5173 "SvelteKit"

echo ""
echo "📊 Quick Stats:"
if command -v redis-cli &> /dev/null; then
    REDIS_KEYS=$(redis-cli -a redis --raw eval "return #redis.call('keys', '*')" 0 2>/dev/null || echo "N/A")
    echo "Redis keys: $REDIS_KEYS"
fi

if command -v docker &> /dev/null; then
    CONTAINERS=$(docker ps --format "table {{.Names}}\t{{.Status}}" | grep -c "Up" || echo "0")
    echo "Docker containers: $CONTAINERS running"
fi

echo ""
echo "🌐 URLs:"
echo "  Frontend: http://localhost:5173"
echo "  API Docs: http://localhost:8000/docs"
echo "  MinIO Console: http://localhost:9001"
echo ""
echo "⚡ tmux windows:"
echo "  0: services   - Core services (Redis, Go, FastAPI, SvelteKit)"
echo "  1: workers    - Background workers (dataset, embedding, cluster)"
echo "  2: monitoring - System monitoring and logs"
echo "  3: testing    - Testing and dataset generation"
echo "  4: database   - DB consoles (PostgreSQL, Redis, MinIO)"
echo "  5: dev-tools  - Build tools and file watchers"
echo ""
echo "Use 'Ctrl+b' then window number to switch"
echo "Use 'Ctrl+b d' to detach from session"
echo "Use 'tmux attach -t tensor-ai-dev' to reattach"
EOF

chmod +x /tmp/tensor_status.sh

# Show status immediately
/tmp/tensor_status.sh

print_status "Development environment started successfully!"
print_status "Use 'tmux attach -t $SESSION_NAME' to connect"
print_status "Run '/tmp/tensor_status.sh' to check service status"

# Attach to session
tmux attach-session -t $SESSION_NAME