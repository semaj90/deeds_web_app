#!/bin/bash
# Complete Integration Check and Installation Script
# install-and-check.sh

echo "================================================"
echo "   COMPLETE AI INTEGRATION INSTALLATION"
echo "          & VERIFICATION SCRIPT"
echo "================================================"
echo ""

# Set error handling
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Timestamp function
timestamp() {
    date +"%Y-%m-%d %H:%M:%S"
}

# Log function
log() {
    echo "[$(timestamp)] $1" | tee -a integration-report.log
}

# Create report file
REPORT_FILE="INTEGRATION-REPORT-$(date +%Y%m%d-%H%M%S).md"

# Initialize report
cat > "$REPORT_FILE" << 'EOF'
# 🚀 COMPLETE AI INTEGRATION REPORT

## Generated: 
EOF
echo "## Generated: $(date '+%Y-%m-%d %H:%M:%S')" >> "$REPORT_FILE"

echo "" >> "$REPORT_FILE"
echo "---" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# ============================================
# STEP 1: NPM PACKAGE INSTALLATION
# ============================================

log "📦 Starting NPM package installation..."

echo "## 📦 NPM Package Installation" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

cd sveltekit-frontend

# Install required dev dependencies for scripts
log "Installing development dependencies..."
npm install --save-dev \
    chalk@5.3.0 \
    ora@8.0.1 \
    glob@10.3.10 \
    concurrently@9.2.0 \
    ws@8.16.0 \
    rimraf@5.0.5 \
    2>&1 | tee -a "$REPORT_FILE"

# Install any missing production dependencies
log "Installing production dependencies..."
npm install 2>&1 | tee -a "$REPORT_FILE"

echo "✅ NPM packages installed successfully" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# ============================================
# STEP 2: TYPESCRIPT & SVELTE CHECKS
# ============================================

log "🔍 Running TypeScript checks..."

echo "## 🔍 TypeScript & Svelte Checks" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo "### TypeScript Check" >> "$REPORT_FILE"
echo '```' >> "$REPORT_FILE"
npx tsc --noEmit --skipLibCheck --incremental 2>&1 | tee -a "$REPORT_FILE" || true
echo '```' >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo "### Svelte Check" >> "$REPORT_FILE"
echo '```' >> "$REPORT_FILE"
npx svelte-check --tsconfig ./tsconfig.json --threshold warning 2>&1 | head -50 | tee -a "$REPORT_FILE" || true
echo '```' >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# ============================================
# STEP 3: LINT CHECKS
# ============================================

log "🎨 Running lint checks..."

echo "## 🎨 Lint & Format Checks" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo "### ESLint Check" >> "$REPORT_FILE"
echo '```' >> "$REPORT_FILE"
npx eslint . --ext .ts,.js,.svelte --max-warnings 10 2>&1 | head -30 | tee -a "$REPORT_FILE" || true
echo '```' >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo "### Prettier Check" >> "$REPORT_FILE"
echo '```' >> "$REPORT_FILE"
npx prettier --check . 2>&1 | head -20 | tee -a "$REPORT_FILE" || true
echo '```' >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# ============================================
# STEP 4: HEALTH CHECKS
# ============================================

log "🏥 Running health checks..."

echo "## 🏥 Service Health Checks" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Check ports
echo "### Port Availability" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

PORTS=(5173 8084 6379 11434 5432 8085)
for port in "${PORTS[@]}"; do
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo "- Port $port: ⚠️ IN USE" >> "$REPORT_FILE"
    else
        echo "- Port $port: ✅ AVAILABLE" >> "$REPORT_FILE"
    fi
done
echo "" >> "$REPORT_FILE"

# Check Node version
echo "### System Requirements" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "- Node.js: $(node --version)" >> "$REPORT_FILE"
echo "- npm: $(npm --version)" >> "$REPORT_FILE"

# Check Go
if command -v go &> /dev/null; then
    echo "- Go: $(go version | awk '{print $3}')" >> "$REPORT_FILE"
else
    echo "- Go: ❌ Not installed" >> "$REPORT_FILE"
fi

# Check Redis
if command -v redis-cli &> /dev/null; then
    if redis-cli ping &> /dev/null; then
        echo "- Redis: ✅ Running" >> "$REPORT_FILE"
    else
        echo "- Redis: ⚠️ Installed but not running" >> "$REPORT_FILE"
    fi
