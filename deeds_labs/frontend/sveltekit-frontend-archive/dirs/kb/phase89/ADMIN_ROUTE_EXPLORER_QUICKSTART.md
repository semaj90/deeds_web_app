# Admin Route Explorer - Quick Start Guide

## 🚀 5-Minute Setup

### Prerequisites
- ✅ SvelteKit dev server running
- ✅ PostgreSQL running on port 5434
- ✅ Qdrant running on port 6333
- ✅ Ollama running on port 11434

### Start the Explorer

```powershell
# 1. Start dev server
cd sveltekit-frontend
npx vite dev --port 5175

# 2. Open browser
Start-Process "http://localhost:5175/admin/explorer"
```

That's it! 🎉

## 📸 What You'll See

### On Load
- 🗺️ **Header**: Route Explorer & Agent Control
- 🔍 **Search Bar**: Filter routes by path
- 🎛️ **Filters**: Type filter (all, page, api, etc.)
- 🌲 **Tree View**: Hierarchical file structure
- 📊 **Stats**: Total routes, errors, KB vectors

### After Selecting a Route
- 📈 **Metrics**: Type, errors, complexity, lines, functions, KB vectors
- 🔧 **Functions**: All function names from code
- 📦 **Dependencies**: Imported modules
- 🧠 **KB Entries**: Knowledge base entries with relevance scores
- 🤖 **Fix Button**: Trigger agent to fix errors

## 🎯 Common Tasks

### Find All Routes with Errors
1. Filter by type: "all"
2. Look for red borders on routes
3. Click route to see error details

### Check KB Coverage
1. Look at stats: "{X} in KB"
2. Click routes to see `kb_vectors` count
3. Gray background = not in KB (kb_vectors = 0)

### Trigger Agent Fix
1. Select route with errors
2. Scroll to bottom of details panel
3. Click "Fix with Agent"
4. Watch agent status indicator at top (🤖 pulsing = active)

### Explore Code Structure
1. Switch to Tree View (🌲)
2. Click folders to expand
3. Click files to see details

## 🔍 Keyboard Shortcuts (Future)
- `/` - Focus search
- `t` - Toggle tree/list view
- `←` `→` - Navigate routes
- `f` - Fix with agent

## 🐛 Troubleshooting

### Routes not loading
```powershell
# Check PostgreSQL
psql -h 127.0.0.1 -p 5434 -U user -d legal -c "\dt"

# Check Qdrant
curl http://localhost:6333/collections/phase76_knowledge_base
```

### KB vectors showing 0
```powershell
# Run learning pipeline to populate KB
node scripts/phase89-learning-pipeline.mjs --full-pipeline
```

### Agent not working
```powershell
# Check Ollama
curl http://localhost:11434/api/tags

# Verify gemma3-legal model exists
ollama list | grep gemma3-legal
```

### SSE not connecting
- Open browser DevTools → Network tab
- Look for `routes/stream` connection
- Should show "EventStream" type
- Check for errors in console

## 📊 Example Workflow

### Scenario: Fix High-Error Files

1. **Sort by errors** (future: add sort button)
2. **Select top file**
3. **Review KB entries** - See if similar fixes exist
4. **Click "Fix with Agent"**
5. **Watch progress** - Agent status shows progress %
6. **Review fixes** - Check console for generated fixes
7. **Repeat** for next file

### Scenario: Ensure Full KB Coverage

1. **Check stats** - See "{X} in KB" vs "Total {Y}"
2. **Filter to missing** (future: add "not in KB" filter)
3. **Review files** - Gray background = missing from KB
4. **Run pipeline** - `node scripts/phase89-learning-pipeline.mjs`
5. **Refresh explorer** - All files should now have kb_vectors > 0

## 🎨 UI Tips

- **Red border** = Has errors
- **Blue background** = Selected route
- **Gray background** = Not in KB
- **Pulsing 🤖** = Agent active
- **Numbers** = Error count / KB vector count

## 🔗 API Endpoints

If you want to integrate with other tools:

### Get all routes
```bash
curl http://localhost:5175/api/admin/routes
```

### Get KB entries for file
```bash
curl "http://localhost:5175/api/admin/knowledge?file_path=src/lib/utils.ts&limit=5"
```

### Trigger agent fix
```bash
curl -X POST http://localhost:5175/api/admin/agent/fix \
  -H "Content-Type: application/json" \
  -d '{"file_path":"src/lib/utils.ts","errors":["TS2304"]}'
```

### Watch real-time updates
```bash
curl -N http://localhost:5175/api/admin/routes/stream
```

## 📚 Full Documentation

See `kb/phase89/ADMIN_ROUTE_EXPLORER_COMPLETE.md` for comprehensive documentation.

---

**Happy Exploring! 🎉**
