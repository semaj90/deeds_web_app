# Legal AI Platform - Database Startup Guide

## 🚀 Quick Start (Windows Native)

### Option 1: One-Click Startup
```cmd
START-ALL-DATABASES.bat
```
This will:
1. ✅ Start PostgreSQL, Redis, Neo4j services
2. ✅ Test all database connections
3. ✅ Launch SvelteKit with full connectivity

### Option 2: Manual Step-by-Step

#### 1. Copy Environment Configuration
```cmd
copy .env.database-ready .env
```

#### 2. Start Database Services
```cmd
# PostgreSQL
net start postgresql-x64-17

# Redis  
redis-server --port 6379

# Neo4j (optional)
net start neo4j
```

#### 3. Test Database Connectivity
```cmd
npm run dev
```
Then visit: http://localhost:5173/api/test-db

---

## 🔧 Database Configuration

### PostgreSQL Setup
- **Host**: localhost:5432
- **Database**: legal_ai_db
- **User**: postgres
- **Password**: 123456
- **Connection**: `postgresql://postgres:123456@localhost:5432/legal_ai_db`

### Redis Setup
- **Host**: localhost:6379
- **No password required for local dev**
- **Connection**: `redis://localhost:6379`

### Neo4j Setup (Optional)
- **Host**: localhost:7687
- **User**: neo4j
- **Password**: password
- **Browser**: http://localhost:7474

---

## 🧪 Testing CRUD Operations

### Database Health Check
```
GET http://localhost:5173/api/test-db
```

Expected Response:
```json
{
  "overall": {
    "success": true,
    "readyForCRUD": true,
    "message": "6/6 tests passed"
  },
  "tests": {
    "postgresql": { "success": true },
    "casesTable": { "success": true, "count": 0 },
    "evidenceTable": { "success": true, "count": 0 },
    "legalDocuments": { "success": true, "count": 5 },
    "pgvector": { "success": true }
  }
}
```

### Cases API
```
GET /api/v1/cases - List cases (requires auth)
POST /api/v1/cases - Create case (requires auth)
```

### Evidence API
```
GET /api/v1/evidence - List evidence (requires auth)
POST /api/v1/evidence - Create evidence (requires auth)
```

---

## 🐛 Troubleshooting

### PostgreSQL Not Starting
```cmd
# Check service status
sc query postgresql-x64-17

# Start manually
net start postgresql-x64-17

# Test connection
psql -h localhost -p 5432 -U postgres -d legal_ai_db -c "SELECT 1;"
```

### Redis Connection Issues
```cmd
# Check if Redis is running
tasklist | findstr redis-server

# Start Redis
redis-server --port 6379

# Test connection
redis-cli ping
```

### CRUD Endpoints Failing
1. ✅ Check `/api/test-db` - All tests should pass
2. ✅ Verify authentication (login required for CRUD)
3. ✅ Check browser console for errors
4. ✅ Check SvelteKit terminal output

### Common Issues & Fixes

**Issue**: `column "evidence_id" does not exist`
**Fix**: ✅ Already fixed - columns added manually

**Issue**: `invalid input syntax for type uuid`
**Fix**: ✅ Already fixed - ingestion worker updated

**Issue**: Database connection timeout
**Fix**: Ensure PostgreSQL service is running

---

## 🎯 Admin Interfaces

### Database Administration
- **pgAdmin**: http://localhost:5050 (if installed)
- **Redis Insight**: http://localhost:8001 (if installed)
- **Neo4j Browser**: http://localhost:7474

### Application Monitoring
- **SvelteKit Dev**: http://localhost:5173
- **Database Test**: http://localhost:5173/api/test-db
- **Health Check**: http://localhost:5173/api/health (if available)

---

## ✅ Verification Checklist

- [ ] PostgreSQL service running (port 5432)
- [ ] Redis server running (port 6379) 
- [ ] Neo4j service running (port 7687)
- [ ] `/api/test-db` returns success: true
- [ ] `legal_documents` table has records
- [ ] `pgvector` extension available
- [ ] SvelteKit dev server running (port 5173)
- [ ] No console errors in browser

## 🚀 Next Steps

Once all databases are connected:

1. **Test Document Upload**: Upload a PDF via the UI
2. **Test Vector Search**: Try semantic search queries  
3. **Test Case Creation**: Create a new legal case
4. **Test Evidence Management**: Add evidence to cases
5. **Test AI Chat**: Use the legal AI assistant

Your CRUD operations should now work perfectly with full database connectivity! 🎉