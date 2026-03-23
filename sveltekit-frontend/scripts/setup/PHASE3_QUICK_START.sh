#!/bin/bash # Phase 3 Quick Start - AI Infrastructure Consolidation # Run this script to verify your setup is ready echo
"🚀 Phase 3: AI Infrastructure Consolidation - Quick Start" echo
"==========================================================" echo "" # Check Ollama echo "📡 Checking Ollama..." if curl
-s http://localhost:11434/api/tags > /dev/null 2>&1; then echo "✅ Ollama is running" ollama list | grep -E
"(gemma3-legal|embeddinggemma)" || echo "⚠️ Gemma models not found - run: ollama pull gemma3-legal:latest && ollama pull
embeddinggemma:latest" else echo "❌ Ollama is not running - start it first" fi # Check PostgreSQL + pgvector echo ""
echo "🗄️ Checking PostgreSQL..." if PGPASSWORD=123456 psql -h localhost -p 5432 -U legal_admin -d legal_ai_db -c "SELECT
1" > /dev/null 2>&1; then echo "✅ PostgreSQL is running" PGPASSWORD=123456 psql -h localhost -p 5432 -U legal_admin -d
legal_ai_db -c "SELECT * FROM pg_extension WHERE extname='vector';" | grep vector > /dev/null && echo "✅ pgvector
extension installed" || echo "⚠️ pgvector extension missing" else echo "❌ PostgreSQL is not running or credentials
invalid" fi # Check Redis echo "" echo "💾 Checking Redis..." if redis-cli -a redis ping > /dev/null 2>&1; then echo "✅
Redis is running" else echo "❌ Redis is not running - start it with password 'redis'" fi # Check optional services echo
"" echo "🔧 Optional Services:" echo " • TensorRT-LLM + Triton: Set TENSORRT_ENABLED=true" echo " • Qdrant (Docker): Set
QDRANT_ENABLED=true" echo " • vLLM: Set VLLM_ENABLED=true" echo " • OpenAI: Set OPENAI_ENABLED=true and OPENAI_API_KEY"
echo "" echo "📋 Next Steps:" echo "1. npm run dev - Start development server" echo "2. Check health: curl
http://localhost:5173/api/health" echo "3. Test Context7 MCP: npx -y @upstash/context7-mcp" echo "" echo "🎯 Phase 3
Status:" echo " ✅ Configuration created (src/lib/server/config.ts)" echo " ✅ gpu-summary-store fixed" echo " ⏳ AI
Orchestrator (in progress)" echo " ⏳ RAG consolidation (pending)" echo " ⏳ Hybrid vector search (pending)"
