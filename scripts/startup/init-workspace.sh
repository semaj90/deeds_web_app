#!/bin/bash
# Workspace initialization script for VS Code startup
# Runs once on folder open to validate environment and prepare services

set -e

WORKSPACE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SVELTEKIT_DIR="$WORKSPACE_ROOT/sveltekit-frontend"
LOG_DIR="$WORKSPACE_ROOT/logs"

# Create logs directory
mkdir -p "$LOG_DIR"

echo "🔧 [$(date '+%Y-%m-%d %H:%M:%S')] Workspace initialization starting..."

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "❌ Node.js not found. Please install Node.js 20+"
  exit 1
fi
echo "✅ Node.js: $(node --version)"

# Check npm
if ! command -v npm &> /dev/null; then
  echo "❌ npm not found. Please install npm"
  exit 1
fi
echo "✅ npm: $(npm --version)"

# Check Docker
if ! command -v docker &> /dev/null; then
  echo "⚠️  Docker not found. Some services will not start automatically."
else
  echo "✅ Docker: $(docker --version)"
fi

# Check git
if ! command -v git &> /dev/null; then
  echo "❌ git not found. Please install git"
  exit 1
fi
echo "✅ git: $(git --version | head -n1)"

# Install dependencies if needed
echo ""
echo "📦 Checking dependencies in sveltekit-frontend..."
cd "$SVELTEKIT_DIR"
if [ ! -d "node_modules" ] || [ ! -f "node_modules/.package-lock.json" ]; then
  echo "   Installing npm packages..."
  npm install --legacy-peer-deps 2>&1 | tail -5
else
  echo "   ✅ Dependencies already installed"
fi

# Verify tsconfig
if [ ! -f "$SVELTEKIT_DIR/tsconfig.json" ]; then
  echo "❌ tsconfig.json not found in $SVELTEKIT_DIR"
  exit 1
fi
echo "✅ TypeScript configured"

# Check for critical files
echo ""
echo "📋 Verifying critical files..."
critical_files=(
  "src/mcp/server.ts"
  "src/lib/server/redis.ts"
  "src/lib/server/db/client.ts"
  "drizzle.config.ts"
  "svelte.config.js"
)

for file in "${critical_files[@]}"; do
  if [ ! -f "$SVELTEKIT_DIR/$file" ]; then
    echo "❌ Missing critical file: $file"
    exit 1
  fi
done
echo "✅ All critical files present"

# Verify GPU addon (if available)
echo ""
echo "🔧 Checking GPU acceleration..."
if [ -f "$WORKSPACE_ROOT/sveltekit-frontend/simd-bridge/cpp/build/Release/tensorrt_bridge.node" ]; then
  echo "✅ GPU addon found at simd-bridge/cpp/build/Release/"
else
  echo "⚠️  GPU addon not found (optional). Build with: cd simd-bridge/cpp && cmake -B build && cmake --build build --config Release"
fi

# Environment check
echo ""
echo "🌍 Environment validation..."
if [ -f "$SVELTEKIT_DIR/.env" ]; then
  echo "✅ .env file found"
else
  echo "⚠️  .env file not found (may be needed for some features)"
fi

echo ""
echo "✅ Workspace initialized successfully!"
echo "   Next: Run a startup task from the Command Palette:"
echo "   - 'Tasks: Run Task' → 'Full Stack: Dev + Services'"
echo "   - Or: 'Quick Start: Dev + Redis + Gemma4'"
