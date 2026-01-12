# 🐳 Docker Quick Start Guide
**Using Existing Containers - NO docker-compose**
**January 11, 2026**

---

## 🚀 Start All Services (One Command)

```powershell
# Start all existing containers
docker start phase66-postgres phase66-redis phase66-rabbitmq phase66-qdrant phase66-minio phase66-couchdb deeds-neo4j

# Verify running status
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

**Expected containers:**
- `phase66-postgres` - PostgreSQL 17 with pgvector (port 5434)
- `phase66-redis` - Redis Stack with RediSearch/RedisJSON (port 6379)
- `phase66-rabbitmq` - RabbitMQ with management (ports 5672, 15672)
- `phase66-qdrant` - Qdrant vector database (port 6333)
- `phase66-minio` - MinIO S3 storage (ports 9000-9001)
- `phase66-couchdb` - CouchDB JSON database (port 5984)
- `deeds-neo4j` - Neo4j graph database (ports 7474, 7687)

---

## 📊 Service Endpoints

| Service | Container | Port | Credentials |
|---------|-----------|------|-------------|
| **PostgreSQL** | `phase66-postgres` | 5434 | user:user, db:legal |
| **Redis** | `phase66-redis` | 6379 | (no auth) |
| **RabbitMQ AMQP** | `phase66-rabbitmq` | 5672 | guest:guest |
| **RabbitMQ UI** | `phase66-rabbitmq` | 15672 | guest:guest |
| **Qdrant** | `phase66-qdrant` | 6333 | (no auth) |
| **MinIO API** | `phase66-minio` | 9000 | minio:minio123 |
| **MinIO Console** | `phase66-minio` | 9001 | minio:minio123 |
| **CouchDB** | `phase66-couchdb` | 5984 | admin:admin |
| **Neo4j Browser** | `deeds-neo4j` | 7474 | neo4j:password |
| **Neo4j Bolt** | `deeds-neo4j` | 7687 | neo4j:password |

---

## 🔧 Common Docker Commands

### Check Container Status

```powershell
# List all containers
docker ps -a

# Filter by name
docker ps | Select-String "phase66|deeds"

# Check specific container health
docker inspect phase66-postgres --format='{{.State.Status}}'
```

### Execute Commands in Containers

#### PostgreSQL

```powershell
# Connect to psql
docker exec -it phase66-postgres psql -U user -d legal

# Run SQL directly
docker exec phase66-postgres psql -U user -d legal -c "SELECT version();"

# Check extensions
docker exec phase66-postgres psql -U user -d legal -c "\dx"

# Run SQL file
docker exec -i phase66-postgres psql -U user -d legal < my-script.sql
```

#### Redis

```powershell
# Connect to Redis CLI
docker exec -it phase66-redis redis-cli

# Run Redis commands
docker exec phase66-redis redis-cli DBSIZE
docker exec phase66-redis redis-cli KEYS "case:*"
docker exec phase66-redis redis-cli GET "some-key"

# Flush cache (DANGER: Deletes all data)
docker exec phase66-redis redis-cli FLUSHALL
```

#### RabbitMQ

```powershell
# List queues
docker exec phase66-rabbitmq rabbitmqctl list_queues

# List exchanges
docker exec phase66-rabbitmq rabbitmqctl list_exchanges

# Check cluster status
docker exec phase66-rabbitmq rabbitmqctl cluster_status

# Purge a queue
docker exec phase66-rabbitmq rabbitmqctl purge_queue "document-chunks"
```

#### Qdrant

```powershell
# Check collections
curl http://localhost:6333/collections

# Get collection info
curl http://localhost:6333/collections/phase89_code_units

