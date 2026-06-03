# Codebase Knowledge Graph + Visualization

**Goal**: Turn your 15,651 indexed codebase files into a searchable, visual knowledge graph

**Current Status**:
- ✅ 15,651 files indexed in Qdrant `codebase_chunks_768`
- ✅ simdjson available (2-5× faster parsing)
- ✅ Embeddings via Ollama embeddinggemma (768-dim)
- ✅ Backend infrastructure: 15/17 passing

---

## 1. Knowledge Graph Schema

### Node Types

```typescript
interface CodebaseNode {
  id: string; // file path hash
  type: 'file' | 'function' | 'class' | 'import' | 'export' | 'type';
  name: string;
  path: string;
  language: 'typescript' | 'svelte' | 'javascript' | 'go' | 'proto' | 'sql';
  loc: number; // lines of code
  embedding: number[]; // 768-dim semantic vector
  metadata: {
    imports: string[];
    exports: string[];
    dependencies: string[];
    complexity?: number;
    lastModified: string;
  };
}
```

### Edge Types

```typescript
interface CodebaseEdge {
  source: string; // node ID
  target: string; // node ID
  type:
    | 'imports'           // A imports B
    | 'exports'           // A exports B
    | 'calls'             // A calls B
    | 'extends'           // A extends B
    | 'implements'        // A implements B
    | 'references'        // A references B
    | 'similar_to';       // semantic similarity > 0.8
  weight: number;         // importance/frequency
  metadata?: Record<string, unknown>;
}
```

---

## 2. Graph Construction Pipeline

### Step 1: Extract AST Relationships

**Tool**: Existing `/api/codebase-index/analyze` endpoint

```typescript
// For each file in Qdrant codebase_chunks_768:
async function buildGraph() {
  const files = await qdrant.scroll('codebase_chunks_768', { limit: 15651 });

  for (const file of files) {
    // Extract imports/exports via AST
    const ast = await analyzeFile(file.payload.file_path);

    // Create nodes
    const fileNode = createFileNode(file);
    const functionNodes = ast.functions.map(createFunctionNode);
    const classNodes = ast.classes.map(createClassNode);

    // Create edges
    const importEdges = ast.imports.map(imp => ({
      source: fileNode.id,
      target: resolveImportPath(imp),
      type: 'imports',
      weight: 1
    }));

    await neo4j.createNodes([fileNode, ...functionNodes, ...classNodes]);
    await neo4j.createEdges(importEdges);
  }
}
```

### Step 2: Semantic Similarity Edges

**Qdrant vector search** to find similar code chunks:

```typescript
async function addSemanticEdges() {
  const chunks = await qdrant.scroll('codebase_chunks_768');

  for (const chunk of chunks) {
    // Find top 5 most similar chunks
    const similar = await qdrant.search('codebase_chunks_768', {
      vector: chunk.vector,
      limit: 5,
      score_threshold: 0.8
    });

    // Create similarity edges
    for (const match of similar) {
      if (match.id !== chunk.id) {
        await neo4j.createEdge({
          source: chunk.id,
          target: match.id,
          type: 'similar_to',
          weight: match.score
        });
      }
    }
  }
}
```

### Step 3: Dependency Analysis

**Package imports** → external dependency nodes:

```typescript
const EXTERNAL_PATTERNS = [
  /^svelte/,
  /^@sveltejs\//,
  /^drizzle-orm/,
  /^qdrant-client/,
  /^ioredis/,
  // ... etc
];

async function addDependencyNodes() {
  const allImports = await neo4j.query(`
    MATCH (:File)-[r:imports]->(target)
    RETURN DISTINCT target
  `);

  for (const imp of allImports) {
    if (EXTERNAL_PATTERNS.some(p => p.test(imp))) {
      await neo4j.createNode({
        id: imp,
        type: 'external_dependency',
        name: imp,
        category: categorizePackage(imp) // 'framework', 'database', 'ui', etc.
      });
    }
  }
}
```

---

## 3. Visualization Options

### Option A: D3.js Force-Directed Graph

**Location**: `/demos/codebase-graph`

```svelte
<!-- CodebaseGraphD3.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import * as d3 from 'd3';

  let { width = 1200, height = 800 } = $props();

  onMount(async () => {
    const data = await fetch('/api/codebase-index/graph').then(r => r.json());

    const simulation = d3.forceSimulation(data.nodes)
      .force('link', d3.forceLink(data.edges).id(d => d.id))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2));

    // SVG rendering...
  });
</script>

<svg {width} {height}>
  <!-- D3 renders here -->
</svg>
```

**Features**:
- ✅ Interactive zoom/pan
- ✅ Node clustering by directory
- ✅ Color-coded by file type
- ✅ Edge thickness = dependency weight
- ✅ Hover = file info tooltip

### Option B: Obsidian Markdown Export

**Generate .md files** with bidirectional links:

```typescript
async function exportToObsidian() {
  const graph = await neo4j.getFullGraph();

  for (const node of graph.nodes) {
    const content = `
# ${node.name}

**Type**: ${node.type}
**Path**: \`${node.path}\`
**LOC**: ${node.loc}

## Imports
${node.metadata.imports.map(imp => `- [[${imp}]]`).join('\n')}

## Exports
${node.metadata.exports.map(exp => `- [[${exp}]]`).join('\n')}

## Similar Files
${getSimilarFiles(node).map(f => `- [[${f.name}]] (${f.similarity})`).join('\n')}
`;

    await writeFile(`obsidian-vault/${node.path}.md`, content);
  }
}
```

**Result**: Import into Obsidian → native graph view!

### Option C: 3D WebGL Graph (three.js)

**For large graphs** (15K+ nodes):

```typescript
import * as THREE from 'three';
import { ForceGraph3D } from '3d-force-graph';

