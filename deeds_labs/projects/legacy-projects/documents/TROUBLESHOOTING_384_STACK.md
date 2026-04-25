# 384-Dimension Vector Stack - Troubleshooting Guide

**Quick Reference for Common Issues**

---

## 🚨 Service Health Status

### Check All Services
```bash
docker-compose -f docker-compose-full-stack-384.yml ps
```

**Expected Output:**
```
NAME                  STATUS
legal-postgres-384    Up (healthy)
legal-qdrant-384      Up (healthy)
legal-redis-384       Up (healthy)
legal-rabbitmq-384    Up (healthy)
legal-neo4j-384       Up (healthy)
legal-minio-384       Up (healthy)
```

---

## ❌ Common Issues & Solutions

### 1. Qdrant "unhealthy" Status

**Symptom:**
```bash
legal-qdrant-384      Up (unhealthy)
```

**Solution:**
```bash
# Wait 30 seconds for startup
sleep 30 && docker-compose -f docker-compose-full-stack-384.yml ps

# Check logs
docker logs legal-qdrant-384

# Restart if needed
docker-compose -f docker-compose-full-stack-384.yml restart qdrant

# Verify health
curl http://localhost:6333/health
```

**Expected Output:**
```json
{"title":"qdrant - vector search engine","version":"1.x.x"}
```

---

### 2. Redis Connection Refused

**Symptom:**
```
Error: Redis connection refused
Could not connect to Redis at 127.0.0.1:6379
```

**Solution:**
```bash
# Check Redis is running
docker ps | grep redis

# Test connection
redis-cli -a redis ping

# Expected: PONG

# Check password
redis-cli -a redis INFO server | grep redis_version

# Restart Redis
docker-compose -f docker-compose-full-stack-384.yml restart redis
```

**Expected Output:**
```
PONG
redis_version:7.x.x
```

---

### 3. PostgreSQL Permission Errors

**Symptom:**
```
ERROR: must be owner of table XXX
```

**Solution:**
```bash
# Connect as superuser
docker exec -it legal-postgres-384 psql -U postgres -d legal_ai_db

# Grant ownership
ALTER TABLE case_summary_vectors OWNER TO legal_admin;
ALTER TABLE document_vectors OWNER TO legal_admin;
ALTER TABLE evidence_vectors OWNER TO legal_admin;
ALTER TABLE knowledge_nodes OWNER TO legal_admin;
ALTER TABLE query_vectors OWNER TO legal_admin;

# Exit
\q

# Re-run migration
PGPASSWORD=123456 psql -h localhost -U legal_admin -d legal_ai_db \
  -f sveltekit-frontend/src/lib/server/db/migrations/010_standardize_vectors_384.sql
```

**Expected Output:**
```
ALTER TABLE
CREATE INDEX
COMMENT
```

---

### 4. Ollama embeddinggemma:latest Not Found

**Symptom:**
```
⚠️ embeddinggemma:latest not found
```

**Solution:**
```bash
# Pull the model
ollama pull embeddinggemma:latest

# Verify
ollama list | grep embeddinggemma

# Test embedding generation
curl -X POST http://localhost:11434/api/embeddings \
  -d '{"model":"embeddinggemma:latest","prompt":"test"}' | jq '.embedding | length'
```

**Expected Output:**
```
embeddinggemma:latest    276 MB
384
```

---

### 5. Docker Desktop Not Running

**Symptom:**
```
Cannot connect to the Docker daemon
```

**Solution:**
```bash
# Windows: Start Docker Desktop from Start Menu
# Or: Open Docker Desktop application

# Verify Docker is running
docker info

# Start services
docker-compose -f docker-compose-full-stack-384.yml up -d
```

**Expected Output:**
```
Server Version: 24.x.x
```

---

### 6. Port Already in Use

**Symptom:**
```
Error: Bind for 0.0.0.0:5432 failed: port is already allocated
```

**Solution:**
```bash
# Find process using port
netstat -ano | findstr :5432

# Stop existing service
docker-compose -f docker-compose-full-stack-384.yml down

# Or: Change port in docker-compose-full-stack-384.yml
# ports:
#   - "5433:5432"  # Change external port

# Restart services
docker-compose -f docker-compose-full-stack-384.yml up -d
```

---

### 7. Embedding Dimension Mismatch

**Symptom:**
```
Expected 384 dimensions, got 768
```

**Solution:**
```bash
# Verify model dimensions
curl -X POST http://localhost:11434/api/embeddings \
  -d '{"model":"embeddinggemma:latest","prompt":"test"}' | jq '.embedding | length'

# Should return: 384

# If wrong model, ensure you're using embeddinggemma:latest
ollama list
ollama pull embeddinggemma:latest
```

**Expected Output:**
```
384
```

---

### 8. Qdrant Collection Not Found

**Symptom:**
```
Collection 'legal_documents_384' not found
```

**Solution:**
```bash
# Initialize collections
cd sveltekit-frontend
npm install -g tsx
tsx src/lib/server/vector/qdrant-init-384.ts

# Verify collections
curl http://localhost:6333/collections | jq '.result.collections[].name'
```

**Expected Output:**
```
"legal_documents_384"
"case_embeddings_384"
"evidence_384"
"rag_documents_384"
"chat_messages_384"
"knowledge_base_384"
```

---

### 9. RabbitMQ Management UI Not Accessible

**Symptom:**
```
Cannot access http://localhost:15672
```

