# Docker Prevention & Audit Strategy
**Date**: June 28, 2026  
**Purpose**: Prevent container loss + verify docker-compose matches startup graphify registry

---

## Problem: How Containers Go Missing

**Historical Incidents**:
1. `docker-compose down` (intentional or accidental)
2. Docker Desktop restart / system update
3. `docker system prune` (deletes stopped containers)
4. WSL2 distro reset
5. Docker engine crash + no `restart: unless-stopped` policy

**Current Protection**:
- ✅ `restart: unless-stopped` on all services (auto-restart on failure)
- ✅ Named volumes (data persists even if containers deleted)
- ❌ No audit trail (what command killed the containers?)
- ❌ No monitoring (no alert when container count drops)
- ❌ No git hooks (can accidentally edit docker-compose.yml)

---

## Prevention Strategy (4 Layers)

### Layer 1: Git Hook (Prevent Accidental Removal)

**File**: `.git/hooks/pre-commit`

```bash
#!/bin/bash
# Prevent accidental removal of services from docker-compose.yml

if git diff --cached -- docker-compose.yml | grep -E "^-  (postgres|rabbitmq|valkey|qdrant|nats|bifrost|couchdb|neo4j|seaweedfs|go-)" > /dev/null 2>&1; then
  echo ""
  echo "❌ BLOCKED: Attempting to remove Docker services from docker-compose.yml"
  echo ""
  echo "Services detected for removal:"
  git diff --cached -- docker-compose.yml | grep "^-  " | head -5
  echo ""
  echo "Recovery: git checkout HEAD -- docker-compose.yml"
  exit 1
fi

exit 0
```

**Installation**:
```bash
mkdir -p .git/hooks
cat > .git/hooks/pre-commit << 'EOF'
[paste above script]
EOF
chmod +x .git/hooks/pre-commit
```

---

### Layer 2: Docker Events Monitoring (Detect Changes)

**File**: `scripts/docker/monitor-containers.sh`

```bash
#!/bin/bash
# Monitor Docker container lifecycle events

CONTAINER_LIST_FILE=".tmp/docker-containers-baseline.txt"
LOG_FILE=".tmp/docker-events-$(date +%Y%m%d).log"

# Baseline: Record expected containers
docker ps --format "{{.Names}}" | grep legal-ai | sort > "$CONTAINER_LIST_FILE"

echo "[$(date)] Monitoring docker events..." >> "$LOG_FILE"

# Stream events with timeout (60 seconds)
timeout 60 docker events --filter type=container --format '[{{.Time}}] {{.Status}} {{.Actor.Attributes.name}}' 2>/dev/null >> "$LOG_FILE"

# Check for missing containers
CURRENT=$(docker ps --format "{{.Names}}" | grep legal-ai | sort)
BASELINE=$(cat "$CONTAINER_LIST_FILE")

if [ "$CURRENT" != "$BASELINE" ]; then
  echo "⚠️ ALERT: Container list changed!" >> "$LOG_FILE"
  echo "  Missing: $(comm -23 <(echo "$BASELINE") <(echo "$CURRENT"))" >> "$LOG_FILE"
  echo "  Added: $(comm -13 <(echo "$BASELINE") <(echo "$CURRENT"))" >> "$LOG_FILE"
fi
```

**Install as cron job** (runs every 30 minutes):
```bash
chmod +x scripts/docker/monitor-containers.sh
# Add to crontab -e:
# */30 * * * * cd /c/Users/james/Videos/deeds-web-app && bash scripts/docker/monitor-containers.sh
```

---

### Layer 3: Immutable docker-compose.yml

**File Permissions**:
```bash
chmod 444 docker-compose.yml
```

**Effect**: Read-only for all users (must use `chmod 644` to edit)

---

### Layer 4: Alert on Startup (Missing Containers)

**File**: `scripts/docker/startup-container-audit.sh`

```bash
#!/bin/bash
# Alert if expected containers are missing on startup

EXPECTED=("legal-ai-postgres" "legal-ai-valkey" "legal-ai-qdrant" "legal-ai-rabbitmq" "legal-ai-caddy")
MISSING=()
STOPPED=()

for container in "${EXPECTED[@]}"; do
  STATUS=$(docker ps --filter name="$container" --format "{{.Status}}")
  
  if [ -z "$STATUS" ]; then
    # Check if stopped
    if docker ps -a --filter name="$container" --format "{{.Status}}" | grep -q "Exited"; then
      STOPPED+=("$container")
    else
      MISSING+=("$container")
    fi
  fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "❌ CRITICAL: Containers missing from Docker!"
  echo "Missing: ${MISSING[@]}"
  echo "Recovery: docker-compose up -d"
  exit 1
fi

if [ ${#STOPPED[@]} -gt 0 ]; then
  echo "⚠️ WARNING: Containers stopped (not running)"
  echo "Stopped: ${STOPPED[@]}"
  echo "Recovery: docker-compose restart"
  exit 1
fi

echo "✅ All expected containers running"
exit 0
```

**Run on app startup** (add to `npm run dev` or `.env`):
```bash
bash scripts/docker/startup-container-audit.sh || exit 1
```

---

## Audit: Docker-Compose vs Startup Graphify Registry

### Problem: Service Definitions Drift