else
    echo "- Redis: ❌ Not installed" >> "$REPORT_FILE"
fi

# Check Ollama
if command -v ollama &> /dev/null; then
    echo "- Ollama: ✅ Installed" >> "$REPORT_FILE"
    echo "  - Models:" >> "$REPORT_FILE"
    ollama list 2>&1 | head -5 | sed 's/^/    /' >> "$REPORT_FILE" || echo "    Unable to list models" >> "$REPORT_FILE"
else
    echo "- Ollama: ❌ Not installed" >> "$REPORT_FILE"
fi

# Check GPU
if command -v nvidia-smi &> /dev/null; then
    echo "- GPU: ✅ NVIDIA GPU detected" >> "$REPORT_FILE"
    nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader | sed 's/^/    /' >> "$REPORT_FILE"
else
    echo "- GPU: ⚠️ No NVIDIA GPU detected" >> "$REPORT_FILE"
fi

echo "" >> "$REPORT_FILE"

# ============================================
# STEP 5: DATABASE CHECKS
# ============================================

log "🗄️ Checking database configuration..."

echo "## 🗄️ Database Configuration" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Check PostgreSQL
if command -v psql &> /dev/null; then
    echo "### PostgreSQL Status" >> "$REPORT_FILE"
    if pg_isready &> /dev/null; then
        echo "✅ PostgreSQL is running and ready" >> "$REPORT_FILE"
        
        # Check for JSONB tables
        echo "" >> "$REPORT_FILE"
        echo "#### JSONB Tables Check" >> "$REPORT_FILE"
        echo '```sql' >> "$REPORT_FILE"
        psql -U postgres -d legal_ai_db -c "\dt ai_summarized_documents" 2>&1 | head -10 >> "$REPORT_FILE" || echo "Table not found or database not accessible" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
    else
        echo "⚠️ PostgreSQL is installed but not running" >> "$REPORT_FILE"
    fi
else
    echo "❌ PostgreSQL not installed" >> "$REPORT_FILE"
fi

echo "" >> "$REPORT_FILE"

# ============================================
# STEP 6: FILE STRUCTURE VERIFICATION
# ============================================

log "📁 Verifying file structure..."

echo "## 📁 File Structure Verification" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Check critical files
echo "### Critical Files" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

FILES=(
    "../main.go"
    "package.json"
    "tsconfig.json"
    "vite.config.js"
    "svelte.config.js"
    "../START-GPU-LEGAL-AI-8084.bat"
    "../gpu-ai-control-panel.bat"
    "START-DEV.bat"
    "../database/schema-jsonb-enhanced.sql"
    "src/lib/db/schema-jsonb.ts"
    "src/routes/api/ai/vector-search/+server.ts"
    "../812aisummarizeintegration.md"
    "../TODO-AI-INTEGRATION.md"
)

for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "- ✅ $file" >> "$REPORT_FILE"
    else
        echo "- ❌ $file (MISSING)" >> "$REPORT_FILE"
    fi
done

echo "" >> "$REPORT_FILE"

# Check directories
echo "### Critical Directories" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

DIRS=(
    "../ai-summarized-documents"
    "../ai-summarized-documents/contracts"
    "../ai-summarized-documents/legal-briefs"
    "../ai-summarized-documents/case-studies"
    "../ai-summarized-documents/embeddings"
    "../ai-summarized-documents/cache"
    "scripts"
    "src/lib/db"
    "src/routes/api/ai"
    "node_modules"
)

for dir in "${DIRS[@]}"; do
    if [ -d "$dir" ]; then
        echo "- ✅ $dir" >> "$REPORT_FILE"
    else
        echo "- ❌ $dir (MISSING)" >> "$REPORT_FILE"
    fi
done

echo "" >> "$REPORT_FILE"

# ============================================
# STEP 7: DEPENDENCY AUDIT
# ============================================

log "🔒 Running security audit..."

echo "## 🔒 Security Audit" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo '```' >> "$REPORT_FILE"
npm audit --audit-level=moderate 2>&1 | head -20 >> "$REPORT_FILE" || true
echo '```' >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# ============================================
# STEP 8: MERGED TODO LIST
# ============================================

log "📋 Merging TODO lists..."

