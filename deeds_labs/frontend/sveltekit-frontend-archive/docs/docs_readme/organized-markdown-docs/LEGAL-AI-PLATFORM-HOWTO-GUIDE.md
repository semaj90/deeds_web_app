# Legal AI Platform - Comprehensive How-To Guide

## Table of Contents
1. [System Architecture Overview](#system-architecture-overview)
2. [Prerequisites & Requirements](#prerequisites--requirements)
3. [Installation & Setup](#installation--setup)
4. [Service Management](#service-management)
5. [API Endpoints Documentation](#api-endpoints-documentation)
6. [Development Workflow](#development-workflow)
7. [Orchestrator System](#orchestrator-system)
8. [Troubleshooting](#troubleshooting)
9. [Performance Optimization](#performance-optimization)
10. [Production Deployment](#production-deployment)

---

## System Architecture Overview

The Legal AI Platform is a **production-ready, enterprise-grade** system built with modern technologies and designed for native Windows deployment without Docker dependencies.

### Core Components

#### 1. **Frontend Layer**
- **Framework**: SvelteKit 2 with Svelte 5
- **TypeScript**: Full type safety end-to-end
- **UI Libraries**: 
  - bits-ui (advanced primitives)
  - melt-ui (headless components)
  - shadcn-svelte (design system)
  - lucide-svelte (icons)
- **Styling**: TailwindCSS + UnoCSS
- **State Management**: XState finite state machines
- **Port**: 5173

#### 2. **Backend Microservices**
- **Enhanced RAG Service**: Go microservice (Port 8094)
- **Upload Service**: Go microservice (Port 8093)
- **Node.js Gateway**: API orchestration and routing
- **Multi-Protocol Support**: REST, gRPC, QUIC, WebSocket

#### 3. **GPU Orchestrator System**
- **Master Process**: Cluster management with worker spawning
- **CUDA Workers**: GPU-accelerated processing
- **SIMD Processing**: High-performance vector operations
- **Health Monitoring**: Real-time worker status tracking

#### 4. **Database Layer**
- **PostgreSQL 17**: Primary database with pgvector extension
- **Redis**: Caching and session management
- **Qdrant**: Vector database for embeddings
- **Neo4j**: Graph database (optional)

#### 5. **AI/ML Stack**
- **Ollama**: Local LLM inference (gemma3-legal model)
- **GPU Acceleration**: RTX 3060 Ti optimized (8GB VRAM)
- **Embedding Models**: nomic-embed-text (384d)
- **Vector Search**: PostgreSQL pgvector + Qdrant

#### 6. **Storage & File Processing**
- **MinIO**: S3-compatible object storage
- **File Processing**: PDF parsing, OCR, text extraction
- **Evidence Management**: Cryptographic hashing and validation

#### 7. **Message Queue & Communication**
- **NATS**: Message streaming (Ports 4222, 8222)
- **RabbitMQ**: Task queuing (optional)
- **WebSocket**: Real-time communication
- **QUIC**: Next-generation transport protocol

---

## Prerequisites & Requirements

### Hardware Requirements
- **CPU**: Multi-core processor (minimum 4 cores)
- **RAM**: 16GB minimum (32GB recommended)
- **GPU**: NVIDIA RTX 3060 Ti or better (8GB+ VRAM)
- **Storage**: 100GB+ free space (SSD recommended)

### Software Requirements
- **OS**: Windows 10/11 (native, no WSL/Docker)
- **Node.js**: 18.0.0 or higher
- **Go**: 1.21.0 or higher
- **PostgreSQL**: 17.x with pgvector extension
- **Redis**: Latest stable
- **CUDA**: 12.0+ drivers and toolkit
- **Git**: For version control

### CUDA & GPU Setup
```cmd
# Verify CUDA installation
nvidia-smi
nvcc --version

# Check GPU memory
nvidia-smi --query-gpu=memory.total,memory.free --format=csv
```

---

## Installation & Setup

### Quick Start (Recommended)

#### Method 1: npm run dev:full
```bash
cd C:\Users\james\Desktop\deeds-web\deeds-web-app
npm run dev:full
```
This executes the `START-LEGAL-AI.bat` script for complete system startup.

#### Method 2: Native Windows Batch
```cmd
START-LEGAL-AI.bat
```

#### Method 3: PowerShell Orchestration
```powershell
.\COMPLETE-LEGAL-AI-WIRE-UP.ps1 -Start
```

### Manual Service Installation

#### 1. PostgreSQL Setup
```cmd
# Install PostgreSQL 17
# Download from: https://www.postgresql.org/download/windows/

# Start PostgreSQL service
net start postgresql-x64-17

# Create database and user
psql -U postgres -c "CREATE DATABASE legal_ai_db;"
psql -U postgres -c "CREATE USER legal_admin WITH PASSWORD '123456';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE legal_ai_db TO legal_admin;"

# Install pgvector extension
psql -U postgres -d legal_ai_db -c "CREATE EXTENSION vector;"
```

#### 2. Redis Setup
```cmd
# Download Redis for Windows
# Extract to .\redis-windows\

# Start Redis
.\redis-windows\redis-server.exe
```

#### 3. Ollama Setup
```cmd
# Download and install Ollama
# From: https://ollama.ai/download

# Start Ollama service
ollama serve

# Pull the legal model
ollama pull gemma3-legal:latest
```

#### 4. MinIO Setup
```cmd
# Download MinIO for Windows
# Place minio.exe in project root

# Create data directory
mkdir minio-data

# Start MinIO
minio.exe server ./minio-data --address :9000 --console-address :9001
```

#### 5. Qdrant Setup
```cmd
# Extract Qdrant Windows binary to .\qdrant-windows\

# Start Qdrant
.\qdrant-windows\qdrant.exe
```

#### 6. Go Microservices
```cmd
cd go-microservice

# Build Enhanced RAG service
go build -o bin/enhanced-rag.exe cmd/enhanced-rag/main.go

# Build Upload service
go build -o bin/upload-service.exe cmd/upload-service/main.go

# Run services
go run cmd/enhanced-rag/main.go
go run cmd/upload-service/main.go
```

#### 7. SvelteKit Frontend
```cmd
cd sveltekit-frontend
npm install
npm run dev
```

---

## Service Management

### Startup Scripts

#### Complete System Startup
```cmd
# Option 1: Batch file
START-LEGAL-AI.bat

# Option 2: npm script
npm run dev:full

# Option 3: PowerShell (Advanced)
.\COMPLETE-LEGAL-AI-WIRE-UP.ps1 -Start
```

#### Individual Service Management
```cmd
# PostgreSQL
net start postgresql-x64-17
net stop postgresql-x64-17

# Redis
redis-server
redis-cli shutdown

# Ollama
ollama serve
# Ctrl+C to stop

# MinIO
minio.exe server ./minio-data --address :9000 --console-address :9001

# Qdrant
.\qdrant-windows\qdrant.exe
```

### Service Health Monitoring

#### System Status Check
```cmd
# Quick health check
curl http://localhost:8094/api/health
curl http://localhost:11434/api/tags
curl http://localhost:6333/collections
redis-cli ping
```

#### Advanced Monitoring
```powershell
# PowerShell health check
.\COMPLETE-LEGAL-AI-WIRE-UP.ps1 -Status

# Orchestrator health
node orchestrator/health_check.js
```

#### Health Endpoints
- **Enhanced RAG**: `http://localhost:8094/api/health`
- **Upload Service**: `http://localhost:8093/health`
- **Ollama**: `http://localhost:11434/api/tags`
- **Qdrant**: `http://localhost:6333/collections`
- **MinIO**: `http://localhost:9000/health`
- **Frontend**: `http://localhost:5173`

---

## API Endpoints Documentation

### Core Services

#### Enhanced RAG API (Port 8094)
```bash
# Health check
GET /api/health

# Process document
POST /api/ai/process-document
Content-Type: application/json
{
  "content": "Legal document text...",
  "document_type": "contract",
  "practice_area": "corporate",
  "jurisdiction": "US"
}

# Vector search
POST /api/ai/vector-search
Content-Type: application/json
{
  "query": "contract liability terms",
  "model": "gemma3-legal",
  "limit": 10,
  "filters": {
    "practice_area": "corporate"
  }
}

# GPU status
GET /api/gpu-status
```

#### Upload Service API (Port 8093)
```bash
# Upload file
POST /upload
Content-Type: multipart/form-data

# File status
GET /upload/status/{file_id}

# File metadata
GET /upload/metadata/{file_id}
```

### SvelteKit API Routes

#### AI Endpoints
```bash
# AI Chat
POST /api/ai/chat
POST /api/ai/analyze
POST /api/ai/summarize

# Document processing
POST /api/ai/process-document
POST /api/ai/generate-report

# Vector operations
POST /api/ai/vector-search
POST /api/ai/embeddings
```

#### Legal Specific
```bash
# Legal analysis
POST /api/legal/analyze
POST /api/legal/precedents
POST /api/legal/ingest

# Case management
GET /api/cases
POST /api/cases
GET /api/cases/{caseId}
PUT /api/cases/{caseId}

# Evidence handling
POST /api/evidence/upload
POST /api/evidence/analyze
GET /api/evidence/{evidenceId}
```

#### System APIs
```bash
# Health and metrics
GET /api/health
GET /api/metrics
GET /api/system/check

# GPU monitoring
GET /api/gpu/devices
GET /api/gpu/memory-status
GET /api/gpu/temperature

# Database operations
GET /api/database/health
POST /api/search/semantic
```

### Example API Calls

#### Document Processing
```bash
curl -X POST http://localhost:8094/api/ai/process-document \
  -H "Content-Type: application/json" \
  -d '{
    "content": "This contract establishes terms...",
    "document_type": "contract",
    "jurisdiction": "US"
  }'
```

#### Vector Search
```bash
curl -X POST http://localhost:5173/api/ai/vector-search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "liability clauses",
    "limit": 5
  }'
```

#### GPU Status Check
```bash
curl http://localhost:8094/api/gpu-status | jq
```

---

## Development Workflow

### Environment Setup

#### 1. Development Environment
```bash
# Clone and setup
cd C:\Users\james\Desktop\deeds-web\deeds-web-app
npm install
cd sveltekit-frontend
npm install

# Environment configuration
cp .env.example .env
# Edit .env with your settings
```

#### 2. Development Scripts
```bash
# Frontend development
npm run dev:frontend

# Full system development
npm run dev:enhanced

# Type checking
npm run check:all

# Testing
npm run test:unit
npm run test:e2e
```

### Code Quality & Linting

#### TypeScript Checking
```bash
# Fast type check
npm run check:ultra-fast

# Complete check
npm run check:all

# Watch mode
npm run check:watch
```

#### Linting and Formatting
```bash
# Check linting
npm run lint:check

# Fix linting issues
npm run lint:fix

# Format code
npm run format
```

### Testing

#### Unit Tests
```bash
# Run unit tests
npm run test:unit

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

#### End-to-End Tests
```bash
# Run E2E tests
npm run test:e2e

# Interactive mode
npm run test:e2e:ui
```

#### Integration Tests
```bash
# Test system integration
npm run test:integration

# Test database
npm run test:db

# Test API endpoints
npm run test:api
```

### Database Management

#### Migrations
```bash
# Generate migration
npm run db:generate

# Run migrations
npm run db:migrate

# Seed database
npm run db:seed

# Reset database
npm run db:reset
```

#### Database Studio
```bash
# Open Drizzle Studio
npm run db:studio
```

---

## Orchestrator System

The GPU orchestrator system manages worker processes for high-performance computing tasks.

### Orchestrator Architecture

#### Master Process
- **File**: `orchestrator/master.js`
- **Function**: Spawns and manages worker cluster
- **Health Endpoint**: `http://localhost:8099/health` (dev mode)

#### Worker Processes
- **File**: `orchestrator/worker_process.js`
- **Function**: Execute GPU-accelerated tasks
- **Auto-restart**: Failed workers are automatically restarted

### Usage

#### Starting the Orchestrator
```bash
# Production mode
npm run orchestrator:start

# Development mode
npm run orchestrator:dev

# Auto-solve mode
npm run orchestrator:autosolve
```

#### Health Monitoring
```bash
# Check orchestrator health
npm run orchestrator:health

# View worker status
curl http://localhost:8099/health | jq
```

#### GPU Worker Management
```bash
# Build CUDA workers
npm run orchestrator:build-cuda

# Check environment
npm run orchestrator:check-env

# Start Redis service for orchestrator
npm run orchestrator:redis-service
```

### Configuration

#### Environment Variables
```bash
# Set in .env
WORKER_MODE=production
AUTO_SOLVE_ENABLED=true
CUDA_WORKER_PATH=./cuda-worker/cuda-worker.exe
MAX_WORKERS=8
```

#### Worker Configuration
- **Auto-scaling**: Based on CPU cores available
- **Health checks**: Every 60 seconds
- **Restart policy**: Automatic on failure
- **Grace period**: 10 seconds for shutdown

---

## Troubleshooting

### Common Issues

#### 1. Service Startup Failures

**PostgreSQL Connection Issues**
```bash
# Check if PostgreSQL is running
net start postgresql-x64-17

# Test connection
psql -U postgres -d legal_ai_db -c "SELECT version();"

# Reset password if needed
.\fix-postgres-password.bat
```

**Redis Connection Issues**
```bash
# Check Redis status
redis-cli ping

# If not running
redis-server

# Clear Redis cache if needed
redis-cli FLUSHALL
```

**Ollama Model Issues**
```bash
# Check Ollama status
curl http://localhost:11434/api/tags

# Restart Ollama
taskkill /f /im ollama.exe
ollama serve

# Repull model if corrupted
ollama pull gemma3-legal:latest
```

#### 2. GPU and CUDA Issues

**CUDA Not Detected**
```bash
# Check CUDA installation
nvidia-smi
nvcc --version

# Verify GPU is available
.\check_cuda_clang_simple.ps1
```

**GPU Memory Issues**
```bash
# Check GPU memory usage
nvidia-smi --query-gpu=memory.used,memory.total --format=csv

# Free GPU memory
taskkill /f /im ollama.exe
# Wait 30 seconds, then restart
ollama serve
```

#### 3. Frontend Build Issues

**TypeScript Errors**
```bash
# Quick fix common errors
npm run fix-typescript-errors

# Check for syntax issues
npm run check:ultra-fast

# Reset node_modules if needed
npm run clean:all
npm install
```

**Svelte 5 Compatibility**
```bash
# Validate Svelte 5 compliance
npm run validate:svelte5

# Fix Svelte-specific issues
npm run fix-svelte5-issues
```

#### 4. Port Conflicts

**Check Port Usage**
```cmd
# Check if ports are in use
netstat -an | findstr ":5173"
netstat -an | findstr ":8094"
netstat -an | findstr ":11434"

# Kill process using port (if needed)
taskkill /f /pid <PID>
```

### Diagnostic Tools

#### System Health Check
```bash
# Comprehensive system check
.\COMPREHENSIVE-PRODUCTION-VERIFICATION.ps1 -Command TestAll

# Quick status check
npm run status

# Service-specific checks
npm run health
```

#### Error Analysis
```bash
# Analyze errors automatically
npm run check:auto

# Generate error report
npm run check:log

# Auto-solve common issues
npm run autosolve:once
```

#### Performance Monitoring
```bash
# Monitor system resources
npm run monitor:lite

# GPU monitoring
npm run monitor:gpu

# Database performance
npm run db:health
```

### Log Files

#### Important Log Locations
- **Frontend Logs**: `sveltekit-frontend/logs/`
- **Go Service Logs**: `go-microservice/*.log`
- **Error Logs**: `error-logs/`
- **Build Logs**: `*-build.log`
- **Health Check Logs**: `npm-check-*.log`

#### Log Analysis
```bash
# View recent errors
type error-logs\check-full-*.log | findstr "ERROR"

# Monitor real-time logs
npm run logs:ws
```

---

## Performance Optimization

### GPU Optimization

#### CUDA Configuration
```bash
# Optimal settings for RTX 3060 Ti
export CUDA_VISIBLE_DEVICES=0
export OLLAMA_GPU_LAYERS=35
export OLLAMA_GPU_MEMORY="7168M"
```

#### GPU Memory Management
- **Monitor usage**: Use `nvidia-smi -l 1` for real-time monitoring
- **Batch processing**: Process documents in batches to optimize GPU utilization
- **Memory cleanup**: Restart Ollama periodically if memory fragmented

### Database Optimization

#### PostgreSQL Tuning
```sql
-- Optimize for vector operations
SET shared_buffers = '2GB';
SET effective_cache_size = '8GB';
SET work_mem = '256MB';
SET maintenance_work_mem = '1GB';

-- Vector-specific optimizations
SET max_parallel_workers_per_gather = 4;
SET max_parallel_workers = 8;
```

#### Redis Configuration
```bash
# Optimize Redis for caching
redis-cli CONFIG SET maxmemory 2gb
redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

### Frontend Performance

#### Build Optimization
```bash
# Production build
npm run build:prod

# Analyze bundle size
npm run analyze:bundle
```

#### Code Splitting and Lazy Loading
- Use dynamic imports for large components
- Implement route-based code splitting
- Lazy load AI models and heavy libraries

---

## Production Deployment

### Production Startup

#### Quick Production Start
```bash
# Complete production system
npm run prod:start

# Production verification
npm run prod:test

# Production status check
npm run prod:status
```

#### Advanced Production Setup
```powershell
# Full production integration
.\COMPREHENSIVE-PRODUCTION-INTEGRATION.ps1 -Command Start

# Production verification
.\COMPREHENSIVE-PRODUCTION-VERIFICATION.ps1 -Command TestAll
```

### Environment Configuration

#### Production Environment Variables
```bash
# .env.production
NODE_ENV=production
DATABASE_URL=postgresql://legal_admin:secure_password@localhost:5432/legal_ai_db
REDIS_URL=redis://localhost:6379
OLLAMA_HOST=http://localhost:11434
CUDA_VISIBLE_DEVICES=0
MAX_WORKERS=8
LOG_LEVEL=info
```

### Security Considerations

#### Database Security
- Use strong passwords for all database users
- Enable SSL connections for PostgreSQL
- Restrict database access to localhost only

#### API Security
- Implement rate limiting on all API endpoints
- Use CORS protection for frontend requests
- Validate and sanitize all input data

#### File Upload Security
- Scan uploaded files for malware
- Validate file types and sizes
- Store files in sandboxed directories

### Monitoring and Maintenance

#### Health Monitoring
```bash
# Continuous health monitoring
npm run monitor

# Set up automated health checks
npm run monitor:production
```

#### Backup Procedures
```bash
# Database backup
npm run db:backup

# System backup
npm run production:backup
```

#### Log Management
- Rotate logs daily
- Archive old logs to external storage
- Monitor error rates and performance metrics

---

## Support and Resources

### Documentation
- **System Status**: Check `CLAUDE.md` for current implementation status
- **API Documentation**: Generated automatically from TypeScript definitions
- **Component Library**: Storybook documentation (if available)

### Development Tools
- **VS Code Extensions**: Svelte, TypeScript, Tailwind CSS
- **Browser DevTools**: Vue/Svelte devtools for component inspection
- **Database Tools**: Drizzle Studio, pgAdmin

### Community and Support
- **Issue Tracking**: Use project issue tracker for bugs and feature requests
- **Contributing**: See CONTRIBUTING.md for development guidelines
- **License**: MIT License - see LICENSE file

---

## Conclusion

The Legal AI Platform is a comprehensive, production-ready system that combines modern web technologies with AI/ML capabilities. This guide provides the foundation for successful deployment, development, and maintenance of the platform.

For additional support or questions, refer to the documentation files in the project root or consult the system status in `CLAUDE.md`.

**System Status**: ✅ **PRODUCTION READY - FULLY VERIFIED**

---

*Last Updated: August 15, 2025*
*Version: 4.0.0*
*Status: Production Ready*