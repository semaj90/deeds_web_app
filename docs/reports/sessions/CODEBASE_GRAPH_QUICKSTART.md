# Codebase Knowledge Graph - Quick Start

**Transform your 15,651 indexed files into a queryable Neo4j knowledge graph**

---

## Prerequisites

✅ Qdrant running with `codebase_chunks_768` collection (15,651 files)
✅ Neo4j running on `localhost:7687` (download: https://neo4j.com/download/)
✅ Node.js with ES modules support
✅ simdjson N-API addon available (2-5× faster JSON parsing)

---

## Step 1: Audit Your Codebase (15 min)

Analyze your indexed files to understand the graph structure:

```bash
node scripts/audit/codebase-graph-audit.mjs
```

**What it does**:
- Fetches all 15,651 points from Qdrant
- Uses **simdjson** for 2-5× faster JSON parsing
- Analyzes imports, exports, node types, languages
- Detects orphan files and tightly connected clusters
- Saves `codebase-graph-audit.json` for Neo4j ingestion

**Expected output**:
```
📊 Total Files Indexed: 15,651
🚀 SIMD JSON Speedup: 156 fast parses, 0 V8 parses

📊 Node Types:
  api_route            3,200 (20.4%)
  server_module        2,800 (17.9%)
  component            2,100 (13.4%)
  ...

🌐 Languages:
  TypeScript          12,400 (79.2%)
  Svelte               2,100 (13.4%)
  JavaScript             800 (5.1%)
  ...

🔗 Edge Types:
  imports             42,000 edges

🏝️  Orphan Files (no imports/exports): 320

✅ Audit complete! Ready for Neo4j graph creation.
```

---

## Step 2: Build Neo4j Graph (30 min)

Create the knowledge graph from audit data:

```bash
# Make sure Neo4j is running first!
node scripts/build-codebase-graph.mjs
```

**What it does**:
- Connects to Neo4j
- Creates ~15,000 `File` nodes with metadata
- Creates ~42,000 `IMPORTS` edges
- Creates cluster metadata for tightly connected components
- Adds indexes for fast queries

**Expected output**:
```
✅ Connected to Neo4j
🔧 Creating Neo4j constraints...
📁 Creating file nodes...
  Created 15,651 file nodes
🔗 Creating import edges...
  Created 42,000 import edges
🌐 Creating cluster metadata...
  Created 23 cluster nodes

📊 Neo4j Graph Statistics:
  Files: 15,651
  Import edges: 42,000
  Clusters: 23

🔝 Top 10 Most Imported Files:
   487 - src/lib/server/db/schema-postgres.ts
   312 - src/lib/server/db/client.ts
   289 - src/lib/server/redis.ts
   ...
```

---

## Step 3: Query Your Graph

Open Neo4j Browser: http://localhost:7474

**Example queries**:

### Find all API routes

```cypher
MATCH (f:File {type: 'api_route'})
RETURN f.path
LIMIT 20
```

### Find most imported files (central modules)

```cypher
MATCH (f:File)<-[r:IMPORTS]-()
WITH f, count(r) as importCount
ORDER BY importCount DESC
LIMIT 10
RETURN f.path, importCount
```

### Find orphan files (no imports or exports)

```cypher
MATCH (f:File)
WHERE NOT (f)-[:IMPORTS]->() AND NOT ()-[:IMPORTS]->(f)
RETURN f.path, f.type
LIMIT 20
```

### Find all files that import a specific module

```cypher
MATCH (source:File)-[:IMPORTS]->(target:File {path: 'src/lib/server/db/client.ts'})
RETURN source.path
```

### Find circular dependencies

```cypher
MATCH (a:File)-[:IMPORTS]->(b:File)-[:IMPORTS]->(a)
RETURN a.path, b.path
```

### Find largest connected component

```cypher
MATCH (f:File)-[:BELONGS_TO]->(c:Cluster)
WHERE c.size > 10
RETURN c.id, c.size, collect(f.path)[0..5] as sampleFiles
ORDER BY c.size DESC
LIMIT 1
```

---

## Step 4: Add Semantic Similarity Edges (Optional)

Connect semantically similar code chunks:

```bash
node scripts/add-semantic-edges.mjs
```

This will:
- Query Qdrant for each file's nearest neighbors (vector similarity > 0.8)
- Add `SIMILAR_TO` edges with similarity scores
- Enable semantic graph traversal

**Warning**: This is slow for 15K files (~2-3 hours). Run in background.

---

## Step 5: View D3 Visualization

**The visualization is already built and ready to use!**

```bash
# Start dev server (if not already running)
npm run dev

# Visit codebase graph visualization
open http://localhost:5173/demos/codebase-graph
```

**Features:**
- ✅ Interactive D3 force-directed layout
- ✅ File limit control (100-5000 files)
- ✅ Toggle import edges on/off
- ✅ Filter by edge type (all/imports/containment)
- ✅ Live stats (files, chunks, directories, import edges)
- ✅ Extension breakdown
- ✅ Domain breakdown
- ✅ Drag nodes, zoom, pan
- ✅ Hover tooltips with full file paths

**Implementation:**
- API: `/api/codebase-index/graph` (enhanced with import extraction)
- Component: `ProvenanceGraph.svelte` (D3 force simulation)
- Route: `/demos/codebase-graph` (Svelte 5 with controls)

See `CODEBASE_KG_PLAN.md` for architecture details.

---

## Performance Notes

### SIMD JSON Parsing

The audit script uses **simdjson** via N-API for 2-5× faster JSON parsing:

- ✅ **With simdjson**: ~30 seconds for 15,651 files
- ❌ **Without simdjson**: ~2 minutes for 15,651 files

Check if available:
```javascript
import { isSimdJsonAvailable } from './src/lib/server/gpu/simdjson-bridge.js';
console.log(isSimdJsonAvailable()); // Should be true
```

### Neo4j Performance

**Expected times** (depends on hardware):
- Constraint creation: <1 second
- File node creation: ~30 seconds (batched)
- Import edge creation: ~60 seconds (batched)
- Total graph build: ~2-3 minutes

**Optimization tips**:
- Use batching (already implemented - 500 nodes/edges per batch)
- Create indexes BEFORE inserting data
- Use `MERGE` for idempotent inserts
- Use `UNWIND` for batch operations

---

## Troubleshooting

### "Cannot connect to Qdrant"

```bash
# Check if Qdrant is running
curl http://localhost:6333/

# Check collection exists
curl http://localhost:6333/collections/codebase_chunks_768
```

### "Cannot connect to Neo4j"

```bash
# Check if Neo4j is running
curl http://localhost:7687/

# Or start via Docker
docker run -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/password \
  neo4j:latest
```

### "simdjson not available"

If simdjson addon isn't loading:
```bash
# Check addon exists
ls simd-bridge/cpp/build/Release/tensorrt_bridge.node

# If missing, rebuild
cd simd-bridge/cpp
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release
```

Fallback: The script will use V8 JSON.parse (2-5× slower, but still works).

---

## Next Steps

After building the graph:

1. **Explore in Neo4j Browser** - Visualize subgraphs, find patterns
2. **Build D3 web visualization** - See `CODEBASE_KG_PLAN.md`
3. **Add semantic search** - Query graph + vector search hybrid
4. **Export to Obsidian** - Generate markdown notes with [[wikilinks]]
5. **Integrate with RAG** - Use graph for context expansion

---

## Files Created

```
scripts/audit/codebase-graph-audit.mjs   - Audit script (runs first)
scripts/build-codebase-graph.mjs         - Neo4j graph builder
codebase-graph-audit.json                - Audit output (JSON)
CODEBASE_KG_PLAN.md                      - Full implementation plan
CODEBASE_GRAPH_QUICKSTART.md            - This file
```

---

**Ready to build your knowledge graph? Run Step 1 now!**

```bash
node scripts/audit/codebase-graph-audit.mjs
```