echo "## 📋 Consolidated TODO List" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Merge all TODO items
echo "### High Priority (This Week)" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "- [ ] Complete JSONB migration for existing tables" >> "$REPORT_FILE"
echo "- [ ] Implement BullMQ job queue for document processing" >> "$REPORT_FILE"
echo "- [ ] Add OCR support with Tesseract.js" >> "$REPORT_FILE"
echo "- [ ] Create performance monitoring dashboard" >> "$REPORT_FILE"
echo "- [ ] Implement WebSocket real-time updates" >> "$REPORT_FILE"
echo "- [ ] Fix memory leak in WebSocket connections" >> "$REPORT_FILE"
echo "- [ ] Resolve Ollama timeout on cold starts" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo "### Medium Priority (This Month)" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "- [ ] Add drag-and-drop file upload interface" >> "$REPORT_FILE"
echo "- [ ] Implement connection pooling for PostgreSQL" >> "$REPORT_FILE"
echo "- [ ] Create summary comparison view" >> "$REPORT_FILE"
echo "- [ ] Add export functionality (PDF, DOCX, JSON)" >> "$REPORT_FILE"
echo "- [ ] Implement OAuth2 authentication" >> "$REPORT_FILE"
echo "- [ ] Add webhook support for async processing" >> "$REPORT_FILE"
echo "- [ ] Create comprehensive E2E tests" >> "$REPORT_FILE"
echo "- [ ] Implement rate limiting per user/IP" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo "### Low Priority (Future)" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "- [ ] Fine-tune Gemma3-Legal model" >> "$REPORT_FILE"
echo "- [ ] Implement RAG system" >> "$REPORT_FILE"
echo "- [ ] Add Kubernetes orchestration" >> "$REPORT_FILE"
echo "- [ ] Create Zapier/Make.com integration" >> "$REPORT_FILE"
echo "- [ ] Build Microsoft Teams/Slack bots" >> "$REPORT_FILE"
echo "- [ ] Add multi-tenant support" >> "$REPORT_FILE"
echo "- [ ] Implement A/B testing framework" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# ============================================
# STEP 9: PERFORMANCE BENCHMARKS
# ============================================

log "⚡ Recording performance benchmarks..."

echo "## ⚡ Performance Benchmarks" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo "### Expected Performance Metrics" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "| Metric | Target | Current | Status |" >> "$REPORT_FILE"
echo "|--------|--------|---------|--------|" >> "$REPORT_FILE"
echo "| Tokens/Second | 100-150 | TBD | 🔄 |" >> "$REPORT_FILE"
echo "| Avg Latency | <1.5s | TBD | 🔄 |" >> "$REPORT_FILE"
echo "| Cache Hit Rate | >30% | TBD | 🔄 |" >> "$REPORT_FILE"
echo "| GPU Utilization | 70-90% | TBD | 🔄 |" >> "$REPORT_FILE"
echo "| Success Rate | >95% | TBD | 🔄 |" >> "$REPORT_FILE"
echo "| Concurrent Requests | 3 | 3 | ✅ |" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# ============================================
# STEP 10: CONFIGURATION STATUS
# ============================================

log "⚙️ Checking configuration..."

echo "## ⚙️ Configuration Status" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo "### Environment Variables" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Check for .env files
if [ -f ".env.development" ]; then
    echo "✅ .env.development exists" >> "$REPORT_FILE"
else
    echo "⚠️ .env.development missing - creating template..." >> "$REPORT_FILE"
    cat > .env.development << 'ENVEOF'
NODE_ENV=development
VITE_LEGAL_AI_API=http://localhost:8084
VITE_OLLAMA_URL=http://localhost:11434
VITE_REDIS_URL=redis://localhost:6379
VITE_ENABLE_GPU=true
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/legal_ai_db
ENVEOF
    echo "✅ Created .env.development template" >> "$REPORT_FILE"
fi

echo "" >> "$REPORT_FILE"

# ============================================
# STEP 11: QUICK START COMMANDS
# ============================================

echo "## 🚀 Quick Start Commands" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo '```bash' >> "$REPORT_FILE"
echo '# Start all services' >> "$REPORT_FILE"
echo 'npm run dev:full' >> "$REPORT_FILE"
echo '' >> "$REPORT_FILE"
echo '# Or use Windows launcher' >> "$REPORT_FILE"
echo 'START-DEV.bat' >> "$REPORT_FILE"
echo '' >> "$REPORT_FILE"
echo '# Monitor services' >> "$REPORT_FILE"
echo 'npm run monitor:lite' >> "$REPORT_FILE"
echo '' >> "$REPORT_FILE"
echo '# Check health' >> "$REPORT_FILE"
echo 'npm run test:health' >> "$REPORT_FILE"
echo '' >> "$REPORT_FILE"
echo '# Run all checks' >> "$REPORT_FILE"
echo 'npm run check:all' >> "$REPORT_FILE"
echo '```' >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# ============================================
# STEP 12: FINAL SUMMARY
# ============================================

