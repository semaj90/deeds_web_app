# Docker Data Loss Incident — Deep Audit (June 27-28, 2026)

## Timeline Reconstruction

### Event 1: Computer Restart (Timestamp: ~2026-06-28 04:00 UTC)
- **Trigger**: User-initiated system restart (Windows 10)
- **What happened to Docker volumes**:
  - WSL2 VHDX file did NOT auto-delete
  - But Docker Desktop's volume manager lost track of mounted volumes
  - Postgres container spun up with empty `/var/lib/postgresql/data`
  - 18,046 packets + all schema data LOST (unrecoverable)

### Event 2: Container Re-initialization (~04:24-05:45 UTC)
- **Postgres container created**: 2026-06-28T04:24:53Z
- **Postgres container started**: 2026-06-28T05:45:59Z
- **Gap explanation**: Container was created but not started until 81 minutes later
- **Who started it?**: Either a startup hook OR manual `npm run dev:gpu`

### Event 3: SeaweedFS Brought Online (~05:46 UTC)
- **SeaweedFS-master created/started**: 2026-06-28T05:46:32Z
- **Triggering script**: `ensure-docker-gpu-stack.mjs`
- **Who called it?**: `npm run dev:gpu` in package.json line 1435

### Event 4: Migration Attempted
- **Drizzle tried to apply schema**
- **FK constraint error occurred**: `ai_reports.created_by (integer) != users.id (uuid)`
- **Migration halted**: Non-blocking error caught, migration never completed
- **Result**: 0 tables created, database remains empty

---

## Root Cause Analysis (5 Layers)

### Layer 1: Windows WSL2 Volume Behavior (Infrastructure)
**Problem**: Docker Desktop on Windows 10 does NOT persist volumes across system restarts reliably.

**Evidence**:
- Postgres volume path: `C:\Users\james\AppData\Local\Docker\wsl\disk\docker_data.vhdx`
- VHDX file still exists (not deleted), but Docker lost the mount reference
- Container spins up with fresh `/var/lib/postgresql/data` directory
- Result: 18,046 packets permanently lost (not recoverable without backup)

**Why this happens**:
- WSL2 uses a VHDX virtual disk
- On system restart, WSL2 may not properly reattach volumes to containers
- Docker Desktop's volume metadata can become stale
- No automatic recovery mechanism exists

**Severity**: 🔴 CRITICAL — Data loss is permanent

---

### Layer 2: Docker Compose Auto-Startup (Process)
**Problem**: `npm run dev:gpu` automatically runs `ensure-docker-gpu-stack.mjs` BEFORE the dev server starts.

**Evidence**:
```json
// Line 1435 in package.json
"dev:gpu": "node scripts/with-node-memory.mjs --shell -- node scripts/startup/ensure-docker-gpu-stack.mjs && npm run llama:ensure -- --spawn && ..."
```

**Script behavior**:
- `ensure-docker-gpu-stack.mjs` line 142 calls `docker compose up -d --profile seaweedfs`
- No pre-flight check for database health
- No wait for schema migration
- No rollback if migration fails
- Runs **every time** `npm run dev:gpu` is invoked

**Severity**: 🟠 HIGH — Uncontrolled container startup

---

### Layer 3: Schema Migration Blocker (Database)
**Problem**: Drizzle migration fails on FK constraint, blocking schema creation.

**Error**:
```
ERROR: foreign key constraint "ai_reports_created_by_users_id_fk" cannot be implemented
DETAIL: Key columns "created_by" of the referencing table and "id" of the referenced table are of incompatible types: integer and uuid.
```

**Root cause**:
- `users.id` is `serial` (integer) — Lucia default
- `ai_reports.created_by` is `uuid` — legacy schema
- Drizzle migration tried to create FK with incompatible types
- Migration halted, no tables created

**Severity**: 🔴 CRITICAL — Database remains unavailable

---

### Layer 4: No Data Recovery Mechanism (Operational)
**Problem**: No automated backup, no point-in-time recovery, no volume checkpoints.

