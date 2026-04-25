# Production Testing Guide
## Comprehensive E2E Testing for Legal AI Platform

This guide explains how to use the production-ready testing framework to validate all routes, components, database operations, and native Windows services.

---

## 🎯 **Quick Start**

### Run Complete Production Validation
```bash
# Complete production readiness check (recommended)
npm run validate:production

# Individual test suites
npm run test:api          # Test all API endpoints
npm run test:production   # Test services, routes, performance
npm run test:e2e         # Run Playwright E2E tests
```

---

## 🧪 **Test Suites Overview**

### 1. Complete Production Validation
**Command:** `npm run validate:production`

**What it tests:**
- ✅ Windows services health (PostgreSQL, Redis, MinIO, etc.)
- ✅ Database integrity and schema validation
- ✅ All API endpoints with database verification
- ✅ Route accessibility and rendering
- ✅ End-to-end user workflows
- ✅ Performance benchmarks

**Output:** `production-readiness-report.json`

### 2. API Endpoint Testing
**Command:** `npm run test:api`

**What it tests:**
- Authentication endpoints (register, login, session)
- CRUD operations (cases, users, evidence)
- Vector search and AI endpoints
- File upload functionality
- Real-time messaging endpoints
- Database synchronization with Drizzle ORM

**Output:** `api-test-report.json`

### 3. Production Test Suite
**Command:** `npm run test:production`

**What it tests:**
- Service connectivity and health
- Route loading and error handling
- Database operations and migrations
- Performance metrics
- Service integration

**Output:** `production-test-report.json`

---

## 📋 **Prerequisites**

### Required Services Running
Before running tests, ensure these services are running:

```bash
# Check service status
Get-Service postgresql-x64-17, Memurai, MinIO, Neo4j, Ollama, NATS

# Or use the health check script
powershell -ExecutionPolicy Bypass -File check-services-health.ps1
```

### Environment Variables
Ensure your `.env` file contains:
```env
DATABASE_URL="postgresql://postgres:123456@localhost:5432/legal_ai_db"
REDIS_URL="redis://localhost:6379"
MINIO_ENDPOINT="localhost:9000"
NEO4J_URL="bolt://localhost:7687"
OLLAMA_HOST="http://localhost:11434"
NATS_URL="nats://legal_ai_client:legal_ai_2024@localhost:4222"
```

---

## 🎮 **Test Categories**

### Authentication Flow Tests
- User registration with database verification
- Login/logout functionality
- Session management
- Protected route access control

### CRUD Operation Tests
- **Cases:** Create → Read → Update → Delete → Verify in DB
- **Evidence:** Upload → Process → Search → Archive
- **Users:** Registration → Profile update → Permissions
- **Documents:** Upload → OCR → Index → Search

### Vector Search & AI Tests
- Embedding generation (384D vectors)
- Similarity search with pgvector
- RAG query processing
- AI chat functionality
- Document analysis

### Database Integrity Tests
- Schema validation
- Foreign key constraints  
- Transaction rollback
- Migration status
- Index optimization

### Performance Tests
- Page load times (<5s budget)
- API response times (<1s budget)
- Database query performance
- Large file upload handling

---

## 📊 **Understanding Test Results**

### Status Indicators
- ✅ **PASSED**: Test completed successfully
- ❌ **FAILED**: Critical issue requiring immediate attention
- ⚠️ **WARNING**: Non-critical issue or performance concern

### Production Readiness Criteria
For production deployment, you need:
- **0 failed tests**
- **All critical services operational**
- **Database schema up-to-date**
- **API endpoints responding correctly**
- **Performance within budgets**

### Example Success Output
```
🎯 PRODUCTION READINESS REPORT
================================
✅ Passed Phases: 6/6
❌ Failed Phases: 0/6
⚠️ Warning Phases: 0/6
⏱️ Total Time: 45s

🎉 PRODUCTION READY! All systems operational.
Your Legal AI platform is ready for production deployment.
```

---

## 🔧 **Troubleshooting**

### Common Issues

**1. Database Connection Failed**
```bash
# Check PostgreSQL service
Get-Service postgresql-x64-17
# Restart if needed
Restart-Service postgresql-x64-17
```

**2. API Endpoints Returning 500 Errors**
```bash
# Check server logs
npm run logs:all
# Restart development server
npm run dev:full
```

**3. Vector Search Tests Failing**
```bash
# Verify pgvector extension
psql -U postgres -d legal_ai_db -c "\dx"
# Should show 'vector' extension
```

**4. Performance Tests Failing**
```bash
# Check system resources
Get-Process | Where {$_.ProcessName -like "*node*" -or $_.ProcessName -like "*postgres*"}
# Restart services if high memory usage
```

**5. E2E Tests Timing Out**
```bash
# Increase timeouts in playwright.config.ts
# Check if services are responding
npm run services:health
```

---

## 🚀 **CI/CD Integration**

### Pre-commit Hook
```bash
# Add to your pre-commit hook
npm run test:quick && npm run test:api
```

### Pre-deployment Validation
```bash
# Full validation before production deployment
npm run validate:production
if ($LASTEXITCODE -ne 0) {
    Write-Error "Production validation failed. Do not deploy."
    exit 1
}
```

### Automated Monitoring
```bash
# Set up periodic health checks
# Run every 5 minutes in production
*/5 * * * * cd /path/to/app && npm run test:production
```

---

## 📈 **Performance Budgets**

### Page Load Times
- Homepage: <3 seconds
- Dashboard: <5 seconds  
- Search results: <2 seconds

### API Response Times
- Health checks: <500ms
- Database queries: <1 second
- Vector searches: <2 seconds
- AI responses: <10 seconds

### Database Operations
- Simple queries: <100ms
- Complex joins: <500ms
- Vector similarity: <200ms
- Bulk operations: <2 seconds

---

## 📝 **Test Reports**

### Generated Reports
- `production-readiness-report.json` - Complete validation results
- `api-test-report.json` - API endpoint testing results  
- `production-test-report.json` - Service and performance results
- `test-results/results.json` - Playwright E2E results

### Report Structure
```json
{
  "timestamp": "2025-01-XX",
  "duration": 45,
  "summary": {
    "passed": 42,
    "failed": 0,
    "warnings": 2,
    "total": 44
  },
  "productionReady": true,
  "recommendations": [
    "System is production-ready",
    "Set up production monitoring"
  ]
}
```

---

## 🎯 **Next Steps After Testing**

### If All Tests Pass ✅
1. Deploy to production environment
2. Set up monitoring and alerts
3. Implement automated backups
4. Configure production security

### If Tests Fail ❌
1. Review detailed error reports
2. Fix critical issues first
3. Re-run validation
4. Address warnings for optimal performance

### Performance Optimization
1. Monitor slow queries in reports
2. Optimize database indexes
3. Implement caching strategies
4. Consider CDN for static assets

---

## 🤝 **Support**

If tests reveal issues:
1. Check the detailed JSON reports
2. Review service logs: `npm run logs:all`
3. Verify service status: `npm run services:status`
4. Run individual test suites for debugging

**Your Legal AI platform testing framework is now production-ready!** 🎉