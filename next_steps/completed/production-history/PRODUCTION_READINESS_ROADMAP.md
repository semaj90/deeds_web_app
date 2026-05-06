# Production Readiness Roadmap
## Legal AI Platform (Deeds Web App)

**Last Updated:** February 28, 2026 (Session 93r28i)
**Status:** 2 of 7 critical items complete, 5 remaining before production

---

## ✅ Completed (Session 93r28i)

### 1. Critical Bug Fixes — DONE
- ✅ **UUID Validation** (Commit 8d4e599c59)
  - Added regex validation before database insert
  - Returns 400 with helpful error message
  - File: `src/routes/api/evidence/upload/+server.ts:63-67`

- ✅ **OCR Filename Sanitization** (Commit 6d26f6ee71)
  - Prevents Tesseract errors with special characters
  - Sanitizes: `"ARTICLE 1, SECTION 1.pdf"` → `"ARTICLE_1__SECTION_1.pdf"`
  - Files: `src/lib/server/ocr/tesseract.ts`, `src/lib/server/ocr/hybrid.ts`

### 2. Performance Optimizations — DONE
All optimizations documented in [`PRODUCTION_OPTIMIZATIONS_COMPLETE.md`](../PRODUCTION_OPTIMIZATIONS_COMPLETE.md):
- ✅ Transferable ArrayBuffers (500× speedup)
- ✅ SSR Re-enablement (5× FCP)
- ✅ node-caged Pointer Compression (50% memory reduction)
- ✅ UV_THREADPOOL_SIZE=8
- ✅ Nginx SSR Caching
- ✅ ONNX Runtime WASM (60MB)
- ✅ WebGPU Compute Shaders
- ✅ Multi-Stage Docker Build
- ✅ 4-Tier Cache Hierarchy

---

## 🔴 CRITICAL PATH (Must Complete Before Launch)

### 3. Environment Variables Configuration ⚠️ **START HERE**

**Status:** NOT DONE
**Priority:** 🔴 CRITICAL
**Estimated Time:** 30 minutes

Create `.env.production` with real credentials (NEVER commit to git):

```bash
# ============================================
# PRODUCTION ENVIRONMENT VARIABLES
# ============================================

# Core
NODE_ENV=production
ORIGIN=https://your-domain.com  # ← CHANGE THIS
PORT=3000
HOST=0.0.0.0

# ============================================
# Database (USE MANAGED SERVICE)
# ============================================
DATABASE_URL=postgresql://legal_admin:STRONG_PASSWORD@prod-db.example.com:5432/legal_ai_db
# ⚠️ REPLACE with managed Postgres (AWS RDS, DigitalOcean, Supabase, etc.)
# ⚠️ NOT localhost:5432 in production

# ============================================
# Redis Cache (USE MANAGED SERVICE)
# ============================================
REDIS_URL=redis://prod-redis.example.com:6379
REDIS_PASSWORD=STRONG_REDIS_PASSWORD
# ⚠️ REPLACE with managed Redis (AWS ElastiCache, Upstash, Redis Cloud)
# ⚠️ NOT localhost:6379 in production

# ============================================
# MinIO / S3 Object Storage
# ============================================
MINIO_ENDPOINT=s3.amazonaws.com  # or your MinIO domain
MINIO_ACCESS_KEY=YOUR_AWS_ACCESS_KEY_ID
MINIO_SECRET_KEY=YOUR_AWS_SECRET_ACCESS_KEY
MINIO_USE_SSL=true
MINIO_EVIDENCE_BUCKET=legal-evidence-prod

# ============================================
# AI Services (Dedicated Instances)
# ============================================
OLLAMA_BASE_URL=http://ollama-prod.internal:11434  # NOT localhost
OLLAMA_EMBED_MODEL=embeddinggemma:latest

# Qdrant Vector Database
QDRANT_URL=http://qdrant-prod.internal:6333  # NOT localhost

# RabbitMQ Message Queue
RABBITMQ_URL=amqp://user:pass@rabbitmq-prod.internal:5672  # NOT localhost

# Optional: TensorRT (if using GPU)
TENSORRT_SERVICE_URL=http://tensorrt-prod.internal:8099

# ============================================
# Security Secrets (GENERATE NEW ONES)
# ============================================
# Generate with: openssl rand -hex 32
SESSION_SECRET=REPLACE_WITH_RANDOM_HEX_64_CHARS
CSRF_SECRET=REPLACE_WITH_RANDOM_HEX_64_CHARS
ENCRYPTION_KEY=REPLACE_WITH_RANDOM_HEX_64_CHARS

# ============================================
# Monitoring & Logging
# ============================================
LOG_LEVEL=info
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project  # Optional but recommended

# ============================================
# Performance Tuning
# ============================================
UV_THREADPOOL_SIZE=8  # For transferable ArrayBuffers
NODE_OPTIONS=--max-old-space-size=3072 --optimize-for-size --gc-interval=100
```