const Graph = ForceGraph3D()
  .graphData(data)
  .nodeLabel('name')
  .nodeColor(node => colorByType(node.type))
  .linkWidth(link => link.weight)
  .linkOpacity(0.3);

Graph(document.getElementById('graph-container'));
```

**Performance**: Can handle 15K+ nodes with GPU acceleration

---

## 4. Semantic KAG Search

### Search Interface

**Location**: `/demos/codebase-search` or integrate into existing global search

```svelte
<script lang="ts">
  let query = $state('');
  let results = $state<SearchResult[]>([]);
  let mode = $state<'semantic' | 'structural'>('semantic');

  async function search() {
    if (mode === 'semantic') {
      // Vector search via Qdrant
      results = await fetch('/api/codebase-index/search', {
        method: 'POST',
        body: JSON.stringify({ query, limit: 20 })
      }).then(r => r.json());
    } else {
      // Graph traversal via Neo4j
      results = await fetch('/api/codebase-index/graph-search', {
        method: 'POST',
        body: JSON.stringify({
          startNode: query,
          maxDepth: 3,
          edgeTypes: ['imports', 'calls', 'similar_to']
        })
      }).then(r => r.json());
    }
  }
</script>

<input
  type="text"
  bind:value={query}
  placeholder="Search codebase... (e.g., 'authentication logic')"
/>

<div class="mode-toggle">
  <button onclick={() => mode = 'semantic'}>Semantic</button>
  <button onclick={() => mode = 'structural'}>Structural</button>
</div>

{#each results as result}
  <div class="result-card">
    <h3>{result.file_path}</h3>
    <pre><code>{result.content}</code></pre>
    <span class="score">Score: {result.score.toFixed(3)}</span>
  </div>
{/each}
```

### API Endpoints

**1. Semantic Search** (already exists):
```
POST /api/codebase-index/search
Body: { query: string, limit: number }
Returns: Vector similarity results from Qdrant
```

**2. Graph Search** (new):
```
POST /api/codebase-index/graph-search
Body: { startNode: string, maxDepth: number, edgeTypes: string[] }
Returns: Neo4j traversal results
```

**3. Hybrid Search** (new):
```
POST /api/codebase-index/hybrid-search
Body: { query: string, graphDepth: number, semanticLimit: number }
Returns: Fusion of vector + graph results
```

---

## 5. Implementation Steps

### Phase 1: Graph Construction (2-3 hours)

```bash
# 1. Create Neo4j graph from Qdrant index
node scripts/build-codebase-graph.mjs

# 2. Add semantic similarity edges
node scripts/add-semantic-edges.mjs

# 3. Verify graph stats
curl http://localhost:7474/db/neo4j/tx/commit -d '{
  "statements": [{
    "statement": "MATCH (n) RETURN count(n) as nodes"
  }]
}'
```

### Phase 2: API Endpoints (1 hour)

- [x] `GET /api/codebase-index/graph` - Full graph JSON — **DONE** (endpoint exists)
- [ ] `POST /api/codebase-index/graph-search` - Neo4j traversal — **VERIFY** (may exist, needs confirmation)
- [x] `POST /api/codebase-index/hybrid-search` - Vector + graph fusion — **DONE** (graph-informed retrieval operational)

### Phase 3: Visualization (2-3 hours)

- [x] Create `/demos/codebase-graph` route — **DONE** (route exists at (app)/demos/codebase-graph)
- [ ] Implement D3 force-directed layout — **VERIFY** (route exists, check if visualization complete)
- [ ] Add filters (by directory, by type, by language) — **VERIFY**
- [x] Add search integration — **DONE** (ACE KAG pipeline: Query → RAG → Graph Neighbors)

### Phase 4: Obsidian Export (Optional, 30 min)

- [ ] Generate markdown files — **DEFERRED** (graph APIs operational, Obsidian export not priority)
- [ ] Create `obsidian-vault/` directory — **DEFERRED**
- [ ] Add front-matter metadata — **DEFERRED**
- [x] Generate graph view JSON — **DONE** (Neo4j 3,140 nodes, CouchDB 8 recommendations)

---

## 6. Quick Start (Run This Now!)

```bash
# 1. Audit current codebase index
curl http://localhost:5173/api/codebase-index/stats

# 2. Build graph (if Neo4j running)
node -e "
const { spawn } = require('child_process');
const proc = spawn('node', ['scripts/build-codebase-graph.mjs']);
proc.stdout.pipe(process.stdout);
proc.stderr.pipe(process.stderr);
"

# 3. Start visualization dev server
npm run dev

# 4. Visit graph UI
open http://localhost:5173/demos/codebase-graph
```

---

## Expected Output

**Graph Stats**:
- Nodes: ~15,651 files + ~50K functions/classes
- Edges: ~80K imports + ~200K semantic similarities
- Clusters: ~30 major components (by directory)

**Search Performance**:
- Semantic: <100ms (Qdrant HNSW)
- Graph: <500ms (Neo4j Cypher, depth 3)
- Hybrid: <600ms (parallel queries + RRF fusion)

**Visualization**:
- Load time: ~2s (15K nodes)
- FPS: 60 (WebGL acceleration)
- Interactive: zoom, pan, filter, search

---

## Next Action

**What would you like to start with?**

1. **Build the graph** - Run graph construction script
2. **Create D3 visualization** - Interactive web-based graph
3. **Obsidian export** - Markdown files with [[wikilinks]]
4. **Hybrid search API** - Combine semantic + structural search

Let me know and I'll implement it!
