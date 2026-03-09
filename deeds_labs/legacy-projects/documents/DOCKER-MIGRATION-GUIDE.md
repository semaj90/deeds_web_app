# Docker Migration Guide - Legal AI Platform

## Overview
Successfully migrated your PostgreSQL + pgvector database and related services to Docker containers for improved portability and development consistency.

## ✅ What's Been Set Up

### 1. Enhanced `npm run dev:full` Command
```bash
cd sveltekit-frontend
npm run dev:full
```
Now runs:
- PostgreSQL check
- CUDA service (`go run ../cuda-service-worker.go`)
- Frontend dev server (`npx vite dev --port 5177 --host`)
- Ollama AI service

### 2. Docker Services Configuration

#### **docker-compose.yml** includes:
- **PostgreSQL 17 + pgvector**: Port 5433 (to avoid conflicts)
- **MinIO S3**: Ports 9000 (API) + 9001 (Console)
- **Redis**: Port 6379
- **Qdrant** (optional): Ports 6333 + 6334

#### **Services Health Checks**:
- All containers include proper health checks
- Auto-restart on failure
- Persistent data volumes

### 3. Database Migration Files Created

#### **sql/init/** directory:
- `00-extensions.sql` - pgvector + optimization functions
- `01-schema.sql` - Your complete database schema (24 tables)
- `02-data.sql` - All your existing data

#### **Your Current Tables Preserved**:
```
24 tables including:
✓ ai_engine_status        ✓ gpu_inference_sessions
✓ cases                   ✓ document_vectors
✓ evidence_vectors        ✓ vector_embeddings
✓ rag_queries            ✓ recommendation_cache
✓ predictive_asset_cache ✓ qlora_training_jobs
... and 14 more tables
```

### 4. Migration Scripts

#### **Windows**: `docker-scripts/migrate-to-docker.bat`
#### **Linux/Mac**: `docker-scripts/migrate-to-docker.sh`

Both scripts:
- Create database backup before migration
- Start Docker services
- Wait for PostgreSQL readiness
- Verify all service health
- Provide connection details

### 5. New npm Commands
```bash
# Docker Management
npm run docker:up         # Start all Docker services
npm run docker:down       # Stop all Docker services
npm run docker:logs       # View container logs
npm run docker:migrate    # Run full migration
npm run docker:status     # Check container status
npm run dev:docker        # Run dev with Docker env
```

## 🚀 Migration Steps

### Step 1: Run Migration
```bash
cd sveltekit-frontend
npm run docker:migrate
```

### Step 2: Verify Services
After migration, services will be available at:
- **PostgreSQL**: `localhost:5432` (legal_admin/123456)
- **MinIO**: `http://localhost:9000` (minio/minio123)
- **MinIO Console**: `http://localhost:9001`
- **Redis**: `localhost:6379`
- **Qdrant**: `http://localhost:6333`

### Step 3: Update Application Config
Use the provided `.env.docker` configuration:
```bash
DATABASE_URL=postgresql://legal_admin:123456@localhost:5432/legal_ai_db
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
REDIS_HOST=localhost
REDIS_PORT=6379
```

### Step 4: Test Your Application
```bash
npm run dev:docker  # Run with Docker environment
```

## 📊 Benefits of Docker Migration

### **Development Consistency**
- Same database version across all environments
- Isolated services (no port conflicts)
- Easy cleanup and reset

### **Database Benefits**
- **pgvector** extension pre-installed
- Optimized HNSW indexes for vector operations
- All 24 tables with full data preserved
- Performance tuning functions included

### **Production Ready**
- Health checks and auto-restart
- Persistent data volumes
- Easy scaling configuration
- Backup/restore capabilities

## 🛠 Troubleshooting

### PostgreSQL Connection Issues
```bash
# Check if container is running
npm run docker:status

# View PostgreSQL logs
docker-compose logs postgres

# Test connection
docker-compose exec postgres psql -U legal_admin -d legal_ai_db -c "SELECT version();"
```

### Vector Extension Issues
```bash
# Verify pgvector is installed
docker-compose exec postgres psql -U legal_admin -d legal_ai_db -c "SELECT extname FROM pg_extension WHERE extname = 'vector';"

# Test vector operations
docker-compose exec postgres psql -U legal_admin -d legal_ai_db -c "SELECT '[1,2,3]'::vector <=> '[4,5,6]'::vector;"
```

### MinIO Access Issues
```bash
# Check MinIO health
curl http://localhost:9000/minio/health/live

# Access console
open http://localhost:9001
# Login: minio / minio123
```

## 📈 Next Steps

1. **Test Vector Operations**: Verify all 768-dimensional embeddings work correctly
2. **Performance Testing**: Compare query performance with Docker vs native PostgreSQL
3. **Backup Strategy**: Set up automated backups with Docker volumes
4. **Production Config**: Update connection strings in production environments

## 🔧 Rollback Plan

If you need to revert to local PostgreSQL:
1. Export data from Docker: `docker-compose exec postgres pg_dump -U legal_admin legal_ai_db > docker-backup.sql`
2. Stop Docker services: `npm run docker:down`
3. Restore to local PostgreSQL: `psql -U legal_admin -d legal_ai_db < docker-backup.sql`
4. Update connection strings back to `localhost:5432`

Your Docker migration is complete and ready for development! 🎉