**Action Items:**
1. Copy `.env.example` → `.env.production`
2. Replace ALL placeholder values with real credentials
3. Generate secrets: `openssl rand -hex 32` (3 times for 3 secrets)
4. Set up managed services (see Section 9: Infrastructure Setup)
5. **NEVER commit `.env.production` to git** (already in `.gitignore`)

---

### 4. Database Migration & Verification ⚠️

**Status:** NOT DONE
**Priority:** 🔴 CRITICAL
**Estimated Time:** 20 minutes

**Pre-flight Checklist:**
```bash
# 1. Set up staging database (same schema as production)
export DATABASE_URL=postgresql://user:pass@staging-db:5432/legal_ai_staging

# 2. Run migrations on STAGING first (NOT production)
cd sveltekit-frontend
npx drizzle-kit migrate  # NEVER use 'push' with real data

# 3. Verify all tables exist
psql $DATABASE_URL -c "\dt" | grep -E "evidence|cases|users|chat"

# 4. Check critical tables
psql $DATABASE_URL <<EOF
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM cases;
SELECT COUNT(*) FROM evidence;
SELECT COUNT(*) FROM chat_messages;
SELECT COUNT(*) FROM document_topics;  -- Session 93r28b
SELECT COUNT(*) FROM user_interaction_history;  -- Session 93r28b
EOF

# 5. Verify indexes exist
psql $DATABASE_URL -c "\di" | grep -E "idx_|_pkey"

# 6. Check for missing foreign keys
psql $DATABASE_URL -c "SELECT * FROM pg_constraint WHERE contype = 'f';"
```

**Critical Tables to Verify:**
- ✅ `users`, `sessions` (Lucia v3 auth)
- ✅ `cases`, `evidence`, `citations` (core legal)
- ✅ `chat_messages`, `chat_metadata` (chat persistence)
- ✅ `document_topics`, `user_interaction_history` (topic modeling Phase 1)
- ✅ `citation_tag_links` (M2M table, Session 93r28 fix)
- ✅ `evidence_vectors` (pgvector embeddings)

**If migrations fail:**
- Review SQL for DROP statements before running
- Add missing tables to schema to prevent deletion
- Use `tablesFilter` in `drizzle.config.ts`: `['!phase89_*', '!kg_*']`

---

### 5. SSL/TLS Certificates 🔒

