# 🧪 Legal AI Development Environment Test Server

## Overview

Comprehensive Playwright test suite for the Legal AI application development environment, covering PostgreSQL with pgvector, enhanced RAG system, Claude vector integration CLI, and SvelteKit endpoints.

## 🚀 Quick Start

### Prerequisites
- **Node.js 18+** (Required)
- **npm** (Required) 
- **PostgreSQL 17** with pgvector extension (Optional - tests will use mocks if unavailable)
- **Ollama** with GPU support (Optional - tests will use mocks if unavailable)
- **Playwright** browsers installed

### Installation & Setup

```bash
# Install dependencies
npm install

# Install Playwright browsers (first time only)
npx playwright install

# Check environment status
npm run dev:status

# Run comprehensive test suite
npm run test:dev
```

## 📊 Test Suites

### 1. Development Environment Tests (`tests/development-environment.spec.ts`)
**Command:** `npm run test:environment`

**Coverage:**
- ✅ Development environment status check
- ✅ PostgreSQL connection and pgvector extension verification
- ✅ Ollama service availability testing
- ✅ Environment variables configuration validation
- ✅ SvelteKit development server availability

**Key Features:**
- Graceful handling of missing services
- Comprehensive service health checks
- Environment configuration validation

### 2. PostgreSQL CRUD + pgvector Tests (`tests/postgresql-crud-pgvector.spec.ts`)
**Command:** `npm run test:postgresql`

**Coverage:**
- ✅ **CREATE**: Insert legal documents with vector embeddings
- ✅ **READ**: Query documents with vector similarity search
- ✅ **UPDATE**: Modify document content and metadata
- ✅ **DELETE**: Remove test documents with verification
- ✅ **EMBEDDING CACHE**: Test caching functionality for performance
- ✅ **BULK OPERATIONS**: Performance testing with multiple documents

**Database Schema Tested:**
```sql
-- Documents table with pgvector support
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file TEXT,
  content TEXT,
  summary TEXT,
  embedding vector(768),  -- 768-dimensional embeddings
  chunk_index INTEGER DEFAULT 0,
  total_chunks INTEGER DEFAULT 1,
  tokens INTEGER,
  file_hash TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Embedding cache for performance optimization
CREATE TABLE embedding_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text_hash TEXT UNIQUE NOT NULL,
  embedding vector(768) NOT NULL,
  model VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 3. Enhanced RAG System Tests (`tests/enhanced-rag-system.spec.ts`)
**Command:** `npm run test:rag-enhanced`

**Coverage:**
- ✅ **RAG Service Initialization**: Development mode with PostgreSQL-only fallback
- ✅ **Ollama Embedding Generation**: nomic-embed-text model integration
- ✅ **Document Ingestion**: Legal document processing and vector storage
- ✅ **Semantic Search**: Vector similarity search with cosine distance
- ✅ **RAG Response Generation**: Context preparation for AI responses
- ✅ **Caching & Performance**: Embedding cache hit/miss optimization
- ✅ **Error Handling**: Graceful degradation and fallback mechanisms

**Test Data Examples:**
```javascript
// Sample legal documents used in testing
const testDocuments = [
  {
    content: "Contract law principles: offer, acceptance, consideration...",
    file: "contract-law-principles.md",
    summary: "Comprehensive guide to contract law fundamentals"
  },
  {
    content: "Criminal procedure: evidence rules, constitutional rights...",
    file: "criminal-procedure.txt",
    summary: "Criminal procedure and evidence handling"
  }
];
```

### 4. Claude Vector CLI Tests (`tests/claude-vector-cli.spec.ts`)
**Command:** `npm run test:claude-cli`

**Coverage:**
- ✅ **CLI Help System**: Usage information and command documentation
- ✅ **Test Command**: Sample legal document insertion and search
- ✅ **File Embedding**: Single file processing with vector generation
- ✅ **Directory Embedding**: Batch processing of legal document directories
- ✅ **Search Functionality**: Claude-ready context generation from queries
- ✅ **Database Integration**: PostgreSQL state verification
- ✅ **PostgreSQL Shortcuts**: Batch file integration testing

**CLI Commands Tested:**
```bash
npm run vector:claude help         # Display help
npm run vector:claude test         # Insert test legal documents
npm run vector:claude embed-file <path>    # Embed single file
npm run vector:claude embed-dir <path>     # Embed directory
npm run vector:claude search "query"      # Search with Claude context
```

### 5. SvelteKit Endpoints Tests (`tests/sveltekit-endpoints.spec.ts`)
**Command:** `npm run test:sveltekit`

**Coverage:**
- ✅ **Main Application**: Page loading and SvelteKit structure detection
- ✅ **Navigation & Routing**: Route testing and link validation
- ✅ **Legal AI Chat Interface**: Input fields and interaction testing
- ✅ **API Endpoints**: Health checks and service endpoint validation
- ✅ **File Upload**: Legal document upload functionality testing
- ✅ **Responsive Design**: Mobile and tablet compatibility testing
- ✅ **Development Features**: Vite integration and HMR detection

**API Endpoints Tested:**
```javascript 
const testEndpoints = [
  '/api/health',      // System health check
  '/api/status',      // Service status
  '/api/legal/search', // Legal document search
  '/api/chat',        // AI chat interface
  '/api/upload',      // Document upload
  '/api/rag',         // RAG system integration
  '/api/multi-agent'  // Multi-agent orchestration
];
```

## 🎛️ Test Runner (`run-development-tests.mjs`)

**Command:** `npm run test:dev`

### Features:
- **🔍 Prerequisites Check**: Validates Node.js, npm, PostgreSQL, Ollama availability
- **🎨 Color-coded Output**: Terminal colors for easy status identification
- **📊 Result Aggregation**: Collects passed/failed/skipped counts across all suites
- **📋 Report Generation**: JSON reports saved to `.test-reports/` directory
- **⚡ Parallel Execution**: Efficient test suite orchestration
- **🛡️ Error Resilience**: Continues testing even if individual suites fail

### Command Options:
```bash
npm run test:dev                    # Standard test run
npm run test:dev:headed            # Run with visible browser (debugging)
npm run test:dev:verbose           # Detailed output
```

### Output Example:
```
🚀 Legal AI Development Environment Test Suite
============================================================
Started at: 8/4/2025, 10:30:15 AM