**Solution:**
```bash
# Check RabbitMQ is running
docker ps | grep rabbitmq

# Check logs
docker logs legal-rabbitmq-384

# Restart
docker-compose -f docker-compose-full-stack-384.yml restart rabbitmq

# Wait for startup
sleep 30

# Access UI
open http://localhost:15672
# Login: guest / guest
```

**Expected Output:**
```
RabbitMQ Management UI loads
```

---

### 10. Neo4j Connection Failed

**Symptom:**
```
Neo4j connection refused
```

**Solution:**
```bash
# Check Neo4j is running
docker ps | grep neo4j

# Check logs
docker logs legal-neo4j-384

# Wait for startup (Neo4j takes ~60 seconds)
sleep 60

# Test connection
curl http://localhost:7474

# Or use cypher-shell
docker exec -it legal-neo4j-384 cypher-shell -u neo4j -p password
```

**Expected Output:**
```
Connected to Neo4j at bolt://localhost:7687
neo4j@neo4j>
```

---

## 🔧 Complete Service Reset

If nothing else works, perform a complete reset:

```bash
# 1. Stop all services
docker-compose -f docker-compose-full-stack-384.yml down

# 2. Remove volumes (⚠️  DATA LOSS!)
docker volume rm deeds-web-app_postgres-data-384
docker volume rm deeds-web-app_qdrant-data-384
docker volume rm deeds-web-app_redis-data-384
docker volume rm deeds-web-app_rabbitmq-data-384
docker volume rm deeds-web-app_neo4j-data-384
docker volume rm deeds-web-app_minio-data-384

# 3. Re-deploy
./deploy-384-vector-stack.sh

# 4. Verify
./test-384-vector-stack.sh
```

---

## 📊 Service-Specific Health Checks

### PostgreSQL
```bash
PGPASSWORD=123456 psql -h localhost -U legal_admin -d legal_ai_db -c "SELECT 1;"
# Expected: (1 row)

PGPASSWORD=123456 psql -h localhost -U legal_admin -d legal_ai_db -c "SELECT extname FROM pg_extension WHERE extname = 'vector';"
# Expected: vector
```

### Qdrant
```bash
curl http://localhost:6333/health
# Expected: {"title":"qdrant - vector search engine","version":"..."}

curl http://localhost:6333/collections
# Expected: {"result":{"collections":[...]}}
```

### Redis
```bash
redis-cli -a redis ping
# Expected: PONG

redis-cli -a redis INFO server | head -n 10
# Expected: redis_version:7.x.x
```

### RabbitMQ
```bash
curl -u guest:guest http://localhost:15672/api/overview
# Expected: {"management_version":"..."}
```

### Neo4j
```bash
curl -u neo4j:password http://localhost:7474/db/data/
# Expected: {"neo4j_version":"5.x.x"}
```

### MinIO
```bash
curl http://localhost:9000/minio/health/live
# Expected: (empty response = healthy)
```

### Ollama
```bash
curl http://localhost:11434/api/tags
# Expected: {"models":[{"name":"embeddinggemma:latest",...}]}
```

---

## 🐛 Debugging Commands

### View all container logs
```bash
docker-compose -f docker-compose-full-stack-384.yml logs -f
```

### View specific service logs
```bash
docker logs legal-postgres-384 --tail 100 -f
docker logs legal-qdrant-384 --tail 100 -f
docker logs legal-redis-384 --tail 100 -f
```

### Check container resource usage
```bash
docker stats
```

### Inspect container
```bash
docker inspect legal-postgres-384
docker inspect legal-qdrant-384
```

### Execute commands in container
```bash
docker exec -it legal-postgres-384 bash
docker exec -it legal-redis-384 redis-cli -a redis
docker exec -it legal-qdrant-384 sh
```

---

## 📞 Getting Help

### 1. Run Diagnostics
```bash
./test-384-vector-stack.sh > diagnostics.log 2>&1
```

### 2. Collect Service Logs
```bash
docker-compose -f docker-compose-full-stack-384.yml logs > service-logs.txt
```

### 3. Check Environment
```bash
# Verify .env file
cat sveltekit-frontend/.env.384-production

# Check environment variables
env | grep -E "(DATABASE|QDRANT|REDIS|OLLAMA|RABBITMQ|NEO4J|MINIO)"
```

### 4. Review Documentation
- **Full Guide:** `VECTOR_384_MIGRATION_COMPLETE.md`
- **Quick Start:** `VECTOR_384_QUICK_START.md`
- **Backend Report:** `BACKEND_INTEGRATION_WIRING_REPORT.md`

---

## ✅ Verification Checklist

After fixing issues, verify with:

```bash
# 1. All services healthy
docker-compose -f docker-compose-full-stack-384.yml ps

# 2. Run full test suite
./test-384-vector-stack.sh

# 3. Test embedding generation
curl -X POST http://localhost:11434/api/embeddings \
  -d '{"model":"embeddinggemma:latest","prompt":"test"}' | jq '.embedding | length'

# 4. Test database connection
PGPASSWORD=123456 psql -h localhost -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM legal_documents;"

# 5. Test Qdrant
curl http://localhost:6333/collections

# 6. Test Redis
redis-cli -a redis ping

# 7. Test RabbitMQ
curl -u guest:guest http://localhost:15672/api/overview

# 8. Test Neo4j
curl -u neo4j:password http://localhost:7474/db/data/

# 9. Test MinIO
curl http://localhost:9000/minio/health/live
```

All commands should succeed without errors.

---

**Last Updated:** 2025-10-17
**Version:** 1.0.0