**Evidence**:
- Last backup: May 17, 2026 (41 days old)
- Current data: June 28, 2026 (no daily snapshots)
- Volume snapshots: None configured
- Docker volume backup strategy: Non-existent

**Severity**: 🔴 CRITICAL — Data loss is permanent

---

### Layer 5: Missing Pre-Flight Checks (Monitoring)
**Problem**: No guards prevent starting services with a broken database.

**Evidence**:
- No `docker-healthcheck` for Postgres schema completeness
- No migration validation before container startup
- No alert if volume appears empty
- No rollback if schema creation fails

**Severity**: 🟠 HIGH — Allows broken state to persist

---

## Failure Points (Map)

```
Computer Restart
    ↓
WSL2 Volume Lost ─────────────────────────────► 🔴 CRITICAL: Data Loss
    ↓
Docker Desktop Restarts Postgres Container
    ↓
Postgres spins up with EMPTY /var/lib/postgresql/data
    ↓
npm run dev:gpu (or startup hook) ─────────────► 🟠 HIGH: Auto-startup
    ↓
ensure-docker-gpu-stack.mjs calls docker compose up -d
    ↓
SeaweedFS, RabbitMQ, etc. come online
    ↓
Drizzle migration runs: ALTER TABLE ... ADD CONSTRAINT ─────► 🔴 CRITICAL: FK Mismatch
    ↓
Migration fails on ai_reports.created_by (integer) vs users.id (uuid)
    ↓
Migration halted, no tables created ───────────► Database unavailable
    ↓
Phase 85 P5 blocked (requires 18,046 packets in atlas_packets)
```

---

## Prevention Strategy (4 Tiers)

### Tier 1: Infrastructure Hardening (Immediate)

#### 1.1 Add Postgres Health Check to docker-compose.yml
```yaml
postgres:
  healthcheck:
    test: |
      pg_isready -U legal_admin -d legal_ai_db &&
      psql -U legal_admin -d legal_ai_db -c "SELECT 1 FROM information_schema.tables WHERE table_schema='public' LIMIT 1" &>/dev/null || exit 1
    interval: 5s
    timeout: 5s
    retries: 3
    start_period: 10s
```

**Effect**: Container marked "unhealthy" if schema is missing

#### 1.2 Add Pre-Flight Schema Validation in `ensure-docker-gpu-stack.mjs`
```javascript
function validatePostgresSchema() {
  const result = spawnSync('docker', [
    'exec', 'legal-ai-postgres',
    'psql', '-U', 'legal_admin', '-d', 'legal_ai_db',
    '-t', '-c', "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';"
  ], { stdio: 'pipe', encoding: 'utf8', timeout: 10_000 });
  
  if (result.status !== 0 || !result.stdout.trim() || result.stdout.trim() === '0') {
    throw new Error(
      'FATAL: Postgres schema is empty (0 tables found). ' +
      'Database appears to have been reset. Run "npm run db:restore-from-backup" before continuing.'
    );
  }
  
  log(`Schema validation passed (${result.stdout.trim()} tables found)`);
}
```

**Placement**: Call BEFORE `docker compose up -d` at line 142

#### 1.3 Add Volume Mount Verification
```javascript
function verifyVolumeMount(containerName) {
  const result = spawnSync('docker', [
    'inspect', '-f', '{{json .Mounts}}', containerName
  ], { stdio: 'pipe', encoding: 'utf8', timeout: 5_000 });
  
  if (result.status !== 0) return false;
  
  try {
    const mounts = JSON.parse(result.stdout);
    const hasDataMount = mounts.some(m => 
      m.Name === 'postgres_data' || m.Destination === '/var/lib/postgresql/data'
    );
    
    if (!hasDataMount) {
      warn('CRITICAL: Postgres volume "postgres_data" not properly mounted. Data loss possible.');
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
```

**Placement**: Call after container is running, before schema validation

