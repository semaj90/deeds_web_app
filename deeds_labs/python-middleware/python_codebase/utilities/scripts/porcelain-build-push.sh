#!/bin/bash
# Porcelain Build Push Script - Legal AI Platform
# Commits only essential code changes, ignores Go binaries and build artifacts

set -e

echo "🚀 Legal AI Platform - Porcelain Build Push"
echo "=========================================="

# Add only specific file types, ignore binaries
echo "📁 Adding source code changes..."

# Add infrastructure configurations
git add docker-compose-*.yml
git add Dockerfile*
git add Caddyfile*

# Add SvelteKit frontend (source only)
git add sveltekit-frontend/src/
git add sveltekit-frontend/package*.json
git add sveltekit-frontend/vite.config.*
git add sveltekit-frontend/svelte.config.*
git add sveltekit-frontend/scripts/*.js
git add sveltekit-frontend/scripts/*.ts

# Add database migrations and schemas
git add "src/lib/server/db/"

# Add Python TensorRT-LLM scripts
git add "*.py"

# Add documentation
git add "*.md"

# Exclude Go binaries explicitly
echo "🚫 Ignoring Go binaries and build artifacts..."
git reset HEAD "*.exe" 2>/dev/null || true
git reset HEAD "**/*.exe" 2>/dev/null || true
git reset HEAD "**/cmd/**" 2>/dev/null || true
git reset HEAD "**/dist/" 2>/dev/null || true
git reset HEAD "**/build/" 2>/dev/null || true
git reset HEAD "**/node_modules/" 2>/dev/null || true

# Show what will be committed
echo "📋 Files to be committed:"
git diff --cached --name-only

# Commit with descriptive message
COMMIT_MSG="$(cat <<'EOF'
TensorRT-LLM + QUIC Protocol Gateway Integration

🧠 TensorRT-LLM v0.21.0:
- Ubuntu WSL2 Python 3.12 environment setup
- RTX 3060 Ti CUDA architecture 8.6 optimization
- C++ bindings build process for legal AI inference

🚀 QUIC→HTTP Protocol Stack:
- Caddy gRPC-Web proxy configuration
- HTTP/3 with TLS termination and Alt-Svc headers
- Automatic HTTP/TCP fallback for client compatibility
- Binary protobuf transport over QUIC/UDP

📊 Infrastructure:
- PostgreSQL 17 + pgvector with 72 legal document tables
- Redis client libraries for CUDA service worker integration
- Docker Desktop stack with GPU acceleration

🖥️ SvelteKit Frontend:
- WebAssembly + SIMD Gemma:270m client-side parser
- Real-time chat with TensorRT-LLM backend integration
- Drizzle ORM with type-safe database operations

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"

git commit -m "$COMMIT_MSG"

echo "✅ Commit created successfully!"

# Push to origin
echo "📤 Pushing to GitHub..."
git push origin main

echo "🎉 Build pushed to GitHub successfully!"
echo ""
echo "📋 Summary:"
echo "  • TensorRT-LLM: Python 3.12 + CUDA 8.6 bindings"
echo "  • QUIC Gateway: UDP→HTTP/2→gRPC→JSON protocol stack"
echo "  • Infrastructure: PostgreSQL 17 + Redis + legal AI database"
echo "  • Frontend: Svelte 5 + WebAssembly + real-time chat"
echo ""
echo "🔧 Next: Test TensorRT-LLM inference with Gemma3-legal models"