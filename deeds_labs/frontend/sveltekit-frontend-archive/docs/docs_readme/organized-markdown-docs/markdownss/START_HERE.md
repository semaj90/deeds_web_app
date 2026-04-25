# 🚀 START HERE - Legal AI Assistant

Welcome! This guide will get you up and running in under 5 minutes.

## Prerequisites Check
Make sure you have:
- ✅ Windows 10 with WSL2
- ✅ Docker Desktop installed and running
- ✅ Node.js 18+ installed
- ✅ Git (optional but recommended)

## Quick Start (Choose One)

### Option 1: Visual Control Panel (Easiest)
```cmd
control-panel.bat
```
Then select option 1 to start everything!

### Option 2: One-Command Setup
```powershell
.\setup-complete-with-ollama.ps1
```

### Option 3: Super Quick
```cmd
quick-start.bat
```

## What Happens Next?

1. **Docker starts** these services:
   - PostgreSQL (database)
   - pgvector (AI embeddings)
   - Qdrant (vector search)
   - Redis (caching)
   - Ollama (AI models)
   - PgAdmin (database UI)

2. **AI models download** automatically:
   - nomic-embed-text (embeddings)
   - llama3.2 (chat)
   - gemma2:2b (fast responses)

3. **App opens** at http://localhost:5173

## First Steps in the App

1. **Login with demo account**:
   - Email: `admin@prosecutor.local`
   - Password: `demo123`

2. **Test AI features**:
   - Visit: http://localhost:5173/ai-test
   - Try each test button

3. **Explore demo data**:
   - Cases with AI analysis
   - Documents with embeddings
   - Semantic search examples

## Common Tasks

### Start Development
```powershell
npm run dev
```

### Stop Everything
```powershell
docker-compose down
```

### View Logs
```powershell
docker-compose logs -f
```

### Reset Database
```powershell
npm run db:reset
npm run seed
```

## Troubleshooting

### "Docker not running"
1. Open Docker Desktop
2. Wait for it to start
3. Try again

### "Port already in use"
```powershell
# Find what's using port 5173
netstat -ano | findstr :5173
# Kill it (replace PID with the number)
taskkill /PID <PID> /F
```

### "TypeScript errors"
```powershell
node fix-all-typescript-imports.mjs
```

## Need Help?

1. Run system check: `node test-system.mjs`
2. Check the logs: `docker-compose logs`
3. Read the full docs: See README.md

---

**That's it!** You're ready to build AI-powered legal applications. 🎉

The app is running at: http://localhost:5173