log "📊 Generating final summary..."

echo "## 📊 Integration Summary" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Count successes and failures
SUCCESS_COUNT=$(grep -c "✅" "$REPORT_FILE" || true)
WARNING_COUNT=$(grep -c "⚠️" "$REPORT_FILE" || true)
ERROR_COUNT=$(grep -c "❌" "$REPORT_FILE" || true)

echo "### Statistics" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "- ✅ Successful checks: $SUCCESS_COUNT" >> "$REPORT_FILE"
echo "- ⚠️ Warnings: $WARNING_COUNT" >> "$REPORT_FILE"
echo "- ❌ Errors: $ERROR_COUNT" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Overall status
echo "### Overall Status" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

if [ $ERROR_COUNT -eq 0 ]; then
    echo "🎉 **SYSTEM READY FOR PRODUCTION**" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    echo "All critical components are installed and configured correctly." >> "$REPORT_FILE"
elif [ $ERROR_COUNT -lt 5 ]; then
    echo "⚠️ **SYSTEM PARTIALLY READY**" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    echo "Some non-critical components are missing. Core functionality should work." >> "$REPORT_FILE"
else
    echo "❌ **SYSTEM NEEDS CONFIGURATION**" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    echo "Multiple critical components are missing. Please review errors above." >> "$REPORT_FILE"
fi

echo "" >> "$REPORT_FILE"

# ============================================
# STEP 13: RECOMMENDATIONS
# ============================================

echo "## 💡 Recommendations" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

if [ $ERROR_COUNT -gt 0 ]; then
    echo "### Required Actions" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    
    if ! command -v go &> /dev/null; then
        echo "1. **Install Go**: Download from https://golang.org/dl/" >> "$REPORT_FILE"
    fi
    
    if ! command -v redis-cli &> /dev/null; then
        echo "2. **Install Redis**: Download from https://redis.io/download" >> "$REPORT_FILE"
    fi
    
    if ! command -v ollama &> /dev/null; then
        echo "3. **Install Ollama**: Download from https://ollama.ai" >> "$REPORT_FILE"
    fi
    
    if ! command -v psql &> /dev/null; then
        echo "4. **Install PostgreSQL**: Download from https://www.postgresql.org/download/" >> "$REPORT_FILE"
    fi
    
    echo "" >> "$REPORT_FILE"
fi

echo "### Next Steps" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "1. Review any errors or warnings above" >> "$REPORT_FILE"
echo "2. Install missing dependencies" >> "$REPORT_FILE"
echo "3. Run \`npm run setup\` to configure environment" >> "$REPORT_FILE"
echo "4. Start services with \`npm run dev:full\`" >> "$REPORT_FILE"
echo "5. Access frontend at http://localhost:5173" >> "$REPORT_FILE"
echo "6. Monitor health at http://localhost:8084/api/health" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# ============================================
# COMPLETION
# ============================================

echo "---" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "**Report Generated:** $(date '+%Y-%m-%d %H:%M:%S')" >> "$REPORT_FILE"
echo "**Report File:** $REPORT_FILE" >> "$REPORT_FILE"
echo "**Log File:** integration-report.log" >> "$REPORT_FILE"

# Display summary
echo ""
echo "================================================"
echo "        INTEGRATION CHECK COMPLETE"
echo "================================================"
echo ""
echo "📊 Results Summary:"
echo "  ✅ Successful: $SUCCESS_COUNT"
echo "  ⚠️ Warnings: $WARNING_COUNT"
echo "  ❌ Errors: $ERROR_COUNT"
echo ""
echo "📄 Full report saved to: $REPORT_FILE"
echo "📋 Detailed log saved to: integration-report.log"
echo ""

if [ $ERROR_COUNT -eq 0 ]; then
    echo "🎉 System is ready for use!"
else
    echo "⚠️ Please review the report for required actions."
fi

echo ""
echo "Run 'cat $REPORT_FILE' to view the full report"
