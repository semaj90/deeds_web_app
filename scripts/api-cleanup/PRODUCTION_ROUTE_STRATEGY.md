# Production Route Categorization & Fix Strategy

## Overview

This document defines the production-ready API route strategy for the YoRHa Legal AI Platform. It categorizes all 1069 API routes into production-critical, experimental, and test categories, with specific fixes and Docker/env configuration for each.

## Route Categories

### 1. CORE PRODUCTION ROUTES (MUST KEEP & FIX)

These routes are essential for the platform's core functionality and must be production-ready.

#### Authentication & Authorization
- `/api/auth/login` - User login
- `/api/auth/logout` - User logout
- `/api/auth/register` - User registration
- `/api/auth/refresh` - Token refresh
- `/api/auth/verify` - Token verification
- `/api/auth/password-reset` - Password reset
- `/api/auth/profile` - User profile management

#### Case Management
- `/api/cases/list` - List all cases
- `/api/cases/create` - Create new case
- `/api/cases/[id]` - Get case details
- `/api/cases/[id]/update` - Update case
- `/api/cases/[id]/delete` - Delete case
- `/api/cases/[id]/status` - Update case status
- `/api/cases/[id]/assign` - Assign case to user

#### Evidence Management
- `/api/evidence/list` - List evidence
- `/api/evidence/create` - Create evidence entry
- `/api/evidence/[id]` - Get evidence details
- `/api/evidence/[id]/update` - Update evidence
- `/api/evidence/[id]/delete` - Delete evidence
- `/api/evidence/[id]/connections` - Get evidence connections
- `/api/evidence/[id]/relationships` - Manage relationships

#### Search & Retrieval
- `/api/search/semantic` - Semantic search
- `/api/search/full-text` - Full-text search
- `/api/search/advanced` - Advanced search with filters
- `/api/search/suggestions` - Search suggestions
- `/api/search/history` - Search history

#### Document Processing
- `/api/documents/upload` - Upload document
- `/api/documents/list` - List documents
- `/api/documents/[id]` - Get document
- `/api/documents/[id]/extract` - Extract text from document
- `/api/documents/[id]/ocr` - OCR processing
- `/api/documents/[id]/analyze` - AI analysis

#### User Management
- `/api/users/list` - List users (admin)
- `/api/users/create` - Create user (admin)
- `/api/users/[id]` - Get user details
- `/api/users/[id]/update` - Update user
- `/api/users/[id]/delete` - Delete user (admin)
- `/api/users/[id]/permissions` - Manage permissions

#### Health & Status
- `/api/health` - Health check
- `/api/health/db` - Database health
- `/api/health/cache` - Cache health
- `/api/health/services` - Services status

#### Embeddings & RAG
- `/api/embeddings/create` - Create embeddings
- `/api/embeddings/search` - Search embeddings
- `/api/embeddings/batch` - Batch embeddings
- `/api/rag/query` - RAG query
- `/api/rag/retrieve` - Retrieve documents
- `/api/rag/rerank` - Rerank results

#### AI Features
- `/api/ai/analyze` - AI analysis
- `/api/ai/summarize` - Document summarization
- `/api/ai/extract-entities` - Entity extraction
- `/api/ai/legal-insights` - Legal insights

#### Upload & File Management
- `/api/upload/file` - File upload
- `/api/upload/batch` - Batch upload
- `/api/upload/status` - Upload status

### 2. EXPERIMENTAL ROUTES (CAN DISABLE)

These routes are for experimental features and can be disabled in production.

- `/api/experimental/*` - All experimental features
- `/api/beta/*` - Beta features
- `/api/preview/*` - Preview features
- `/api/v2/*` - API v2 (if not stable)

### 3. TEST & DEBUG ROUTES (MUST DISABLE)

These routes should never be in production.

- `/api/test/*` - All test routes
- `/api/debug/*` - Debug endpoints
- `/api/dev/*` - Development endpoints
- `/api/mock/*` - Mock data endpoints
- `/api/phase*/*` - Phase-specific routes
- `/api/internal/*` - Internal-only routes

## Production Fixes Required