**Scenario**: docker-compose.yml defines 24 services, but startup graphify only checks 5.

**Solution**: Cross-reference with function registry.

### Audit Script

**File**: `scripts/docker/audit-compose-against-graphify.mjs`

```javascript
#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 1. Load docker-compose.yml
const composeYaml = fs.readFileSync(path.join(__dirname, '../../docker-compose.yml'), 'utf8');
const compose = yaml.load(composeYaml);

// 2. Extract service names from docker-compose
const composeServices = Object.keys(compose.services || {}).filter(
  s => !['legal-ai-network', 'volumes', 'tokenizers', 'models'].includes(s)
);

console.log('📋 Docker-Compose Services:', composeServices.length);
console.log('Services:');
composeServices.forEach(s => console.log(`  - ${s}`));

// 3. Load startup graphify registry
const graphifyPath = path.join(__dirname, '../../sveltekit-frontend/scripts/startup/run-graphify-daily-startup.mjs');
const graphifyCode = fs.readFileSync(graphifyPath, 'utf8');

// Parse service health checks from graphify
const healthCheckPattern = /health(?:Check)?.*?['"`]([a-z-]+)['"` ]/gi;
const graphifyServices = new Set();
let match;
while ((match = healthCheckPattern.exec(graphifyCode)) !== null) {
  graphifyServices.add(match[1]);
}

console.log('\n🚀 Graphify Startup Registry:', graphifyServices.size);
Array.from(graphifyServices).forEach(s => console.log(`  - ${s}`));

// 4. Cross-reference
const missing = composeServices.filter(s => !graphifyServices.has(s));
const extra = Array.from(graphifyServices).filter(s => !composeServices.includes(s));

console.log('\n⚠️ AUDIT RESULTS:');
if (missing.length > 0) {
  console.log(`Services in compose but NOT in graphify startup registry (${missing.length}):`);
  missing.forEach(s => console.log(`  - ${s}`));
}

if (extra.length > 0) {
  console.log(`Services in graphify but NOT in compose (${extra.length}):`);
  extra.forEach(s => console.log(`  - ${s}`));
}

if (missing.length === 0 && extra.length === 0) {
  console.log('✅ All services matched!');
} else {
  process.exit(1);
}
```

**Run**:
```bash
npm run docker:audit:graphify  # Add to package.json scripts
```

---

## Implementation Checklist

### Week 1
- [ ] Create `.git/hooks/pre-commit` (git hook to prevent accidental removal)
- [ ] Run `chmod 444 docker-compose.yml` (make immutable)
- [ ] Create `scripts/docker/startup-container-audit.sh` (startup check)
- [ ] Add startup check to `npm run dev` (fail if containers missing)

### Week 2
- [ ] Create `scripts/docker/monitor-containers.sh` (background monitoring)
- [ ] Add to cron (runs every 30 minutes)
- [ ] Set up log rotation (`.tmp/docker-events-*.log`)

### Week 3
- [ ] Create audit script (`audit-compose-against-graphify.mjs`)
- [ ] Integrate into CI/CD (check on every build)
- [ ] Document results in AUDIT_RESULTS.md

---

## Quick Prevention Commands

```bash
# 1. Create git hook (one-time)
mkdir -p .git/hooks && cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
if git diff --cached -- docker-compose.yml | grep -E "^-  (postgres|rabbitmq|valkey|qdrant)" > /dev/null; then
  echo "❌ Service removal blocked"
  exit 1
fi
EOF
chmod +x .git/hooks/pre-commit

# 2. Make docker-compose.yml read-only
chmod 444 docker-compose.yml

# 3. Always use docker-compose with explicit profiles
docker-compose --profile full --profile seaweedfs up -d

# 4. Backup before destructive operations
docker exec legal-ai-postgres pg_dump -U legal_admin -d legal_ai_db > backup_$(date +%s).sql

# 5. Check container count regularly
watch -n 30 'docker ps | grep legal-ai | wc -l'  # Expect 20+
```

---

## Monitoring Dashboard

**Create**: `.tmp/docker-status-dashboard.md`

Runs every 5 minutes via cron:

```bash
#!/bin/bash
echo "# Docker Status — $(date)" > .tmp/docker-status-dashboard.md
echo "" >> .tmp/docker-status-dashboard.md
echo "## Container Count: $(docker ps | grep legal-ai | wc -l)" >> .tmp/docker-status-dashboard.md
echo "## Last Event: $(tail -1 .tmp/docker-events-*.log | sed 's/\[.*\] //')" >> .tmp/docker-status-dashboard.md
echo "" >> .tmp/docker-status-dashboard.md
docker ps --filter name=legal-ai --format "table {{.Names}}\t{{.Status}}" >> .tmp/docker-status-dashboard.md
```

---

## References

- Git Hook: `.git/hooks/pre-commit` (blocks accidental removal)
- Monitoring: `scripts/docker/monitor-containers.sh` (tracks lifecycle)
- Immutability: `chmod 444 docker-compose.yml` (read-only)
- Audit: `scripts/docker/audit-compose-against-graphify.mjs` (service registry validation)
- Production Hardening: `memory/docker-production-hardening.md` (full guide)

---

**Status**: Prevention strategy ready for implementation.  
**Next**: Wire startup audit into npm run dev pipeline.