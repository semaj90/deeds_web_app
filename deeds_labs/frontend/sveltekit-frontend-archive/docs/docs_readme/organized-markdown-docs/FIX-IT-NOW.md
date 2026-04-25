# 🚨 IMMEDIATE ACTION PLAN - Fix Your App NOW!

## THE PROBLEM (What's Actually Broken)
1. **TypeScript won't compile** - 10 errors blocking everything
2. **Wrong API endpoint** - Calling `/api/enhanced-document-ingestion` (doesn't exist)
3. **Services failing** - Ports 8084/8085 not responding
4. **YoRHa not homepage** - Beautiful interface hidden at `/yorha-dashboard`
5. **Database saves failing** - CRUD operations not working

## THE SOLUTION (3 Commands to Fix Everything)

### Command 1: Fix All TypeScript Errors
```powershell
# This fixes all TypeScript errors automatically
node fix-typescript-errors.mjs
```

### Command 2: Run Complete Native Setup
```powershell
# Run as Administrator!
.\START-NATIVE-WINDOWS-COMPLETE.ps1
```

### Command 3: Verify Everything Works
```powershell
# Check all services are running
.\test-rag-system.ps1
```

## WHAT THESE SCRIPTS DO

### `fix-typescript-errors.mjs` will:
- ✅ Fix the wrong API endpoint (changes to `/api/enhanced-rag`)
- ✅ Add missing type imports
- ✅ Remove duplicate declarations
- ✅ Update tsconfig.json
- ✅ Create missing type definitions
- ✅ Check for port conflicts

### `START-NATIVE-WINDOWS-COMPLETE.ps1` will:
- ✅ Kill processes blocking ports
- ✅ Make YoRHa your homepage (backs up old one)
- ✅ Start PostgreSQL natively
- ✅ Start Redis natively
- ✅ Start Neo4j natively
- ✅ Start MinIO natively
- ✅ Start Ollama
- ✅ Load AI models
- ✅ Run database migrations
- ✅ Start your app

## MANUAL FIXES (If Scripts Don't Work)

### Fix 1: The API Route
```javascript
// Find this in your code:
fetch('/api/enhanced-document-ingestion', ...)

// Replace with:
fetch('/api/enhanced-rag', {
    method: 'POST',
    body: JSON.stringify({ action: 'ingest', ...data })
})
```

### Fix 2: Make YoRHa Homepage
```bash
# Backup old homepage
cp src/routes/+page.svelte src/routes/+page.svelte.backup

# Make YoRHa the homepage
cp src/routes/yorha-dashboard/+page.svelte src/routes/+page.svelte
```

### Fix 3: Kill Blocking Processes
```powershell
# Find what's using ports
netstat -ano | findstr :8084
netstat -ano | findstr :8085
netstat -ano | findstr :3000

# Kill the process (replace PID with actual number)
taskkill /F /PID [PID]
```

### Fix 4: Database Connection
```javascript
// src/lib/server/db.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const sql = postgres('postgresql://postgres:postgres@localhost:5432/legal_ai_db?sslmode=disable');
export const db = drizzle(sql);
```

## SERVICE PORTS (What Should Be Running)

| Service | Port | Check URL |
|---------|------|-----------|
| SvelteKit App | 3000 | http://localhost:3000 |
| PostgreSQL | 5432 | - |
| Redis | 6379 | - |
| Neo4j Browser | 7474 | http://localhost:7474 |
| Neo4j Bolt | 7687 | - |
| GPU Orchestrator | 8084 | http://localhost:8084/health |
| RAG Service | 8085 | http://localhost:8085/health |
| MinIO API | 9000 | http://localhost:9000 |
| MinIO Console | 9001 | http://localhost:9001 |
| Ollama | 11434 | http://localhost:11434 |

## QUICK VALIDATION

After running the fixes, you should see:
1. ✅ YoRHa interface at http://localhost:3000
2. ✅ No TypeScript errors when running `npm run check`
3. ✅ All services responding
4. ✅ File upload working
5. ✅ AI chat responding
6. ✅ Database saving data

## IF NOTHING ELSE WORKS

### Nuclear Option - Fresh Start
```powershell
# 1. Kill everything
Get-Process | Where-Object {$_.Name -match "node|ollama|postgres|redis|neo4j|minio"} | Stop-Process -Force

# 2. Clear ports
netstat -ano | findstr "3000 5432 6379 7474 8084 8085 9000 11434" | ForEach-Object {
    $pid = ($_ -split '\s+')[-1]
    taskkill /F /PID $pid
}

# 3. Fresh install
Remove-Item -Recurse -Force node_modules
npm install

# 4. Start clean
.\START-NATIVE-WINDOWS-COMPLETE.ps1
```

## THE RESULT

Once everything is fixed, you'll have:
- 🎮 **YoRHa Interface** as your homepage
- 🧠 **Enhanced RAG** fully operational
- 💾 **All databases** connected and saving
- 🤖 **AI Assistant** responding
- 📁 **60+ pages** accessible via sidebar
- 🚀 **Native Windows** performance (no Docker overhead)

---

**START HERE:** Run `node fix-typescript-errors.mjs` right now!