---

### Tier 2: Operational Safety (Daily)

#### 2.1 Implement Daily Backup Cron Job
**File**: `scripts/backup/daily-postgres-backup.sh`

```bash
#!/bin/bash
set -euo pipefail

BACKUP_DIR="${HOME}/deeds-backups/postgres/daily"
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_FILE="${BACKUP_DIR}/legal_ai_db_${TIMESTAMP}.sql.gz"
LOCK_FILE="/tmp/postgres-backup.lock"

# Prevent concurrent backups
if [ -f "${LOCK_FILE}" ]; then
  echo "Backup already running. Exiting."
  exit 0
fi
trap "rm -f ${LOCK_FILE}" EXIT
touch "${LOCK_FILE}"

mkdir -p "${BACKUP_DIR}"

# Backup database
echo "[$(date)] Starting Postgres backup..."
docker exec legal-ai-postgres pg_dump \
  -U legal_admin \
  -d legal_ai_db \
  -F custom \
  -b \
  -v 2>&1 | gzip > "${BACKUP_FILE}"

# Get file size
SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "[$(date)] Backup completed: ${BACKUP_FILE} (${SIZE})"

# Retention: keep last 30 days
find "${BACKUP_DIR}" -name "legal_ai_db_*.sql.gz" -mtime +30 -delete
echo "[$(date)] Retention cleanup completed"
```

**Setup**: Add to crontab:
```bash
# Run daily at 02:00 UTC
0 2 * * * /path/to/scripts/backup/daily-postgres-backup.sh >> ~/deeds-backups/cron.log 2>&1
```

#### 2.2 Add Backup Verification at Startup
**File**: `scripts/health/verify-backup-exists.mjs`

```javascript
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export function verifyRecentBackup() {
  const backupDir = path.join(os.homedir(), 'deeds-backups/postgres/daily');
  
  if (!fs.existsSync(backupDir)) {
    throw new Error(
      'FATAL: Backup directory does not exist at ' + backupDir +
      '\nRun: mkdir -p ' + backupDir +
      '\nThen add cron job: scripts/backup/daily-postgres-backup.sh'
    );
  }
  
  const files = fs.readdirSync(backupDir)
    .filter(f => f.endsWith('.sql.gz'))
    .sort()
    .reverse();
  
  if (files.length === 0) {
    throw new Error(
      'FATAL: No backups found in ' + backupDir +
      '\nSet up daily backup cron job immediately.'
    );
  }
  
  const latestBackup = files[0];
  const latestPath = path.join(backupDir, latestBackup);
  const mtime = fs.statSync(latestPath).mtime;
  const ageMs = Date.now() - mtime.getTime();
  const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
  const ageDays = Math.floor(ageHours / 24);
  
  console.log(`[health] Latest backup: ${latestBackup} (${ageDays}d ${ageHours % 24}h ago)`);
  
  if (ageHours > 48) {
    console.warn(
      `[health] WARNING: Backup is ${ageHours} hours old (should be <24h). ` +
      `Check cron job: ps aux | grep daily-postgres-backup.sh`
    );
  }
  
  if (ageHours > 72) {
    throw new Error(
      `FATAL: Backup is ${ageHours} hours old. Data loss risk critical. ` +
      `Run manual backup: scripts/backup/daily-postgres-backup.sh`
    );
  }
  
  return { latestBackup, ageHours };
}
```

**Placement**: Call in `ensure-docker-gpu-stack.mjs` before starting containers

---

### Tier 3: Database Safety (Schema)

#### 3.1 Fix FK Constraint Issue (IMMEDIATE)
**Option A (Recommended)**: Migrate all `user_id uuid` columns to `integer`

```sql
-- In a new Drizzle migration file: drizzle/0XXX_fix_user_id_types.sql
ALTER TABLE ai_reports ALTER COLUMN created_by TYPE integer USING NULL;
ALTER TABLE ai_reports ADD CONSTRAINT ai_reports_created_by_fk 
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
```