# Search vectors (POST request)
$body = @{
    vector = @(0.1, 0.2, 0.3)  # Example vector
    limit = 10
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:6333/collections/my-collection/points/search" -Method POST -Body $body -ContentType "application/json"
```

#### MinIO

```powershell
# List buckets (using mc CLI)
docker exec phase66-minio mc ls local/

# Alternative: Use AWS CLI
aws --endpoint-url http://localhost:9000 s3 ls

# Upload file
aws --endpoint-url http://localhost:9000 s3 cp document.pdf s3://legal-documents/
```

#### CouchDB

```powershell
# List all databases
curl http://admin:admin@localhost:5984/_all_dbs

# Get database info
curl http://admin:admin@localhost:5984/legal-cases

# Query documents
curl http://admin:admin@localhost:5984/legal-cases/_all_docs?limit=10
```

#### Neo4j

```powershell
# Run Cypher query
docker exec deeds-neo4j cypher-shell -u neo4j -p password "MATCH (n) RETURN count(n);"

# Import data
docker exec deeds-neo4j neo4j-admin import --database=legal --nodes=Person.csv
```

---

## 🛑 Stop Services

```powershell
# Stop all containers
docker stop phase66-postgres phase66-redis phase66-rabbitmq phase66-qdrant phase66-minio phase66-couchdb deeds-neo4j

# Stop specific container
docker stop phase66-postgres
```

---

## 🔄 Restart Services

```powershell
# Restart all containers
docker restart phase66-postgres phase66-redis phase66-rabbitmq phase66-qdrant phase66-minio phase66-couchdb deeds-neo4j

# Restart specific container
docker restart phase66-redis
```

---

## 🧹 Maintenance Commands

### View Logs

```powershell
# Follow logs
docker logs -f phase66-postgres

# Last 100 lines
docker logs --tail 100 phase66-postgres

# Since timestamp
docker logs --since 2026-01-11T10:00:00 phase66-postgres
```

### Check Resource Usage

```powershell
# Container stats (CPU, memory, network)
docker stats

# Specific container
docker stats phase66-postgres
```

### Clean Up

```powershell
# Remove stopped containers
docker container prune

# Remove unused images
docker image prune

# Remove unused volumes (DANGER: Data loss)
docker volume prune

# Check disk usage
docker system df
```

---

## 🧪 Health Checks

```powershell
# PostgreSQL
docker exec phase66-postgres pg_isready -U user

# Redis
docker exec phase66-redis redis-cli PING

# RabbitMQ
docker exec phase66-rabbitmq rabbitmq-diagnostics ping

# Qdrant (HTTP)
curl http://localhost:6333/

# MinIO
curl http://localhost:9000/minio/health/live

# CouchDB
curl http://localhost:5984/_up

# Neo4j
curl http://localhost:7474/
```

---

## 🔐 Environment Variables (SvelteKit)

Add to `sveltekit-frontend/.env`:

```bash
# PostgreSQL (Note: Port 5434, not 5432)
DATABASE_URL=postgresql://user:user@localhost:5434/legal

# Redis
REDIS_URL=redis://localhost:6379

# RabbitMQ
RABBITMQ_URL=amqp://guest:guest@localhost:5672

# Qdrant
QDRANT_URL=http://localhost:6333

# MinIO
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minio
MINIO_SECRET_KEY=minio123
MINIO_USE_SSL=false

# CouchDB
COUCHDB_URL=http://admin:admin@localhost:5984

# Neo4j
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
```

---

## 🚀 Start Frontend

```powershell
cd sveltekit-frontend

# Install dependencies (first time)
npm install

# Start development server
npm run dev

# Or with QUIC/HTTP3
npm run dev:quic
```

**Frontend URL:** http://localhost:5175

---

## 📝 Common Issues

### Container Won't Start

```powershell
# Check container logs
docker logs phase66-postgres

# Check if port is already in use
netstat -ano | findstr ":5434"

# Remove and recreate container (if needed)
docker rm phase66-postgres
docker run -d --name phase66-postgres -p 5434:5432 -e POSTGRES_USER=user -e POSTGRES_PASSWORD=user -e POSTGRES_DB=legal pgvector/pgvector:pg17
```

### Connection Refused

- Verify container is running: `docker ps | findstr phase66`
- Check port mapping: `docker port phase66-postgres`
- Test connection: `telnet localhost 5434`

### Out of Memory

```powershell
# Check Docker Desktop settings (increase memory to 8GB+)
# Or restart Docker
Restart-Service docker

# On Docker Desktop for Windows
wsl --shutdown
```

---

## 🎯 Quick Reference

| Task | Command |
|------|---------|
| **Start all** | `docker start phase66-postgres phase66-redis phase66-rabbitmq phase66-qdrant phase66-minio phase66-couchdb deeds-neo4j` |
| **Stop all** | `docker stop phase66-postgres phase66-redis phase66-rabbitmq phase66-qdrant phase66-minio phase66-couchdb deeds-neo4j` |
| **Check status** | `docker ps` |
| **View logs** | `docker logs -f <container-name>` |
| **Execute command** | `docker exec <container-name> <command>` |
| **Interactive shell** | `docker exec -it <container-name> bash` |
| **Health check** | `docker inspect <container-name> --format='{{.State.Health.Status}}'` |

---

**✅ All containers ready! Start developing with `npm run dev` in sveltekit-frontend/**
