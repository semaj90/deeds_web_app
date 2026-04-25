# 🔄 BullMQ → RabbitMQ Migration Complete Guide

**Status**: ✅ Ready to Apply  
**Date**: 2025-11-03  
**Integration**: Phase 34C+34D Orchestrator

---

## 🎯 Overview

Complete migration system to replace BullMQ with RabbitMQ using existing .env configuration and Docker setup. Includes AST-aware code transformation, compatibility wrappers, and validation.

---

## 📊 Dry-Run Results

```
Files to migrate:    11
Successful:          10
Skipped:             1
Changes detected:    6 import replacements
Errors:              0
Success Rate:        100%
```

---

## 📁 Files Affected

### Migrated Files
1. `src/lib/bullmq/bullmqService.ts`
2. `src/lib/phase14/server/queues/logQueue.ts`
3. `src/lib/phase14/server/queues/logWorker.ts`
4. `src/lib/phase14/server/workers/logWorker.ts`
5. `src/lib/services/job-queue.ts`
6. `src/lib/services/queue-service.ts`
7. `src/lib/state/evidenceProcessingMachine.ts`
8. `src/routes/api/legal-ai/process-document/+server.ts`
9. `src/routes/api/log/+server.ts`
10. `src/routes/api/upload/presign/+server.ts`

### New Files Created
- ✅ `src/lib/rabbitmq/index.ts` - RabbitMQ wrapper with BullMQ-compatible API
- ✅ `scripts/migrate-bullmq-rabbitmq-enhanced.mjs` - Migration tool
- ✅ `orchestrator-results/bullmq-migration-report.json` - Migration report

---

## ⚙️ Configuration

### .env (Updated)
```env
# RabbitMQ Message Queue
RABBITMQ_URL=amqp://guest:guest@localhost:5672
RABBITMQ_ENABLED=true
# Docker: RABBITMQ_URL=amqp://legal_admin:123456@rabbitmq:5672
```

### Docker Compose (Already Configured)
```yaml
rabbitmq:
  image: rabbitmq:3-management-alpine
  container_name: legal-ai-rabbitmq
  environment:
    - RABBITMQ_DEFAULT_USER=legal_admin
    - RABBITMQ_DEFAULT_PASS=123456
    - RABBITMQ_DEFAULT_VHOST=/
  ports:
    - "5672:5672"   # AMQP port
    - "15672:15672" # Management UI port
```

### Package.json Changes
```json
{
  "dependencies": {
    "bullmq": "removed",
    "amqplib": "^0.10.3"
  }
}
```

---

## 🚀 How to Apply Migration

### Option 1: VS Code Task (Recommended)

Press `Ctrl+Shift+P` → "Tasks: Run Task" → Select:
- **✅ BullMQ → RabbitMQ Migration (Apply)**

### Option 2: Command Line

```powershell
# Dry-run first (preview changes)
node scripts/migrate-bullmq-rabbitmq-enhanced.mjs --validate

# Apply migration
node scripts/migrate-bullmq-rabbitmq-enhanced.mjs --apply --validate
```

---

## 🔧 Migration Process

The migration tool performs these steps automatically:

### Step 1: Create RabbitMQ Wrapper
Creates `src/lib/rabbitmq/index.ts` with BullMQ-compatible API:
- `RabbitMQQueue` - Drop-in replacement for BullMQ Queue
- `RabbitMQWorker` - Drop-in replacement for BullMQ Worker
- `RabbitMQJob` - Type definition for jobs

### Step 2: Migrate Imports
**Before:**
```typescript
import { Queue, Worker } from 'bullmq';
```

**After:**
```typescript
import { RabbitMQQueue, RabbitMQWorker, RabbitMQJob } from '$lib/rabbitmq';
```

### Step 3: Replace Instantiations
**Before:**
```typescript
const queue = new Queue('my-queue');
const worker = new Worker('my-queue', processor);
```

**After:**
```typescript
const queue = new RabbitMQQueue('my-queue');
const worker = new RabbitMQWorker('my-queue', processor);
```

### Step 4: Update Connection Strings
**Before:**
```typescript
connection: { host: 'redis://localhost:6379' }
```

**After:**
```typescript
// Handled automatically via process.env.RABBITMQ_URL
```

### Step 5: Update Comments
All references to "BullMQ" and "Redis queue" are replaced with "RabbitMQ"

---

## 🎓 API Compatibility

The RabbitMQ wrapper provides BullMQ-compatible API:

### Queue API
```typescript
// Add job to queue
await queue.add('process-document', { fileId: '123' });

// Close queue
await queue.close();
```

### Worker API
```typescript
// Process jobs
const worker = new RabbitMQWorker('my-queue', async (job) => {
  console.log('Processing:', job.data);
  return { success: true };
});

// Close worker
await worker.close();
```

### Job Type
```typescript
type RabbitMQJob = {
  id: string;
  name: string;
  data: any;
  timestamp?: number;
};
```

---

## 🔍 Verification

### 1. Check RabbitMQ is Running

```powershell
# Start RabbitMQ via Docker
docker-compose up -d rabbitmq

# Check status
docker ps | findstr rabbitmq

# Access management UI
# Open browser: http://localhost:15672
# Login: legal_admin / 123456
```

### 2. Verify Migration

```powershell
# Check for BullMQ references (should be none)
Get-ChildItem -Recurse -Include "*.ts","*.js" | Select-String "from 'bullmq'"

# Check for RabbitMQ imports (should find many)
Get-ChildItem -Recurse -Include "*.ts","*.js" | Select-String "from '\$lib/rabbitmq'"
```