**Option B**: Create a schema version trigger
```sql
CREATE TABLE IF NOT EXISTS schema_version (
  id SERIAL PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMP DEFAULT NOW(),
  description TEXT
);

-- Insert current version
INSERT INTO schema_version (version, description) 
  VALUES ('2026-06-28-fix-user-id-types', 'Fix FK constraint integer mismatch')
  ON CONFLICT DO NOTHING;
```

#### 3.2 Add Idempotent Schema Creation
Replace destructive operations with `IF NOT EXISTS`:

```sql
-- Good (idempotent)
CREATE TABLE IF NOT EXISTS atlas_packets (
  packet_key TEXT PRIMARY KEY,
  ...
);

-- Bad (will fail on re-run)
CREATE TABLE atlas_packets (
  packet_key TEXT PRIMARY KEY,
  ...
);
```

---

### Tier 4: Monitoring & Alerting (Ongoing)

#### 4.1 Docker Event Logging
**File**: `scripts/monitor/docker-events-logger.sh`

```bash
#!/bin/bash
LOG_DIR="${HOME}/.deeds/docker-events"
mkdir -p "${LOG_DIR}"

docker events \
  --filter 'type=container' \
  --filter 'event=start|stop|die|health_status|create' \
  --format '{{.Time}} | {{.Action}} | {{.Actor.Attributes.name}} | {{.Actor.ID}}' \
  | tee -a "${LOG_DIR}/$(date +%Y-%m-%d).log"
```

**Setup**: Run in background during dev:
```bash
npm run docker:monitor:start  # Start in background
npm run docker:monitor:logs   # View recent logs
```

#### 4.2 Startup Event Logging in `ensure-docker-gpu-stack.mjs`
```javascript
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const logDir = path.join(os.homedir(), '.deeds/startup-logs');
const logFile = path.join(logDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.log`);

function ensureLogDir() {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
}

function logStartupEvent(msg) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}`;
  console.log(line);
  
  ensureLogDir();
  fs.appendFileSync(logFile, line + '\n');
}
```

**Effect**: Create audit trail of every startup action

---

## Files to Create/Modify

### New Files
```
scripts/backup/
├── daily-postgres-backup.sh
├── restore-postgres-backup.sh
└── verify-backup-integrity.mjs

scripts/health/
├── verify-backup-exists.mjs
├── schema-validation.mjs
└── volume-mount-verify.mjs

scripts/monitor/
└── docker-events-logger.sh

docs/
├── DOCKER-INCIDENT-AUDIT-JUNE-28-2026.md (this file)
├── DATA-RECOVERY-PROCEDURES.md
└── DOCKER-SAFETY-RUNBOOK.md

memory/
└── docker-production-hardening.md
```

### Modified Files
```
sveltekit-frontend/scripts/startup/ensure-docker-gpu-stack.mjs
  - Add verifyRecentBackup() call
  - Add validatePostgresSchema() call
  - Add verifyVolumeMount() call
  - Add logStartupEvent() calls throughout

sveltekit-frontend/package.json
  - Add npm script: "db:restore-from-backup"
  - Add npm script: "docker:monitor:start"
  - Add npm script: "docker:monitor:logs"
  - Add npm script: "health:check:all"

docker-compose.yml
  - Add healthcheck to postgres service
```

---

## Implementation Checklist

### Phase 1: Emergency (Before Next Dev Session) — 2-3 hours
- [ ] Fix FK constraint in Drizzle schema (ai_reports.created_by to integer)
- [ ] Run `npm run db:migrate` to verify schema creation works
- [ ] Add healthcheck to docker-compose.yml postgres service
- [ ] Add `validatePostgresSchema()` to ensure-docker-gpu-stack.mjs
- [ ] Add `verifyRecentBackup()` to ensure-docker-gpu-stack.mjs
- [ ] Create `scripts/backup/daily-postgres-backup.sh`
- [ ] Test backup script manually: `bash scripts/backup/daily-postgres-backup.sh`
- [ ] Create this audit doc in `docs/`
- [ ] Commit all changes with message: "fix: prevent docker data loss with backup + validation gates"

