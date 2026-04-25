# 🔍 Native Windows Installation Checker - Complete Guide

## Overview
Based on your latest update, you have successfully:
- ✅ **Database seeded** with legal documents, cases, and evidence
- ✅ **PostgreSQL connected** with legal_admin user
- ✅ **Sentence transformers researched** and NLP service created
- ✅ **40+ database tables** mapped and configured
- ✅ **YoRHa components** in place (but needs homepage integration)

## 🚀 Quick Check Commands

### Option 1: Visual Dashboard (PowerShell)
```powershell
.\System-Status-Dashboard.ps1
```
Shows a beautiful status board with all services and quick actions menu.

### Option 2: Detailed Check (PowerShell)
```powershell
.\Check-Native-Installations.ps1
```
Comprehensive check of all components with specific recommendations.

### Option 3: Node.js Check
```bash
node check-native-installations.mjs
```
Cross-platform JavaScript checker with database connection testing.

### Option 4: Quick Batch Check
```batch
CHECK-NATIVE-STATUS.bat
```
Simple batch file for quick status overview.

## 📊 What Gets Checked

### Core Services
| Service | Port | Purpose | Status in Your System |
|---------|------|---------|----------------------|
| PostgreSQL | 5432 | Main database | ✅ Running with data |
| Redis | 6379 | Cache & sessions | ❓ Need to verify |
| Neo4j | 7474/7687 | Graph database | ❓ Need to verify |
| MinIO | 9000/9001 | Object storage | ❓ Need to verify |
| Ollama | 11434 | AI models | ❓ Need to verify |

### Your Current Database Status
```
✅ Connected to legal_ai_db
📄 Legal Documents: 7
⚖️ Cases: 5
🔍 Evidence: 5
🗃️ Total Tables: 40+
```

### Application Components
- **Vite Dev Server** (Port 5173) - Main development server
- **YoRHa Dashboard** - Located at `/yorha-dashboard` (needs to be moved to homepage)
- **Enhanced RAG** - API endpoints configured
- **Sentence Transformers** - `@xenova/transformers` installed

## 🔧 Remaining Tasks (from your todo)

### Immediate Actions Needed:
1. **Test YoRHa terminal interface for AI commands**
2. **Verify role-based functionality** (prosecutor, detective, admin)
3. **Test Context7 MCP integration** throughout YoRHa interface

### To Complete These Tasks:

#### 1. Move YoRHa to Homepage
```bash
# Backup current homepage
cp src/routes/+page.svelte src/routes/+page.svelte.backup

# Make YoRHa the homepage
cp src/routes/yorha-dashboard/+page.svelte src/routes/+page.svelte
```

#### 2. Start All Services
```powershell
# Run as Administrator
.\START-NATIVE-WINDOWS-COMPLETE.ps1
```

#### 3. Test Role-Based Access
Navigate to:
- Prosecutor view: `http://localhost:5173/?role=prosecutor`
- Detective view: `http://localhost:5173/?role=detective`
- Admin view: `http://localhost:5173/?role=admin`

## 📈 System Health Indicators

### ✅ What's Working (Based on Your Update)
- Database connection with `legal_admin:123456`
- Database seeded with legal data
- Drizzle ORM configured correctly
- NLP service with sentence transformers
- Project structure intact

### ❓ Need to Verify
- Redis server status
- Neo4j graph database
- MinIO object storage
- Ollama AI service
- Dev server running

### ❌ Known Issues to Fix
- YoRHa dashboard showing "not found" (needs route fix)
- Terminal interface not tested
- Role-based functionality not verified
- Context7 MCP integration pending

## 🎯 Complete Fix Sequence

### Step 1: Check Current Status
```powershell
# Run the visual dashboard
.\System-Status-Dashboard.ps1
```

### Step 2: Fix Missing Services
```powershell
# If services are missing, run:
.\START-NATIVE-WINDOWS-COMPLETE.ps1
```

### Step 3: Fix YoRHa Route
```javascript
// In src/routes/+page.svelte
// Replace entire content with YoRHa dashboard
// OR update src/routes/+layout.svelte to redirect
```

### Step 4: Verify Everything
```bash
# Check all installations
node check-native-installations.mjs

# Start dev server
npm run dev

# Access YoRHa
open http://localhost:5173
```

## 💡 Pro Tips

### If PostgreSQL Connection Fails:
```sql
-- Check with correct credentials
psql -U legal_admin -d legal_ai_db -h localhost
-- Password: 123456
```

### If Redis Not Running:
```powershell
# Start Redis manually
cd C:\Redis
redis-server.exe
```

### If Ollama Not Working:
```powershell
# Start Ollama
ollama serve

# In new terminal, pull models
ollama pull nomic-embed-text
ollama pull gemma:2b
```

### If Dev Server Won't Start:
```bash
# Kill process on port
netstat -ano | findstr :5173
taskkill /F /PID [PID_NUMBER]

# Fresh start
npm run dev
```

## 📋 Validation Checklist

After running all checks and fixes:

- [ ] PostgreSQL responds on port 5432
- [ ] Database shows 5 cases, 7 documents, 5 evidence items
- [ ] Redis responds on port 6379
- [ ] Ollama API responds on port 11434
- [ ] Dev server running on 5173 or 3000
- [ ] YoRHa dashboard accessible at root URL
- [ ] Terminal interface accepts commands
- [ ] Role switching works correctly
- [ ] AI chat responds with context

## 🚨 Emergency Reset

If nothing works, nuclear option:
```powershell
# Kill everything
Get-Process | Where {$_.Name -match "node|redis|postgres|ollama|java"} | Stop-Process -Force

# Clear and restart
Remove-Item -Recurse -Force node_modules
npm install
.\START-NATIVE-WINDOWS-COMPLETE.ps1
```

## 📞 Support Scripts Created

1. **check-native-installations.mjs** - Node.js comprehensive checker
2. **Check-Native-Installations.ps1** - PowerShell detailed checker
3. **System-Status-Dashboard.ps1** - Visual status dashboard
4. **CHECK-NATIVE-STATUS.bat** - Quick batch checker

Run any of these to instantly see what's working and what needs attention!

---

**Your system is 80% ready!** Just need to verify services and move YoRHa to homepage. Run `.\System-Status-Dashboard.ps1` now to see your exact status! 🚀