**Status:** NOT DONE
**Priority:** 🔴 CRITICAL (Required for HTTPS)
**Estimated Time:** 15 minutes (Let's Encrypt) or 5 minutes (Caddy auto)

#### Option A: Let's Encrypt with Nginx (Free, Manual)

```bash
# Install certbot
sudo apt-get install certbot python3-certbot-nginx

# Obtain certificate (auto-configures Nginx)
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Auto-renewal (already set up by certbot)
sudo certbot renew --dry-run
```

Then uncomment SSL sections in [`nginx/nginx.conf`](../nginx/nginx.conf) lines 72-77, 179-188.

#### Option B: Caddy Auto-HTTPS (Easiest, Recommended)

Already configured in [`Caddyfile.quic`](../Caddyfile.quic) — just deploy:

```bash
docker-compose -f docker-compose.quic.yml up -d
```

Caddy automatically provisions SSL via Let's Encrypt (zero config).

**Action Items:**
1. Choose Option A (Nginx manual) or Option B (Caddy auto)
2. Point DNS A record: `your-domain.com` → server IP
3. Wait for DNS propagation (5-60 minutes)
4. Run certbot OR deploy Caddy
5. Verify: `curl -I https://your-domain.com` → 200 OK

---

### 6. Health Checks & Graceful Shutdown 💚

**Status:** PARTIALLY DONE
**Priority:** 🟡 HIGH
**Estimated Time:** 30 minutes

#### What Exists:
- ✅ `/api/health` — Basic health check (200 OK)
- ✅ `/api/health/capabilities` — Service availability check

#### What's Missing:

**A. Readiness Check (Required for K8s, Docker healthcheck)**

Create `src/routes/api/health/ready/+server.ts`:

```typescript
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import { redis } from '$lib/server/redis';
import { ENV } from '$lib/server/env.server';

const safe = <T>(p: Promise<T>, fallback: T) =>
    Promise.race([p, new Promise<T>(r => setTimeout(() => r(fallback), 3000))]);

export async function GET() {
    try {
        // Parallel health checks with 3s timeout
        const [dbOk, redisOk, ollamaOk] = await Promise.all([
            safe(db.execute(sql`SELECT 1`).then(() => true), false),
            safe(redis.ping().then(() => true), false),
            safe(fetch(`${ENV.OLLAMA_BASE_URL}/api/tags`).then(r => r.ok), false),
        ]);

        const ready = dbOk && redisOk;  // Ollama optional

        if (!ready) {
            return json({
                ready: false,
                checks: { db: dbOk, redis: redisOk, ollama: ollamaOk }
            }, { status: 503 });
        }

        return json({
            ready: true,
            checks: { db: dbOk, redis: redisOk, ollama: ollamaOk }
        });
    } catch (err) {
        return json({ ready: false, error: String(err) }, { status: 503 });
    }
}
```

**B. Graceful Shutdown**

Add to `src/hooks.server.ts`:

```typescript
// Add at end of file
if (import.meta.env.PROD) {
    const shutdown = async (signal: string) => {
        console.log(`${signal} received, closing connections...`);
        try {
            await db.$client.end();
            await redis.quit();
            console.log('Cleanup complete');
            process.exit(0);
        } catch (err) {
            console.error('Shutdown error:', err);
            process.exit(1);
        }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}
```

**Action Items:**
1. Create `/api/health/ready` endpoint (copy code above)
2. Add graceful shutdown to `hooks.server.ts`
3. Update Docker healthcheck to use `/api/health/ready`
4. Test: `curl http://localhost:3000/api/health/ready` → 200 if services up, 503 if down

---

### 7. Security Hardening 🛡️

**Status:** PARTIALLY DONE
**Priority:** 🟡 HIGH
**Estimated Time:** 45 minutes

#### What Exists:
- ✅ SQL injection prevention (parameterized queries, Session 93r7)
- ✅ CSRF tokens (Lucia v3 handles)
- ✅ Basic security headers (Nginx)

#### What Needs Fixing:

**A. Tighten Content Security Policy**

Current CSP is TOO PERMISSIVE:
```nginx
# Current (UNSAFE)
Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'"
```

Replace with strict CSP in [`nginx/nginx.conf:76`](../nginx/nginx.conf#L76):

```nginx
# Strict CSP for production
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self' wss://your-domain.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;
```

**B. Application-Level Rate Limiting**

Add to `src/hooks.server.ts`:

```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({
    url: ENV.REDIS_URL,
    token: ENV.REDIS_PASSWORD,
});

const ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(100, '1m'),  // 100 req/min per IP
    analytics: true,
});

export const handle = sequence(
    async ({ event, resolve }) => {
        const ip = event.getClientAddress();
        const { success, limit, remaining } = await ratelimit.limit(ip);

        if (!success) {
            return new Response('Too many requests', {
                status: 429,
                headers: {
                    'X-RateLimit-Limit': limit.toString(),
                    'X-RateLimit-Remaining': remaining.toString(),
                    'Retry-After': '60',
                },
            });
        }

        const response = await resolve(event);
        response.headers.set('X-RateLimit-Limit', limit.toString());
        response.headers.set('X-RateLimit-Remaining', remaining.toString());
        return response;
    },
    // ... other middleware
);
```

**C. Input Validation on ALL Endpoints**

Audit all POST/PUT routes for Zod validation:

```bash
# Find endpoints without validation
grep -r "export async function POST" src/routes/api --include="*.ts" | \
while read -r line; do
    file=$(echo "$line" | cut -d: -f1)
    if ! grep -q "z\." "$file"; then
        echo "⚠️  Missing validation: $file"
    fi
done
```

Add Zod schemas to any missing endpoints.

**Action Items:**
1. Update CSP in `nginx/nginx.conf`
2. Install & configure rate limiting: `npm i @upstash/ratelimit @upstash/redis`
3. Audit all API routes for input validation
4. Add helmet.js headers: `npm i helmet`

---

## 🟡 High Priority (Strongly Recommended)

### 8. Monitoring & Observability 📊

**Status:** PARTIALLY DONE
**Priority:** 🟡 HIGH
**Estimated Time:** 1-2 hours

#### What Exists:
- ✅ JSON structured logging (all requests logged)
- ✅ Request IDs + user context
- ✅ Performance metrics (memory, CPU in logs)

#### What's Missing:

**A. Error Tracking (Sentry)**

```bash
npm i @sentry/sveltekit

# Add to src/hooks.client.ts and hooks.server.ts
import * as Sentry from '@sentry/sveltekit';

Sentry.init({
    dsn: ENV.SENTRY_DSN,
    environment: ENV.NODE_ENV,
    tracesSampleRate: 0.1,  // 10% performance monitoring
});

export const handleError = Sentry.handleErrorWithSentry();
```

**B. Prometheus Metrics**

Create `src/routes/api/metrics/+server.ts`:

```typescript
export function GET() {
    const mem = process.memoryUsage();
    const metrics = `
# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",status="200"} 1234

# HELP nodejs_heap_bytes Node.js heap size
# TYPE nodejs_heap_bytes gauge
nodejs_heap_bytes{type="used"} ${mem.heapUsed}
nodejs_heap_bytes{type="total"} ${mem.heapTotal}

# HELP process_cpu_seconds CPU time
# TYPE process_cpu_seconds counter
process_cpu_seconds ${process.cpuUsage().user / 1000000}
    `.trim();

    return new Response(metrics, {
        headers: { 'Content-Type': 'text/plain' }
    });
}
```

**C. Grafana Dashboards**

Deploy monitoring stack via Docker:

```yaml
# monitoring-stack.yml
version: '3.8'
services:
  prometheus:
    image: prom/prometheus
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=CHANGE_ME
```

**Action Items:**
1. Set up Sentry (free tier: 5k events/month)
2. Add Prometheus `/metrics` endpoint
3. Deploy Grafana + Prometheus (optional but recommended)
4. Create dashboards for: request rate, error rate, latency, memory

---

### 9. Infrastructure Setup (Managed Services)

**Status:** NOT DONE
**Priority:** 🟡 HIGH (Required for production)
**Estimated Time:** 2-3 hours

Replace localhost services with managed cloud providers:

#### PostgreSQL (Choose One)
- **AWS RDS** (Postgres 16 with pgvector)
- **DigitalOcean Managed Database** (easiest, $15/month)
- **Supabase** (free tier available, includes pgvector)
- **Neon** (serverless Postgres, generous free tier)

**Setup:**
1. Create managed Postgres instance
2. Enable pgvector extension: `CREATE EXTENSION vector;`
3. Update `DATABASE_URL` in `.env.production`
4. Run migrations: `npx drizzle-kit migrate`

#### Redis (Choose One)
- **Upstash** (serverless, generous free tier)
- **Redis Cloud** (free 30MB tier)
- **AWS ElastiCache** (production-grade, $$$)

**Setup:**
1. Create managed Redis instance
2. Get connection URL + password
3. Update `REDIS_URL` + `REDIS_PASSWORD` in `.env.production`

#### MinIO / S3 (Choose One)
- **AWS S3** (industry standard, pay-per-use)
- **DigitalOcean Spaces** (S3-compatible, $5/month)
- **Backblaze B2** (cheapest, S3-compatible)

**Setup:**
1. Create bucket: `legal-evidence-prod`
2. Generate access key + secret
3. Update MinIO env vars in `.env.production`

#### Ollama (GPU Instance)
- **RunPod** (cheapest GPU cloud, $0.30/hour)
- **Paperspace** (managed GPU, $8/month+)
- **AWS EC2 g4dn** (production-grade, $$$)

**Setup:**
1. Deploy GPU instance with Ollama
2. Pull models: `ollama pull embeddinggemma:latest` + `ollama pull gemma3-legal:latest`
3. Update `OLLAMA_BASE_URL` in `.env.production`

---

### 10. Automated Backups 💾

**Status:** NOT DONE
**Priority:** 🟡 HIGH
**Estimated Time:** 30 minutes

**PostgreSQL Backups:**

Create `scripts/backup-database.sh`:

```bash
#!/bin/bash
DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="backup-${DATE}.sql.gz"

# Dump database
pg_dump $DATABASE_URL | gzip > $BACKUP_FILE

# Upload to S3
aws s3 cp $BACKUP_FILE s3://legal-ai-backups/postgres/

# Keep only last 30 days locally
find . -name "backup-*.sql.gz" -mtime +30 -delete

echo "Backup complete: $BACKUP_FILE"
```

**Cron job (run daily at 2 AM):**
```bash
crontab -e
# Add:
0 2 * * * /path/to/scripts/backup-database.sh >> /var/log/backups.log 2>&1
```

**Qdrant Backups:**

```bash
# Create snapshot
curl -X POST http://qdrant:6333/snapshots

# Download snapshot
curl -O http://qdrant:6333/snapshots/latest

# Upload to S3
aws s3 cp latest s3://legal-ai-backups/qdrant/
```

**Action Items:**
1. Create backup script
2. Set up S3 bucket for backups
3. Configure cron job
4. Test restore process (CRITICAL!)

---

## 🟢 Optional Enhancements (Post-Launch)

### 11. Enable Caddy QUIC/HTTP3 (30-50% faster)

**Status:** READY TO DEPLOY
**Files:** [`Caddyfile.quic`](../Caddyfile.quic), [`docker-compose.quic.yml`](../docker-compose.quic.yml)

```bash
docker-compose -f docker-compose.quic.yml up -d
```

### 12. Deploy TensorRT GPU (3-5× faster inference)

**Status:** READY TO DEPLOY (conflicts with Ollama, GPU exclusive)
**Files:** [`docker-compose.quic.yml:144-200`](../docker-compose.quic.yml#L144-L200)

### 13. CI/CD Pipeline (GitHub Actions)

Create `.github/workflows/deploy.yml` for automated deployments.

### 14. Load Balancing (Multiple SvelteKit Instances)

Already configured in [`docker-compose.quic.yml`](../docker-compose.quic.yml#L48-L94) — 2 instances with Caddy round-robin.

---

## 📋 Final Pre-Launch Checklist

```markdown
### Critical (Must Complete) — 2/7 DONE
- [✅] Fix UUID validation (DONE: 8d4e599c59)
- [✅] Fix OCR filename bug (DONE: 6d26f6ee71)
- [ ] Set all production environment variables
- [ ] Run database migrations on production DB
- [ ] Set up SSL/TLS certificates
- [ ] Add graceful shutdown handlers
- [ ] Test health checks (/api/health, /api/health/ready)

### High Priority (Strongly Recommended) — 0/6 DONE
- [ ] Set up error tracking (Sentry)
- [ ] Implement application-level rate limiting
- [ ] Set up automated database backups
- [ ] Run load tests (autocannon, siege)
- [ ] Security audit (CSP, input validation, file uploads)
- [ ] Deploy to staging environment first

### Infrastructure (Required) — 0/4 DONE
- [ ] Managed PostgreSQL (RDS/Supabase/Neon)
- [ ] Managed Redis (Upstash/Redis Cloud)
- [ ] S3-compatible storage (AWS S3/Spaces/B2)
- [ ] GPU instance for Ollama (RunPod/Paperspace)

### Optional (Post-Launch)
- [ ] Enable Caddy QUIC/HTTP3
- [ ] Deploy TensorRT GPU (if needed)
- [ ] Set up CI/CD pipeline
- [ ] Add APM (Application Performance Monitoring)
```

---

## 🚀 Quick Start Deployment (If Deploying RIGHT NOW)

**Minimum viable production deployment (30 minutes):**

```bash
# 1. Environment variables
cp .env.example .env.production
nano .env.production  # Fill in real values

# 2. Build production image
docker build -f sveltekit-frontend/Dockerfile.optimized \
  -t legal-ai:production .

# 3. Deploy with docker-compose
docker-compose -f docker-compose.optimized.yml up -d

# 4. Verify health
curl http://your-domain.com/api/health  # Should return 200
docker-compose ps  # All services should be "healthy"

# 5. Set up SSL (Let's Encrypt)
sudo certbot --nginx -d your-domain.com

# 6. Monitor logs for 24-48 hours
docker-compose logs -f sveltekit
```

**Post-deployment monitoring:**
- Check logs every 6 hours for first 48 hours
- Monitor memory usage: `docker stats`
- Watch error rates: `docker-compose logs sveltekit | grep ERROR`
- Verify backups are running
- Test user workflows end-to-end

---

## 📚 Additional Resources

- [Production Optimizations Guide](../PRODUCTION_OPTIMIZATIONS_COMPLETE.md)
- [Docker Deployment Guide](../sveltekit-frontend/documentation/SSR_CACHING_PARALLELISM_ARCHITECTURE.md)
- [Security Best Practices](../memory/sql-injection-prevention.md)
- [GPU Acceleration Roadmap](../memory/gpu-acceleration-roadmap.md)

---

**Status Summary:**
- ✅ **Performance:** Optimized (500× faster transfers, 5× FCP)
- ✅ **Code Quality:** 0 svelte-check errors, 2 critical bugs fixed
- ⚠️ **Infrastructure:** Needs managed services setup
- ⚠️ **Security:** Needs CSP tightening + rate limiting
- ⚠️ **Operations:** Needs monitoring + backups
- ⏱️ **Estimated Time to Production:** 4-6 hours of work

**Recommended Timeline:**
- Day 1 (2-3 hours): Environment setup + infrastructure (sections 3, 9)
- Day 2 (1-2 hours): Security + health checks (sections 5, 6, 7)
- Day 3 (1 hour): Monitoring + backups (sections 8, 10)
- Day 4: Deploy to staging, test for 24 hours
- Day 5: Deploy to production

Good luck! 🚀