### Phase 2: Week 1 — 6-8 hours
- [ ] Create `scripts/backup/restore-postgres-backup.sh`
- [ ] Add `db:restore-from-backup` npm script
- [ ] Set up daily cron job for backup
- [ ] Create `scripts/health/verify-backup-exists.mjs`
- [ ] Integrate backup verification into ensure-docker-gpu-stack.mjs
- [ ] Create `scripts/health/volume-mount-verify.mjs`
- [ ] Add startup event logging
- [ ] Test backup restoration on test database

### Phase 3: Week 2 — 4-6 hours
- [ ] Create `scripts/monitor/docker-events-logger.sh`
- [ ] Add `docker:monitor:start` npm script
- [ ] Create `DATA-RECOVERY-PROCEDURES.md`
- [ ] Create `DOCKER-SAFETY-RUNBOOK.md`
- [ ] Create `docker-production-hardening.md` memory file
- [ ] Document schema migration best practices
- [ ] Create schema audit dashboard

### Phase 4: Ongoing — 1h/week
- [ ] Monitor backup logs (daily)
- [ ] Run health checks (weekly)
- [ ] Test recovery procedure (monthly)
- [ ] Update incident playbook (quarterly)

---

## Key Learnings

1. **WSL2 volumes are fragile on Windows restart** — Always maintain daily backups + verify they exist at startup
2. **Auto-startup scripts can hide failures** — Add pre-flight validation BEFORE bringing up services
3. **FK constraints can block entire database** — Review schema for type mismatches before restart
4. **No alerting = silent data loss** — Implement health checks at every startup
5. **Backups are only useful if tested** — Restore from backup monthly to verify
6. **Docker events are auditable** — Log all container lifecycle events for forensics
7. **Database state must be validated** — Never assume schema exists after container restart

---

## Prevention Summary

```
Before Restart:
  ✓ Daily backup (24h-old data recoverable)
  ✓ Backup verification (ensure integrity)
  ✓ Schema consistency (no FK mismatches)

At Startup:
  ✓ Pre-flight schema validation (fail fast if empty)
  ✓ Volume mount verification (ensure data present)
  ✓ Backup recency check (alert if stale)
  ✓ Health check all systems (all-or-nothing)

During Startup:
  ✓ Event logging (audit trail for forensics)
  ✓ Docker event monitoring (detect anomalies)
  ✓ Container health monitoring (track state)

After Startup:
  ✓ Backup snapshot (post-startup checkpoint)
  ✓ Schema audit (compare with expected)
  ✓ Recovery test (verify restore works)
```

---

## Estimated Cost of Prevention

**Implementation time**: 12-17 hours
**Ongoing maintenance**: 1h/week
**Data recovery value**: 18,046+ packets ($∞ in incident cost)
**Peace of mind**: Priceless

**ROI**: Prevent 100% data loss + ability to recover to 24h ago + reduce incidents from "permanent data loss" to "24h rollback"

---

## Success Criteria

✅ After implementing all tiers:
- [ ] Postgres schema always present after startup (validated by pre-flight check)
- [ ] Daily backup exists and is <24h old (verified at startup)
- [ ] Volume mount correct (verified at startup)
- [ ] Data loss would be limited to ≤24h (recoverable from backup)
- [ ] All startup actions logged (audit trail complete)
- [ ] Health check dashboard operational (alerts on anomalies)
- [ ] Recovery procedure tested monthly (restore from backup verified)

---

**Status**: 🔴 INCIDENT — Data loss occurred. 18,046 packets lost.
**Preventability**: 🟢 100% preventable with proposed hardening
**Next Step**: Implement Phase 1 (Emergency) before next dev session
**Owner**: DevOps + Data Operations
**Last Updated**: 2026-06-28