### 1. Error Handling
All core routes must have:
- Try-catch blocks
- Proper HTTP status codes (400, 401, 403, 404, 500)
- Structured error responses
- Error logging

### 2. Authentication & Authorization
All core routes must:
- Verify JWT tokens
- Check user permissions
- Validate request ownership
- Log access attempts

### 3. Input Validation
All core routes must:
- Validate request body schema
- Sanitize user input
- Check file types/sizes
- Validate query parameters

### 4. Response Format
All core routes must:
- Return consistent JSON structure
- Include proper Content-Type headers
- Include CORS headers
- Include rate-limiting headers

### 5. Logging & Monitoring
All core routes must:
- Log all requests
- Track performance metrics
- Monitor error rates
- Alert on failures

### 6. SvelteKit 2 Compatibility
All routes must:
- Use `+server.ts` for API endpoints
- Use proper request/response types
- Handle streaming responses
- Support form data and JSON

## Docker & Environment Configuration

### Environment Variables (Enhanced .env)

```env
# API Configuration
API_VERSION=v1
API_BASE_URL=http://localhost:5173/api
API_TIMEOUT=30000
API_RATE_LIMIT=100

# Authentication
JWT_SECRET=your-secret-key-here
JWT_EXPIRY=24h
SESSION_TIMEOUT=3600

# Database
DATABASE_URL=postgresql://legal_admin:123456@postgres:5432/legal_ai_db
DATABASE_POOL_SIZE=20
DATABASE_TIMEOUT=5000

# Cache
REDIS_URL=redis://valkey:6379/0
CACHE_TTL=3600
CACHE_MAX_SIZE=1000

# Search
QDRANT_URL=http://qdrant:6333
QDRANT_TIMEOUT=5000

# Storage
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=minio
MINIO_SECRET_KEY=minio123
MINIO_BUCKET=legal-documents

# AI/ML
OLLAMA_URL=http://host.docker.internal:11434
GEMMA_MODEL=gemma3-legal
EMBEDDING_MODEL=nomic-embed-text

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
LOG_FILE=/var/log/api.log

# Monitoring
ENABLE_METRICS=true
METRICS_PORT=9090
ENABLE_TRACING=true

# Feature Flags
ENABLE_RAG=true
ENABLE_EMBEDDINGS=true
ENABLE_OCR=true
ENABLE_SEMANTIC_SEARCH=true
```

### Docker Compose Updates

The frontend service should:
1. Mount the cleaned API routes
2. Use proper environment variables
3. Include health checks
4. Set resource limits
5. Configure logging

### SvelteKit 2 Configuration

All routes must follow SvelteKit 2 patterns:
- Use `+server.ts` for API endpoints
- Export `GET`, `POST`, `PUT`, `DELETE` functions
- Use `RequestEvent` type
- Return `Response` objects
- Handle errors with `error()` helper

## Implementation Phases

### Phase 1: Route Categorization (DONE)
- Scan all 1069 routes
- Categorize into core/experimental/test
- Identify corruption issues
- Create categorization manifest

### Phase 2: Core Route Fixes (IN PROGRESS)
- Fix all core production routes
- Add error handling
- Add authentication checks
- Add input validation
- Ensure SvelteKit 2 compatibility

### Phase 3: Docker & Environment Setup
- Update docker-compose.yml
- Create production .env
- Configure health checks
- Set up logging

### Phase 4: Testing & Validation
- Run build validation
- Test all core routes
- Verify error handling
- Check performance

### Phase 5: Deployment
- Create deployment guide
- Document recovery procedures
- Set up monitoring
- Enable production logging

## Success Criteria

✅ All core routes are production-ready
✅ All routes have proper error handling
✅ All routes are SvelteKit 2 compatible
✅ Docker environment is properly configured
✅ Build succeeds without errors
✅ All health checks pass
✅ Performance meets requirements (sub-100ms latency)

## Next Steps

1. Execute cleanup pipeline on actual codebase
2. Analyze cleanup results
3. Fix core production routes
4. Update Docker configuration
5. Run build validation
6. Deploy to production

---

Generated: 2025-12-14