### 3. Test Queue Functionality

```typescript
// Test file: test-rabbitmq-queue.ts
import { RabbitMQQueue, RabbitMQWorker } from '$lib/rabbitmq';

const queue = new RabbitMQQueue('test-queue');
await queue.add('test-job', { message: 'Hello RabbitMQ!' });

const worker = new RabbitMQWorker('test-queue', async (job) => {
  console.log('Received:', job.data);
});
```

---

## 📊 Before & After Comparison

### Before (BullMQ + Redis)
```typescript
import { Queue, Worker } from 'bullmq';

const queue = new Queue('logs', {
  connection: {
    host: 'localhost',
    port: 6379
  }
});

const worker = new Worker('logs', async (job) => {
  console.log(job.data);
}, {
  connection: {
    host: 'localhost',
    port: 6379
  }
});
```

### After (RabbitMQ + AMQP)
```typescript
import { RabbitMQQueue, RabbitMQWorker } from '$lib/rabbitmq';

const queue = new RabbitMQQueue('logs');
// Connection via process.env.RABBITMQ_URL

const worker = new RabbitMQWorker('logs', async (job) => {
  console.log(job.data);
});
// Connection via process.env.RABBITMQ_URL
```

---

## 🛡️ Safety Features

### Automatic Backups
Every modified file gets a backup:
```
original-file.ts → original-file.ts.bullmq-backup-{timestamp}
```

### Dry-Run Mode
Preview all changes before applying:
```powershell
node scripts/migrate-bullmq-rabbitmq-enhanced.mjs  # No --apply = dry-run
```

### Validation
Checks RabbitMQ connectivity before reporting success:
```powershell
node scripts/migrate-bullmq-rabbitmq-enhanced.mjs --validate
```

### Migration Report
Complete JSON report generated at:
```
orchestrator-results/bullmq-migration-report.json
```

---

## 🔧 Post-Migration Steps

### 1. Install Dependencies
```powershell
npm install
```

### 2. Start RabbitMQ
```powershell
# Via Docker Compose
docker-compose up -d rabbitmq

# Or standalone
docker run -d --name rabbitmq \
  -p 5672:5672 \
  -p 15672:15672 \
  -e RABBITMQ_DEFAULT_USER=legal_admin \
  -e RABBITMQ_DEFAULT_PASS=123456 \
  rabbitmq:3-management-alpine
```

### 3. Test Application
```powershell
npm run dev
```

### 4. Verify Queues
Open RabbitMQ Management UI:
- URL: http://localhost:15672
- Username: `legal_admin`
- Password: `123456`

---

## 🐛 Troubleshooting

### "Cannot connect to RabbitMQ"
```powershell
# Check if RabbitMQ is running
docker ps | findstr rabbitmq

# Check logs
docker logs legal-ai-rabbitmq

# Restart container
docker-compose restart rabbitmq
```

### "Queue not found"
```typescript
// Queues are created automatically
// Just ensure RabbitMQ is running
const queue = new RabbitMQQueue('my-queue'); // Creates queue if not exists
```

### "amqplib not installed"
```powershell
npm install amqplib
```

---

## 📊 Performance Comparison

| Feature | BullMQ (Redis) | RabbitMQ (AMQP) |
|---------|----------------|-----------------|
| **Protocol** | Redis protocol | AMQP |
| **Persistence** | Optional | Built-in |
| **Clustering** | Redis Cluster | RabbitMQ native |
| **Management UI** | BullBoard | Native UI |
| **Message Routing** | Basic | Advanced |
| **Dead Letter Queues** | Manual | Built-in |

---

## 🔗 Integration with Orchestrator

The migration is integrated with Phase 34C+34D orchestrator:

### Run as Part of Orchestrator
```powershell
# Migration will be detected and included in dashboard
.\scripts\run-orchestrator.ps1 -Apply
```

### Standalone Migration
```powershell
# Run independently
node scripts/migrate-bullmq-rabbitmq-enhanced.mjs --apply
```

---

## 📝 VS Code Tasks

**Total Tasks**: 16 (2 new for BullMQ migration)

### New Tasks
1. **🔄 BullMQ → RabbitMQ Migration (Dry-Run)**
   - Preview changes without modifying files

2. **✅ BullMQ → RabbitMQ Migration (Apply)**
   - Apply migration and validate RabbitMQ

---

## ✅ Success Checklist

- [x] RabbitMQ wrapper created
- [x] Migration script tested
- [x] .env updated with RabbitMQ config
- [x] Docker Compose has RabbitMQ service
- [x] VS Code tasks configured
- [x] Dry-run successful (10/11 files)
- [ ] Apply migration
- [ ] Install amqplib package
- [ ] Start RabbitMQ
- [ ] Test queue functionality
- [ ] Verify in Management UI

---

## 🚀 Next Steps

1. **Review dry-run results**
   ```powershell
   code orchestrator-results/bullmq-migration-report.json
   ```

2. **Apply migration**
   ```powershell
   node scripts/migrate-bullmq-rabbitmq-enhanced.mjs --apply --validate
   ```

3. **Install dependencies**
   ```powershell
   npm install
   ```

4. **Start RabbitMQ**
   ```powershell
   docker-compose up -d rabbitmq
   ```

5. **Test application**
   ```powershell
   npm run dev
   ```

---

**Status**: ✅ Ready to Apply  
**Estimated Time**: 5 minutes  
**Risk Level**: Low (backups created automatically)  
**Rollback**: Restore from `.bullmq-backup-{timestamp}` files

*Complete BullMQ to RabbitMQ migration system ready for deployment.*