🔍 Checking Prerequisites
==================================================
✅ Node.js - Available
   Version: v20.11.0
✅ npm - Available
✅ PostgreSQL - Available
⚠️ Ollama - Optional - Not Available

🧪 Running Development Environment
--------------------------------------------------
✅ Development Environment completed successfully
   Passed: 5, Failed: 0, Skipped: 1

🧪 Running PostgreSQL CRUD & pgvector
--------------------------------------------------
✅ PostgreSQL CRUD & pgvector completed successfully
   Passed: 8, Failed: 0, Skipped: 0

📋 Final Results
==============================
Total Tests: 35
Passed: 32
Failed: 0
Skipped: 3
Success Rate: 91.4%

🎉 All tests completed successfully!
✅ Development environment is ready for use
⏱️ Total execution time: 45.2s
```

## 🗂️ Test Reports

### Report Structure
```json
{
  "timestamp": "2025-08-04T15:30:15.123Z",
  "duration": "45.2s",
  "results": {
    "passed": 32,
    "failed": 0,
    "skipped": 3,
    "total": 35
  },
  "environment": {
    "node_version": "v20.11.0",
    "platform": "win32",
    "cwd": "C:\\Users\\james\\Desktop\\deeds-web\\deeds-web-app"
  }
}
```

### Report Locations
- **JSON Reports**: `.test-reports/development-tests-[timestamp].json`
- **Claude Context**: `.check-logs/claude-context-[timestamp].json`
- **Playwright Reports**: `test-results/` (if configured)

## 🛠️ Individual Test Commands

### Core Test Suites
```bash
# Environment and service health
npm run test:environment

# Database operations with vector search
npm run test:postgresql

# RAG system with AI integration
npm run test:rag-enhanced

# CLI tools and vector integration
npm run test:claude-cli

# SvelteKit frontend and API testing
npm run test:sveltekit
```

### Existing Comprehensive Tests
```bash
# Legacy comprehensive test suites
npm run test:comprehensive          # Full comprehensive suite
npm run test:comprehensive-quick    # Quick comprehensive run
npm run test:gpu-only              # GPU-specific tests
npm run test:legal-ai              # Legal AI focused tests
npm run test:rag-integration       # RAG integration tests
npm run test:performance           # Performance benchmarks
```

## 🔧 Configuration & Environment

### Environment Variables (`.env.development`)
```env
NODE_ENV=development
DATABASE_URL=postgresql://postgres:123456@localhost:5432/postgres
OLLAMA_URL=http://localhost:11434
SKIP_RAG_INITIALIZATION=true
SKIP_QDRANT_HEALTH_CHECK=true
USE_POSTGRESQL_ONLY=true
VITE_MAX_MEMORY=8192
NODE_OPTIONS=--max-old-space-size=8192
```

### PostgreSQL Configuration
```bash
# Database: legal_ai_db
# User: postgres
# Password: 123456
# Port: 5432
# Extensions: pgvector

# Quick connection test
npm run psql connect

