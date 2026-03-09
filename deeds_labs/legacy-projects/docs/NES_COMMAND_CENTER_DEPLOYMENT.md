# NES Command Center Deployment Guide

## Prerequisites

- Node.js 18+
- PostgreSQL 17 with pgvector extension
- npm or yarn package manager

---

## Environment Variables

Create a `.env` file with the following variables:

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/legal_ai_db

# Application
NODE_ENV=production
PORT=5173

# Optional: Redis for caching
REDIS_URL=redis://localhost:6379
```

---

## Database Setup

### 1. Create Database

```bash
createdb legal_ai_db
```

### 2. Enable Extensions

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";
```

### 3. Run Migrations

```bash
# Using npm script
npm run db:migrate

# Or manually
npx drizzle-kit push:pg
```

### 4. Verify Tables

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name LIKE 'route_%' OR table_name LIKE 'error_%';
```

Expected tables:
- route_metadata
- error_cluster
- route_health_event
- error_brain_analysis
- error_brain_patch
- route_interaction_log
- error_cluster_archive
- route_interaction_log_archive

---

## Application Deployment

### Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

### Production Build

```bash
# Build application
npm run build

# Preview production build
npm run preview

# Start production server
node build/index.js
```

### Docker Deployment

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY build ./build
COPY package.json ./

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000
CMD ["node", "build/index.js"]
```

```bash
docker build -t nes-command-center .
docker run -p 3000:3000 \
  -e DATABASE_URL=postgresql://... \
  nes-command-center
```

---

## Background Jobs

### Archival Job Setup

The archival job runs daily at 2 AM UTC to move old data to archive tables.

**Using PM2:**
```bash
pm2 start backend/jobs/scheduler.ts --name "archival-scheduler"
```

**Using cron:**
```bash
# Add to crontab
0 2 * * * cd /app && node backend/jobs/archiveOldData.js >> /var/log/archival.log 2>&1
```

**Manual execution:**
```bash
npx ts-node backend/jobs/archiveOldData.ts
```

---

## Health Checks

### Application Health
```bash
curl http://localhost:5173/api/health
```

### Database Health
```bash
curl http://localhost:5173/api/routes/metadata
```

### SSE Connection Test
```bash
curl -N http://localhost:5173/api/routes/events
```

---

## Monitoring

### Key Metrics

1. **API Response Times**
   - Target: < 100ms for all endpoints
   - Monitor: `/api/routes/:routeId/metadata`

2. **Database Query Performance**
   - Target: < 50ms for indexed queries
   - Monitor: `pg_stat_statements`

3. **SSE Connections**
   - Target: < 5 connections per user
   - Monitor: Active EventSource connections

4. **Archival Job**
   - Target: Complete within 5 minutes
   - Monitor: Job logs and archive_statistics view

### Logging

Application logs are written to stdout in JSON format:

```json
{
  "level": "info",
  "timestamp": "2026-01-03T12:00:00Z",
  "message": "Route metadata created",
  "routeId": "(app)/dashboard",
  "duration": 45
}
```

---

## Troubleshooting

### Database Connection Issues

```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1"

# Check pool status
SELECT * FROM pg_stat_activity WHERE datname = 'legal_ai_db';
```

### Migration Failures

```bash
# Check migration status
SELECT * FROM drizzle_migrations ORDER BY created_at DESC;

# Rollback (manual)
# Restore from backup, then re-run migrations
```

### SSE Connection Drops

1. Check nginx/proxy timeout settings
2. Verify `Connection: keep-alive` header
3. Check client-side reconnection logic

### Archival Job Failures

```bash
# Check job logs
tail -f /var/log/archival.log

# Manual archive
npx ts-node backend/jobs/archiveOldData.ts

# Verify archive tables
SELECT COUNT(*) FROM error_cluster_archive;
SELECT COUNT(*) FROM route_interaction_log_archive;
```

---

## Backup and Recovery

### Database Backup

```bash
# Full backup
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql

# Schema only
pg_dump --schema-only $DATABASE_URL > schema.sql

# Data only
pg_dump --data-only $DATABASE_URL > data.sql
```

### Restore

```bash
# Full restore
psql $DATABASE_URL < backup_20260103.sql

# Restore specific tables
pg_restore -t route_metadata -d legal_ai_db backup.dump
```

---

## Scaling Considerations

### Horizontal Scaling

1. **Database**: Use read replicas for GET endpoints
2. **Application**: Deploy multiple instances behind load balancer
3. **SSE**: Use Redis pub/sub for cross-instance broadcasting

### Vertical Scaling

1. **Database**: Increase connection pool size
2. **Application**: Increase Node.js memory limit
3. **Archival**: Run on dedicated worker instance

### Performance Tuning

```sql
-- Analyze query performance
EXPLAIN ANALYZE SELECT * FROM error_cluster WHERE route_id = 'test';

-- Update statistics
ANALYZE route_metadata;
ANALYZE error_cluster;

-- Vacuum to reclaim space
VACUUM ANALYZE;
```
