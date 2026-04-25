# Container Recovery Procedure

## Overview

This guide explains how to recover the legal AI system after container deletion, restart, or infrastructure failure. All procedures are **idempotent** - safe to run multiple times.

---

## Quick Recovery (5 minutes)

### Step 1: Restart Docker Compose

```bash
docker-compose up -d
```

Wait 30-60 seconds for all services to start.

### Step 2: Run Bootstrap

```bash
make bootstrap
```

Or manually:

```bash
bash scripts/bootstrap-infrastructure.sh
```

### Step 3: Verify Services

```bash
make health-check
```

Expected output:
```
MinIO: ✓
PostgreSQL: ✓
RabbitMQ: ✓
Redis: ✓
```

---

## Detailed Recovery Steps

### Phase 1: Service Startup

```bash
# Start all services
docker-compose up -d

# Wait for services to be ready
sleep 30

# Check service status
docker-compose ps
```

Expected status: All services should show `Up`.

### Phase 2: Infrastructure Bootstrap

#### MinIO Buckets

```bash
# Create buckets
make bootstrap-minio

# Or manually:
docker exec legal-ai-minio mc alias set minio http://minio:9000 minioadmin minioadmin123
docker exec legal-ai-minio mc mb minio/lawpdfs --ignore-existing
docker exec legal-ai-minio mc mb minio/documents --ignore-existing
```

#### PostgreSQL Migrations

```bash
# Run migrations
make bootstrap-postgres

# Or manually:
npm run db:migrate
PGPASSWORD=123456 psql -h localhost -p 5432 -U legal_admin -d legal_ai_db -f scripts/postgres-indexes.sql
```

#### RabbitMQ Queues

```bash
# Configure queues
make bootstrap-rabbitmq

# Or manually:
docker exec legal-ai-rabbitmq rabbitmqctl eval 'rabbit_exchange:declare(<<"processing_events">>, <<"topic">>, true, false, false, []).'
docker exec legal-ai-rabbitmq rabbitmqctl eval 'rabbit_amqqueue:declare(<<"document.process">>, true, false, [], []).'
```

#### Redis Configuration

```bash
# Verify Redis
make bootstrap-redis

# Or manually:
docker exec legal-ai-redis redis-cli ping
```

### Phase 3: Verification

```bash
# Full health check
make health-check

# Check specific services
docker-compose logs postgres
docker-compose logs minio
docker-compose logs rabbitmq
docker-compose logs redis
```

---

## Troubleshooting

### Service Not Starting

**Problem**: Service shows `Exited` or `Restarting`

**Solution**:
```bash
# Check logs
docker-compose logs <service-name>

# Restart service
docker-compose restart <service-name>

# Or restart all
docker-compose restart
```

### Database Connection Failed

**Problem**: PostgreSQL connection refused

**Solution**:
```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Check logs
docker-compose logs postgres

# Verify network
docker network ls
docker network inspect legal-ai-network

# Restart PostgreSQL
docker-compose restart postgres

# Re-run migrations
npm run db:migrate
```

### MinIO Buckets Not Created

**Problem**: MinIO buckets missing

**Solution**:
```bash
# Check MinIO is running
docker-compose ps minio

# Manually create buckets
docker exec legal-ai-minio mc alias set minio http://minio:9000 minioadmin minioadmin123
docker exec legal-ai-minio mc mb minio/lawpdfs
docker exec legal-ai-minio mc mb minio/documents

# Verify buckets
docker exec legal-ai-minio mc ls minio
```

### RabbitMQ Queues Not Configured

**Problem**: RabbitMQ queues missing

**Solution**:
```bash
# Check RabbitMQ is running
docker-compose ps rabbitmq

# Access RabbitMQ management UI
# http://localhost:15672 (admin/admin123)

# Or configure via CLI
docker exec legal-ai-rabbitmq rabbitmqctl list_queues
docker exec legal-ai-rabbitmq rabbitmqctl list_exchanges
```

### Redis Not Responding

**Problem**: Redis connection refused

**Solution**:
```bash
# Check Redis is running
docker-compose ps redis

# Check logs
docker-compose logs redis

# Verify connection
docker exec legal-ai-redis redis-cli ping

# Restart Redis
docker-compose restart redis
```

---

## Complete System Recovery

If individual service recovery doesn't work, perform a complete system recovery:

### Step 1: Stop All Services

```bash
docker-compose down
```

### Step 2: Remove Volumes (WARNING: Data Loss)

```bash
# Only if you want to reset everything
docker-compose down -v
```

### Step 3: Restart Everything

```bash
docker-compose up -d
```

### Step 4: Wait for Services

```bash
sleep 60
```

### Step 5: Run Full Bootstrap

```bash
make bootstrap
```

### Step 6: Verify

```bash
make health-check
```

---

## Automated Recovery Script

For production environments, use the automated bootstrap script:

```bash
# Run with default settings
bash scripts/bootstrap-infrastructure.sh

# Run with custom environment variables
MINIO_ENDPOINT=minio.example.com:9000 \
POSTGRES_HOST=postgres.example.com \
RABBITMQ_HOST=rabbitmq.example.com \
bash scripts/bootstrap-infrastructure.sh
```

---

## Idempotent Operations

All bootstrap operations are **idempotent** - they can be run multiple times safely:

- ✅ MinIO bucket creation (uses `--ignore-existing`)
- ✅ PostgreSQL migrations (Drizzle handles duplicates)
- ✅ Index creation (uses `CREATE INDEX IF NOT EXISTS`)
- ✅ RabbitMQ queue setup (idempotent via CLI)
- ✅ Redis configuration (read-only checks)

---

## Monitoring

### Health Check Frequency

- **Development**: Run `make health-check` after any restart
- **Staging**: Run health check every 5 minutes
- **Production**: Run health check every 1 minute

### Automated Monitoring

Add to crontab for automated checks:

```bash
# Check every 5 minutes
*/5 * * * * cd /path/to/app && make health-check >> /var/log/health-check.log 2>&1
```

---

## Prevention

### Backup Strategy

```bash
# Backup PostgreSQL
docker exec legal-ai-postgres pg_dump -U legal_admin legal_ai_db > backup.sql

# Backup MinIO
docker exec legal-ai-minio mc mirror minio/lawpdfs ./backup/lawpdfs
docker exec legal-ai-minio mc mirror minio/documents ./backup/documents
```

### Regular Testing

```bash
# Test recovery weekly
docker-compose down
sleep 10
docker-compose up -d
make bootstrap
make health-check
```

---

## Support

If recovery fails:

1. Check logs: `docker-compose logs`
2. Verify network: `docker network inspect legal-ai-network`
3. Check disk space: `docker system df`
4. Review this guide: `docs/CONTAINER_RECOVERY.md`
5. Contact support with logs

---

**Last Updated**: November 23, 2025
**Version**: 1.0
**Status**: Production Ready