# Check vector extension status
npm run psql vector-status

# List documents with embeddings
npm run psql list-docs
```
need drizzle-orm, drizzle-kit if needed.

qdrant, local windows downloaded.

### Ollama Configuration
```bash
# Check Ollama status
npm run ollama:status

# Test embedding model
curl -X POST http://localhost:11434/api/embeddings \
  -H "Content-Type: application/json" \
  -d '{"model": "nomic-embed-text", "prompt": "test legal document"}'
```

## 🚨 Troubleshooting

### Common Issues

#### 1. PostgreSQL Connection Fails
```bash
# Check if PostgreSQL is running
npm run psql connect

# Verify credentials in .env.development
# Default: postgres:123456@localhost:5432

# Test pgvector extension
npm run psql test-vector
```

#### 2. Ollama Not Available
```bash
# Check Ollama service
npm run ollama:status

# Start Ollama (if installed)
npm run ollama:start

# Pull required models
ollama pull nomic-embed-text
```

#### 3. SvelteKit Dev Server Not Running
```bash
# Start development server
npm run dev

# Check status
npm run dev:status

# Verify port 5177 is available
netstat -an | findstr :5177
```

#### 4. Tests Timing Out
```bash
# Run with increased timeout
npx playwright test --timeout=60000

# Run individual suites for debugging
npm run test:environment
npm run test:postgresql
```

#### 5. Missing Dependencies
```bash
# Reinstall dependencies
npm install

# Install Playwright browsers
npx playwright install

# Check system requirements
npx playwright install-deps
```

### Debug Mode

#### Run Tests with Browser Visible
```bash
npm run test:dev:headed
```

#### Verbose Output
```bash
npm run test:dev:verbose
```

#### Single Test File Debug
```bash
npx playwright test tests/development-environment.spec.ts --headed --debug
```

## 📈 Performance Benchmarks

### Expected Performance Metrics
- **Environment Check**: < 5 seconds
- **PostgreSQL CRUD**: < 10 seconds (with real DB)
- **RAG System Tests**: < 30 seconds (with Ollama)
- **CLI Tests**: < 45 seconds (includes file operations)
- **SvelteKit Tests**: < 15 seconds (with running server)
- **Total Suite**: < 2 minutes (optimal conditions)

### Performance Factors
- **Database Speed**: SSD vs HDD significantly impacts PostgreSQL tests
- **GPU Availability**: CUDA acceleration improves Ollama embedding generation
- **Network**: Local services perform better than networked databases
- **Memory**: Large embeddings benefit from increased Node.js heap size

## 🎯 Best Practices

### Before Running Tests
1. **Check Prerequisites**: Run `npm run dev:status` first
2. **Start Services**: Launch PostgreSQL and Ollama if available
3. **Clean Environment**: Ensure no conflicting processes on test ports

### During Development
1. **Individual Suites**: Test specific areas with individual commands
2. **Mock Gracefully**: Tests adapt to missing services automatically
3. **Monitor Resources**: Watch memory usage during bulk operations

### CI/CD Integration
```yaml
# Example GitHub Actions workflow
- name: Run Development Tests
  run: |
    npm run dev:status
    npm run test:dev
    
- name: Upload Test Reports
  uses: actions/upload-artifact@v3
  with:
    name: test-reports
    path: .test-reports/
```

## 🔗 Integration Points

### SvelteKit Frontend
- **Routes**: Tests validate page loading and navigation
- **Components**: UI component interaction testing
- **API Routes**: Server endpoint validation

### PostgreSQL + pgvector
- **Schema**: Document and embedding table operations
- **Queries**: Vector similarity search validation
- **Performance**: Bulk operation benchmarking

### Ollama + LangChain
- **Models**: nomic-embed-text embedding generation
- **API**: REST endpoint integration testing
- **Fallbacks**: Mock embedding when service unavailable

### Claude Integration
- **Context Generation**: Structured output for Claude API
- **Vector Search**: Relevant document retrieval
- **CLI Tools**: Command-line interface validation

---

## 📞 Support

### Getting Help
- **Documentation**: Check CLAUDE.md for project-specific guidance
- **Status Checks**: Use `npm run dev:status` for environment diagnostics
- **Logs**: Review `.test-reports/` and `.check-logs/` for detailed information

### Contributing
- **New Tests**: Add to appropriate test file in `tests/` directory
- **Test Data**: Use legal document examples that don't contain sensitive information
- **Performance**: Include timing assertions for critical operations

---

**Last Updated**: August 4, 2025  
**Test Framework**: Playwright  
**Node.js Version**: 18+  
**Database**: PostgreSQL 17 + pgvector  
**AI Integration**: Ollama + LangChain