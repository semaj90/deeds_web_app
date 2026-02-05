# Legal AI Platform - Technical Documentation

## Architecture Overview

### Tech Stack

**Client-Side:**
- **ONNX Runtime Web** - EmbeddingGemma 300M model for browser-side embeddings
- **WebGPU** - GPU-accelerated compute shaders for text processing
- **WebAssembly (WASM)** - High-performance legal document analysis
- **IndexedDB** - Client-side persistent storage (via Dexie)
- **Loki.js** - In-memory client-side database
- **Drizzle ORM 0.44.7** - Type-safe database access
- **SvelteKit** - Full-stack framework with Svelte 5 runes

**Server-Side:**
- **PostgreSQL** (`legal_ai_db`) - Primary database with pgvector extension
- **Redis** (port 6379) - Caching + pub/sub messaging
- **Qdrant** (`@qdrant/js-client-rest 1.15.1`) - Vector search engine
- **LangExtract** (Python service, port 8000) - NLP entity extraction
- **Ollama** (port 11434) - Local LLM inference (embeddinggemma:latest)
- **MinIO** - Object storage for documents

---

## WebGPU Acceleration

### Phase 2: Compute Shader Implementation

The platform uses **WebGPU compute shaders** for GPU-accelerated legal document processing, providing 50-100x performance improvements over CPU-only processing.

#### Performance Comparison

| Operation | CPU (WASM) | WebGPU | Improvement |
|-----------|------------|---------|-------------|
| Text Similarity (100+ pages) | 2-5 seconds | 50-200ms | ~100x faster |
| Document Fingerprinting (1000+ pages) | 500ms | 10ms | ~50x faster |
| Vector Cosine Similarity | 20ms | 0.2ms | ~100x faster |

#### Architecture: Three-Tier Performance Hierarchy

```typescript
// Priority 1: WebGPU Compute Shaders (fastest)
if (this.computeShaders) {
    return await this.computeShaders.calculateTextSimilarity(vec1, vec2);
}

// Priority 2: WebGPU Embeddings (slower but more accurate)
if (this.useWebGPU && this.gemmaClient) {
    const emb1 = await this.gemmaClient.embed(text1);
    return this.cosineSimilarity(emb1, emb2);
}

// Priority 3: WASM/CPU Fallback (slowest but universal)
return await this.wasmModule.calculate_text_similarity(text1, text2);
```

### Key Features

**1. GPU-Accelerated Text Similarity**
- Uses compute shaders for cosine similarity calculation
- Processes character frequency vectors on GPU
- Handles documents up to 1 million characters

**2. GPU-Accelerated Document Fingerprinting**
- FNV-1a hashing algorithm implemented in WGSL
- Generates 256-bit (32-byte) fingerprints
- Context-aware hashing (includes neighbor analysis)

**3. Automatic Fallback Chain**
- Gracefully degrades if WebGPU unavailable
- Falls back to ONNX embeddings → WASM → pure CPU
- Zero configuration required

### Browser Compatibility

| Browser | WebGPU Support | Fallback Method |
|---------|---------------|-----------------|
| Chrome 113+ | ✅ Full support | - |
| Edge 113+ | ✅ Full support | - |
| Safari 18+ | ✅ Full support | - |
| Firefox | ⚠️ Not yet (2026) | WASM/CPU |

---

## Client-Side Document Processing

### Legal Processor (`legal-processor.ts`)

**Purpose:** Privacy-first, client-side legal document analysis

**Why Client-Side?**
1. **Privacy:** Sensitive legal data never leaves the client browser
2. **Latency:** Instant feedback during typing (no server round-trip)
3. **Offline:** Works without internet connection
4. **Cost:** No server compute costs for document analysis

### Capabilities

#### 1. Document Classification
```typescript
const result = await processor.processDocument(pdfFile);
// Returns: 'contract', 'legal_motion', 'statute', 'policy', 'case_law', etc.
```

#### 2. Legal Entity Extraction
```typescript
// Detects: persons, organizations, locations, legal concepts
const entities = result.legalEntities;
// Example: { type: 'person', text: 'John Smith', confidence: 0.8 }
```

#### 3. Citation Extraction
```typescript
// Detects: case law, statutes, regulations, rules
const citations = result.citations;
// Example: { type: 'case', citation: 'Smith v. Jones, 123 A.2d 456 (2020)' }
```

#### 4. Sensitive Information Detection
```typescript
// Detects: SSN, credit cards, phone numbers, emails, addresses
const sensitiveInfo = result.sensitiveInfo;
// Example: { type: 'ssn', value: '***-**-1234', masked: '***-**-****' }
```

#### 5. Document Fingerprinting
```typescript
// GPU-accelerated hash-based fingerprint (32 bytes)
const fingerprint = result.fingerprint; // Hex string
```

---

## Search Architecture

### Multi-Tier Search Strategy

```typescript
class UnifiedSearchService {
    async search(query: string) {
        // Tier 1: Client-side Loki.js (instant, cached data)
        const lokiResults = await this.lokiDB.find({ $text: query });

        // Tier 2: Redis full-text search (fast, server cache)
        const redisResults = await this.redis.ft.search('legal_docs', query);

        // Tier 3: Qdrant vector search (semantic, comprehensive)
        const embedding = await this.onnxClient.embed(query);
        const qdrantResults = await this.qdrant.search('documents', embedding);

        return this.mergeResults(lokiResults, redisResults, qdrantResults);
    }
}
```

### Why No ripgrep/awk?
- **ripgrep/awk** are CLI tools, not web APIs
- Use **PostgreSQL full-text search** + **Qdrant vector search** instead
- Client-side uses **Loki.js** for in-memory filtering

---

## RAG + KAG + DAG Strategy

### Current Implementation

**Phase 1: RAG (Retrieval-Augmented Generation)** ✅ Active
```
User Query → Embedding → Qdrant Vector Search → Context → Ollama LLM → Response
```

**Components:**
- **Embeddings:** Ollama `embeddinggemma:latest` or ONNX in-browser
- **Vector Store:** Qdrant + PostgreSQL pgvector (hybrid search)
- **LLM:** Ollama local inference (privacy-first)

### Future Roadmap

**Phase 2: KAG (Knowledge Graph)** 🚧 Planned
```sql
-- Lightweight PostgreSQL-based graph (no Neo4j overhead)
CREATE TABLE knowledge_graph (
    source_entity TEXT,
    relation TEXT,
    target_entity TEXT,
    embedding vector(768),
    confidence FLOAT
);
```

**When to add Neo4j:**
- Only if complex graph traversal needed (e.g., precedent chains)
- Not required for basic entity relationships

**Phase 3: DAG (Directed Acyclic Graph)** 🚧 Planned
- Use **XState** for legal workflow orchestration
- Example: filing → review → discovery → trial
- Currently stubbed, not production-ready

---

## Message Queue Architecture

### Current: Redis Pub/Sub ✅

```typescript
// Publish document analysis completion
await redis.publish('document:analyzed', { docId, entities });

// Subscribe to events
await redis.subscribe('document:analyzed', (message) => {
    console.log('Document analyzed:', message);
});
```

**Capacity:** ~100k messages/second

### RabbitMQ: Not Currently Used ❌

**When to add RabbitMQ:**
- Only if Redis pub/sub exceeds 100k msgs/sec
- Only if you need complex routing/dead-letter queues
- Current workload doesn't require it

**Recommendation:** Stick with Redis until scale demands otherwise

---

## Client-Side Storage Hierarchy

### 1. Hot Data (Current Session)
```typescript
// Svelte 5 runes - reactive state
let currentCase = $state({ id: '', documents: [] });
```

### 2. Warm Data (Browser Session)
```typescript
// Loki.js - in-memory database
lokiDB.insert({ caseId: '123', cached: true });
```

### 3. Cold Data (Persistent)
```typescript
// IndexedDB - encrypted local storage
await idb.put('cases', {
    id: '123',
    data: await encrypt(sensitiveData)
});
```

### 4. Server Sync
```typescript
// PostgreSQL via Drizzle ORM
await db.insert(cases).values({
    id: '123',
    userId,
    encrypted: true
});
```

**Security Rule:** Never store unencrypted sensitive data client-side!

---

## LangExtract Integration

### Python NLP Service (Port 8000)

**Purpose:** Entity extraction, section parsing, legal concept detection

**Current Architecture:**
```typescript
// Direct HTTP calls (simple, reliable)
const response = await fetch('http://localhost:8000/extract', {
    method: 'POST',
    body: JSON.stringify({ text: documentText })
});
const entities = await response.json();
```

**Why No XState/RabbitMQ?**
- LangExtract is single-threaded Python (not multi-threaded)
- Direct HTTP + Redis caching is simpler and sufficient
- XState adds complexity without benefit for this use case

**Performance Optimization:**
```typescript
// Cache LangExtract results in Redis
const cacheKey = `langextract:${hash(documentText)}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);

const result = await callLangExtract(documentText);
await redis.setex(cacheKey, 3600, JSON.stringify(result));
```

---

## GPU Acceleration Details

### WebGPU Compute Shaders

**File:** `src/lib/webgpu/legal-compute-shaders.ts`

#### Text Similarity Shader (WGSL)
```wgsl
@group(0) @binding(0) var<storage, read> vec1: array<f32>;
@group(0) @binding(1) var<storage, read> vec2: array<f32>;
@group(0) @binding(2) var<storage, read_write> output: array<f32>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let idx = global_id.x;
    if (idx < arrayLength(&vec1)) {
        // Compute dot product + norms in parallel
        let dot = vec1[idx] * vec2[idx];
        atomicAdd(&output[0], bitcast<u32>(dot));

        let n1 = vec1[idx] * vec1[idx];
        atomicAdd(&output[1], bitcast<u32>(n1));

        let n2 = vec2[idx] * vec2[idx];
        atomicAdd(&output[2], bitcast<u32>(n2));
    }
}
```

**Result:** Cosine similarity = dotProduct / (sqrt(norm1) * sqrt(norm2))

#### Document Fingerprint Shader (WGSL)
```wgsl
@group(0) @binding(0) var<storage, read> input: array<u32>;
@group(0) @binding(1) var<storage, read_write> output: array<u32>;

const FNV_PRIME: u32 = 16777619u;
const FNV_OFFSET: u32 = 2166136261u;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let idx = global_id.x;
    if (idx < arrayLength(&input)) {
        var hash = FNV_OFFSET;
        hash = hash ^ input[idx];
        hash = hash * FNV_PRIME;

        // Context-aware: include neighbors
        if (idx > 0u) {
            hash = hash ^ input[idx - 1u];
        }
        if (idx < arrayLength(&input) - 1u) {
            hash = hash ^ input[idx + 1u];
        }

        output[idx] = hash;
    }
}
```

**Result:** 256-bit fingerprint via XOR reduction

---

## ONNX vs WebGPU: When to Use What

### ONNX Runtime Web
**Use For:**
- Transformer model inference (embeddings, classification)
- Pre-trained models (EmbeddingGemma 300M)
- Complex NLP tasks requiring learned weights

**Performance:** ~100ms for 512 tokens

**Example:**
```typescript
const embedding = await onnxSession.run({
    input_ids: tokenizedText
});
```

### WebGPU Compute Shaders
**Use For:**
- Vector math (similarity, distance, dot products)
- Hash functions, fingerprinting
- Matrix operations, aggregations

**Performance:** <1ms for 256-dimensional vectors

**Example:**
```typescript
const similarity = await computeShaders.calculateTextSimilarity(vec1, vec2);
```

### Hybrid Approach (Recommended)
```typescript
// ONNX for embeddings
const embedding = await onnxClient.embed(text);

// WebGPU for similarity computation
const results = await Promise.all(
    corpus.map(doc => computeShaders.calculateTextSimilarity(
        embedding,
        doc.embedding
    ))
);
```

---

## Database Schema

### Drizzle ORM 0.44.7

**Key Tables:**
- `users` - Authentication and profiles
- `cases` - Legal cases
- `documents` - Document metadata
- `document_vectors` - pgvector embeddings
- `knowledge_graph` - Entity relationships (future)
- `audit_logs` - Security tracking

**Vector Search:**
```typescript
import { sql } from 'drizzle-orm';

const results = await db
    .select()
    .from(documentVectors)
    .where(sql`embedding <-> ${queryEmbedding} < 0.5`)
    .orderBy(sql`embedding <-> ${queryEmbedding}`)
    .limit(10);
```

---

## Environment Configuration

**Key Environment Variables:**

```bash
# Database
DATABASE_URL=postgresql://legal_admin:password@localhost:5434/legal_ai_db

# Redis
REDIS_URL=redis://127.0.0.1:6379
REDIS_PASSWORD=redis

# Ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_EMBED_MODEL=embeddinggemma:latest

# Qdrant
QDRANT_URL=http://localhost:6333

# LangExtract
LANGEXTRACT_API_URL=http://localhost:8000

# MinIO
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin

# WebGPU
VITE_WEBGPU_ENABLED=true
ENABLE_WEBGPU=true
```

---

## Development Workflow

### Running the Stack

**1. Start Docker Services:**
```bash
docker start phase66-postgres phase66-redis phase66-minio phase66-qdrant
```

**2. Start Ollama:**
```bash
ollama serve
ollama pull embeddinggemma:latest
```

**3. Start LangExtract (Python):**
```bash
cd python_services/langextract
python -m uvicorn main:app --port 8000
```

**4. Start SvelteKit:**
```bash
cd sveltekit-frontend
npm run dev
```

**Access:** http://localhost:5173

### GPU-Accelerated Development

```bash
npm run dev:gpu
```

**Enables:**
- WebGPU compute shaders
- RTX 3060 Ti optimizations
- SIMD JSON parsing
- Redis compression
- Multi-core processing

---

## Performance Monitoring

### Key Metrics

**Client-Side:**
- Document processing time: `result.processingTime`
- WebGPU initialization: Check console for `✅ WebGPU Compute Shaders Ready`
- Fallback usage: Monitor console warnings

**Server-Side:**
- Redis cache hit rate: `INFO stats` → `keyspace_hits/keyspace_misses`
- PostgreSQL query time: Enable `log_duration = on`
- Qdrant search latency: Check `/metrics` endpoint

---

## Security Best Practices

### 1. Client-Side Encryption
```typescript
// Encrypt before storing in IndexedDB
const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    sensitiveData
);
```

### 2. Redaction
```typescript
// Automatically mask sensitive info
const masked = sensitiveInfo.map(info => ({
    ...info,
    value: info.value.replace(/./g, '*')
}));
```

### 3. Audit Logging
```typescript
await db.insert(auditLogs).values({
    userId,
    action: 'document_accessed',
    timestamp: new Date(),
    ipAddress,
    metadata: { documentId }
});
```

---

## Troubleshooting

### WebGPU Not Available

**Symptoms:** Console shows "WebGPU not supported"

**Solutions:**
1. Update browser to Chrome 113+, Edge 113+, or Safari 18+
2. Enable WebGPU flags: `chrome://flags/#enable-unsafe-webgpu`
3. Check GPU drivers are up to date
4. System will automatically fallback to WASM/CPU

### ONNX Model Loading Fails

**Symptoms:** "Failed to load EmbeddingGemma ONNX model"

**Solutions:**
1. Verify model exists: `/public/models/embeddinggemma_300m_onnx/model.onnx`
2. Check file size (should be ~300MB)
3. Ensure CORS allows loading from `/models/`
4. Clear browser cache and reload

### Redis Connection Refused

**Symptoms:** "ECONNREFUSED 127.0.0.1:6379"

**Solutions:**
```bash
# Start Redis container
docker start phase66-redis

# Or start locally
redis-server --port 6379
```

### Qdrant Collection Not Found

**Symptoms:** "Collection 'documents' not found"

**Solutions:**
```bash
# Create collection
curl -X PUT 'http://localhost:6333/collections/documents' \
  -H 'Content-Type: application/json' \
  -d '{
    "vectors": {
      "size": 768,
      "distance": "Cosine"
    }
  }'
```

---

## Visual Evidence Board System

### Architecture: Headless Board Engine + Fabric.js Renderer

**Goal:** Build a "Detective Mode" Miro/FigJam-style infinite canvas for legal evidence mapping while maintaining SSR-safety and offline-first capabilities.

#### Design Philosophy

**Core Principle:** Don't treat Fabric.js JSON as your product model.

```
BoardModel (headless core) → RenderAdapter (Fabric.js) → Canvas
```

**Benefits:**
- Clean undo/redo via command pattern
- Collaboration-ready (op-log)
- Renderer-agnostic (can swap Fabric for Canvas2D/SVG)
- SSR-safe in SvelteKit 2

---

### Package Structure

```
packages/
├── board-core/              # Headless engine (UI-agnostic)
│   ├── models/              # Nodes, edges, frames, viewport
│   ├── commands/            # addNode, moveNode, connect, etc.
│   ├── history/             # Undo/redo via command log
│   ├── selection/           # Selection state & hit regions
│   └── plugins/             # Evidence widgets, custom node types
├── board-render-fabric/     # Fabric.js adapter
│   ├── FabricRenderer.ts    # Model → Fabric objects
│   └── FabricEventBridge.ts # Input → Core commands
├── board-ui-svelte/         # Bits-UI v2 components
│   ├── Toolbar.svelte       # Pan, select, add, connect
│   ├── ContextMenu.svelte   # Right-click actions
│   ├── Inspector.svelte     # Properties panel
│   ├── Minimap.svelte       # Canvas overview
│   └── CommandPalette.svelte # Ctrl+K quick actions
└── apps/
    └── legalgl-ai/          # Your SvelteKit 2 app
        └── routes/boards/   # Board pages
```

---

### FigJam-Style UX Features

#### 1. Infinite Canvas
```typescript
// Viewport with momentum pan/zoom
interface Viewport {
    x: number;
    y: number;
    zoom: number; // 0.1 to 4.0
    momentum: { vx: number; vy: number };
}

// Spacebar + drag = hand tool
// Ctrl + wheel = zoom
// Double-click = zoom to fit
```

#### 2. Smart Selection
```typescript
// Lasso select, multi-select, align/distribute
const selection = {
    mode: 'pointer' | 'lasso' | 'hand',
    selectedIds: Set<string>,
    bounds: Rectangle,
    handles: ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']
};
```

#### 3. Sticky Notes
```typescript
interface StickyNote extends BoardNode {
    type: 'sticky';
    color: 'yellow' | 'pink' | 'blue' | 'green';
    text: string; // Rich text (basic formatting)
    fontSize: number;
    autoResize: boolean;
}
```

#### 4. Evidence Widgets
```typescript
// Fast specialized widgets
type EvidenceWidget =
    | { type: 'pdf-thumbnail'; evidenceId: string; pageNum: number }
    | { type: 'image-card'; evidenceId: string; url: string }
    | { type: 'text-snippet'; text: string; source: string }
    | { type: 'citation-card'; citation: LegalCitation }
    | { type: 'timeline-pin'; date: Date; event: string };
```

#### 5. Connectors
```typescript
interface ConnectorEdge {
    id: string;
    from: string; // Node ID
    to: string;
    fromAnchor: 'n' | 'e' | 's' | 'w' | 'center';
    toAnchor: 'n' | 'e' | 's' | 'w' | 'center';
    style: 'solid' | 'dashed' | 'arrow' | 'bidirectional';
    label?: string;
}
```

#### 6. Snap & Guides
```typescript
// Grid snap + alignment guides + smart spacing
const snapConfig = {
    gridSize: 20,
    snapToGrid: boolean,
    snapToObjects: boolean,
    snapDistance: 5,
    showGuides: boolean,
    showGrid: boolean
};
```

#### 7. Minimap
```typescript
// Canvas overview in corner
const minimap = {
    position: 'bottom-right',
    size: { w: 200, h: 150 },
    visible: boolean,
    viewport: Rectangle // Current view
};
```

#### 8. Command Palette (Ctrl+K)
```typescript
// Quick actions via Bits-UI
const commands = [
    { id: 'add-note', label: 'Add Sticky Note', shortcut: 'N' },
    { id: 'add-evidence', label: 'Attach Evidence', shortcut: 'E' },
    { id: 'create-link', label: 'Create Connection', shortcut: 'L' },
    { id: 'add-frame', label: 'Add Frame', shortcut: 'F' },
    { id: 'zoom-fit', label: 'Zoom to Fit', shortcut: '0' }
];
```

---

### Headless Core Responsibilities

#### Data Model
```typescript
// Canonical board state
interface BoardState {
    id: string;
    caseId: string;
    version: number;
    viewport: Viewport;
    nodes: Map<string, BoardNode>;
    edges: Map<string, ConnectorEdge>;
    frames: Map<string, Frame>;
    selection: SelectionState;
}

interface BoardNode {
    id: string;
    type: 'sticky' | 'evidence' | 'text' | 'image' | 'group';
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    zIndex: number;
    data: Record<string, any>;
    evidenceId?: string; // Link to evidence table
}

interface Frame {
    id: string;
    title: string;
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
    children: string[]; // Node IDs
}
```

#### Command System
```typescript
// All mutations via commands (undo/redo)
abstract class BoardCommand {
    abstract execute(state: BoardState): void;
    abstract undo(state: BoardState): void;
}

class AddNodeCommand extends BoardCommand {
    constructor(private node: BoardNode) {}
    execute(state: BoardState) {
        state.nodes.set(this.node.id, this.node);
    }
    undo(state: BoardState) {
        state.nodes.delete(this.node.id);
    }
}

class MoveNodesCommand extends BoardCommand {
    constructor(
        private nodeIds: string[],
        private delta: { x: number; y: number }
    ) {}
    execute(state: BoardState) {
        this.nodeIds.forEach(id => {
            const node = state.nodes.get(id);
            if (node) {
                node.x += this.delta.x;
                node.y += this.delta.y;
            }
        });
    }
    undo(state: BoardState) {
        this.nodeIds.forEach(id => {
            const node = state.nodes.get(id);
            if (node) {
                node.x -= this.delta.x;
                node.y -= this.delta.y;
            }
        });
    }
}
```

#### History Manager
```typescript
class BoardHistory {
    private undoStack: BoardCommand[] = [];
    private redoStack: BoardCommand[] = [];

    execute(command: BoardCommand, state: BoardState) {
        command.execute(state);
        this.undoStack.push(command);
        this.redoStack = []; // Clear redo on new action
    }

    undo(state: BoardState) {
        const command = this.undoStack.pop();
        if (command) {
            command.undo(state);
            this.redoStack.push(command);
        }
    }

    redo(state: BoardState) {
        const command = this.redoStack.pop();
        if (command) {
            command.execute(state);
            this.undoStack.push(command);
        }
    }
}
```

#### Plugin System
```typescript
interface BoardPlugin {
    name: string;
    nodeTypes?: Map<string, NodeFactory>;
    commands?: Map<string, CommandFactory>;
    hooks?: {
        onNodeAdded?: (node: BoardNode) => void;
        onNodeMoved?: (node: BoardNode) => void;
        onSelectionChanged?: (selection: SelectionState) => void;
    };
}

// Evidence plugin
const evidencePlugin: BoardPlugin = {
    name: 'evidence',
    nodeTypes: new Map([
        ['pdf-thumbnail', PdfThumbnailNodeFactory],
        ['citation-card', CitationCardNodeFactory]
    ]),
    hooks: {
        onNodeAdded: (node) => {
            if (node.evidenceId) {
                // Link to evidence table
                linkToEvidence(node.id, node.evidenceId);
            }
        }
    }
};
```

---

### Fabric.js Renderer Adapter

```typescript
class FabricBoardRenderer {
    private canvas: fabric.Canvas;
    private objectMap = new Map<string, fabric.Object>();

    constructor(canvasElement: HTMLCanvasElement) {
        this.canvas = new fabric.Canvas(canvasElement, {
            selection: true,
            preserveObjectStacking: true,
            renderOnAddRemove: false // Batch renders
        });
    }

    syncFromModel(state: BoardState) {
        // Update viewport
        this.canvas.setViewportTransform([
            state.viewport.zoom, 0, 0,
            state.viewport.zoom,
            state.viewport.x,
            state.viewport.y
        ]);

        // Sync nodes
        state.nodes.forEach((node, id) => {
            let obj = this.objectMap.get(id);
            if (!obj) {
                obj = this.createFabricObject(node);
                this.objectMap.set(id, obj);
                this.canvas.add(obj);
            } else {
                this.updateFabricObject(obj, node);
            }
        });

        this.canvas.requestRenderAll();
    }

    private createFabricObject(node: BoardNode): fabric.Object {
        switch (node.type) {
            case 'sticky':
                return new fabric.Rect({
                    left: node.x,
                    top: node.y,
                    width: node.width,
                    height: node.height,
                    fill: node.data.color || '#fef3c7',
                    stroke: '#fbbf24',
                    strokeWidth: 2,
                    rx: 4,
                    ry: 4
                });
            case 'evidence':
                return this.createEvidenceWidget(node);
            default:
                return new fabric.Rect({
                    left: node.x,
                    top: node.y,
                    width: node.width,
                    height: node.height
                });
        }
    }
}
```

#### Event Bridge (Input → Commands)
```typescript
class FabricEventBridge {
    constructor(
        private canvas: fabric.Canvas,
        private commandQueue: BoardCommandQueue
    ) {
        this.setupEventListeners();
    }

    private setupEventListeners() {
        // Object moved
        this.canvas.on('object:moved', (e) => {
            const target = e.target;
            if (target) {
                const command = new MoveNodesCommand(
                    [target.data.id],
                    { x: target.left!, y: target.top! }
                );
                this.commandQueue.execute(command);
            }
        });

        // Multi-select
        this.canvas.on('selection:created', (e) => {
            const selection = e.selected?.map(obj => obj.data.id) || [];
            this.commandQueue.execute(
                new UpdateSelectionCommand(selection)
            );
        });

        // Mouse wheel zoom
        this.canvas.on('mouse:wheel', (e) => {
            const delta = e.e.deltaY;
            const zoom = this.canvas.getZoom();
            const newZoom = Math.max(0.1, Math.min(4, zoom * (1 - delta / 1000)));

            this.commandQueue.execute(
                new SetViewportCommand({ zoom: newZoom })
            );
            e.e.preventDefault();
            e.e.stopPropagation();
        });
    }
}
```

---

### Data Persistence (Server + Offline)

#### PostgreSQL Schema (Drizzle ORM)
```typescript
// drizzle/schema/boards.ts
export const boards = pgTable('boards', {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id').notNull().references(() => cases.id),
    title: text('title').notNull(),
    version: integer('version').notNull().default(1),
    snapshot: jsonb('snapshot').$type<BoardSnapshot>().notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    updatedBy: uuid('updated_by').references(() => users.id)
});

export const boardVersions = pgTable('board_versions', {
    id: uuid('id').primaryKey().defaultRandom(),
    boardId: uuid('board_id').notNull().references(() => boards.id),
    version: integer('version').notNull(),
    snapshot: jsonb('snapshot').$type<BoardSnapshot>().notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id)
});

export const boardOps = pgTable('board_ops', {
    id: uuid('id').primaryKey().defaultRandom(),
    boardId: uuid('board_id').notNull().references(() => boards.id),
    version: integer('version').notNull(),
    op: jsonb('op').$type<BoardOperation>().notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id)
});

type BoardSnapshot = {
    version: number;
    viewport: { x: number; y: number; zoom: number };
    nodes: Array<BoardNode>;
    edges: Array<ConnectorEdge>;
    frames: Array<Frame>;
    meta: { updatedBy: string; updatedAt: string };
};
```

#### Offline-First (Loki.js + IndexedDB)
```typescript
// Local working set
class BoardLocalStorage {
    private db: Loki;
    private boards: Collection<BoardSnapshot>;
    private ops: Collection<BoardOperation>;

    constructor() {
        this.db = new Loki('boards.db', {
            adapter: new LokiIndexedAdapter('boards'),
            autoload: true,
            autosave: true,
            autosaveInterval: 4000
        });

        this.boards = this.db.addCollection('boards_local');
        this.ops = this.db.addCollection('board_ops_local');
    }

    // Save current working draft
    saveDraft(boardId: string, snapshot: BoardSnapshot) {
        this.boards.findAndUpdate(
            { id: boardId },
            (doc) => Object.assign(doc, snapshot)
        ) || this.boards.insert({ id: boardId, ...snapshot });
    }

    // Queue ops while offline
    queueOp(boardId: string, op: BoardOperation) {
        this.ops.insert({ boardId, op, queued: true });
    }

    // Sync on reconnect
    async syncToServer() {
        const queuedOps = this.ops.find({ queued: true });
        for (const entry of queuedOps) {
            await fetch('/api/boards/ops', {
                method: 'POST',
                body: JSON.stringify(entry.op)
            });
            this.ops.remove(entry);
        }
    }
}
```

#### Redis Caching
```typescript
// Hot board cache (latest snapshot)
async function getBoardSnapshot(boardId: string): Promise<BoardSnapshot> {
    const cacheKey = `board:${boardId}:snapshot`;

    // Try Redis cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
        return JSON.parse(cached);
    }

    // Fetch from Postgres
    const board = await db.query.boards.findFirst({
        where: eq(boards.id, boardId)
    });

    if (board) {
        // Cache for 5 minutes
        await redis.setex(cacheKey, 300, JSON.stringify(board.snapshot));
        return board.snapshot;
    }

    throw new Error('Board not found');
}
```

---

### SSR-Safe SvelteKit Integration

```svelte
<!-- routes/boards/[boardId]/+page.svelte -->
<script lang="ts">
    import { onMount } from 'svelte';
    import { BoardEngine } from '$lib/board-core';
    import { FabricRenderer } from '$lib/board-render-fabric';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    let canvasElement: HTMLCanvasElement;
    let engine: BoardEngine;
    let renderer: FabricRenderer;

    onMount(() => {
        // Initialize headless engine
        engine = new BoardEngine(data.snapshot);

        // Initialize Fabric renderer (client-only)
        renderer = new FabricRenderer(canvasElement);
        renderer.syncFromModel(engine.getState());

        // Wire up events
        engine.on('state:changed', () => {
            renderer.syncFromModel(engine.getState());
        });

        // Auto-save every 5 seconds
        const saveInterval = setInterval(() => {
            saveToServer(engine.getState());
        }, 5000);

        return () => {
            clearInterval(saveInterval);
            renderer.dispose();
        };
    });

    async function saveToServer(state: BoardState) {
        await fetch(`/api/boards/${data.boardId}`, {
            method: 'PATCH',
            body: JSON.stringify({ snapshot: state })
        });
    }
</script>

<div class="board-container">
    <canvas bind:this={canvasElement}></canvas>
</div>

<style>
    .board-container {
        width: 100vw;
        height: 100vh;
        overflow: hidden;
    }
</style>
```

```typescript
// routes/boards/[boardId]/+page.server.ts
import { db } from '$lib/server/db';
import { boards } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
    const board = await db.query.boards.findFirst({
        where: eq(boards.id, params.boardId)
    });

    if (!board) {
        throw error(404, 'Board not found');
    }

    return {
        boardId: board.id,
        snapshot: board.snapshot // Safe JSONB serialization
    };
};
```

---

### Real-Time Collaboration (Future)

#### Phase 1: Op-Log Based
```typescript
interface BoardOperation {
    id: string;
    boardId: string;
    version: number;
    userId: string;
    timestamp: number;
    command: SerializedCommand;
}

// Client sends ops to server
socket.emit('board:op', operation);

// Server broadcasts to other clients
socket.broadcast.to(boardId).emit('board:op', operation);

// Client applies remote ops
socket.on('board:op', (op) => {
    engine.applyRemoteOp(op);
});
```

#### Phase 2: CRDT (Yjs)
```typescript
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

const ydoc = new Y.Doc();
const ymap = ydoc.getMap('board');

// Sync with server
const provider = new WebsocketProvider(
    'ws://localhost:1234',
    boardId,
    ydoc
);

// Observe changes
ymap.observe((event) => {
    renderer.syncFromModel(ymap.toJSON());
});
```

---

### Bits-UI v2 Components

```svelte
<!-- Toolbar.svelte -->
<script lang="ts">
    import { ToggleGroup } from 'bits-ui';

    let tool = $state<'pointer' | 'lasso' | 'hand' | 'sticky' | 'connector'>('pointer');
</script>

<ToggleGroup.Root bind:value={tool} type="single">
    <ToggleGroup.Item value="pointer">
        <Icon name="pointer" />
    </ToggleGroup.Item>
    <ToggleGroup.Item value="lasso">
        <Icon name="lasso" />
    </ToggleGroup.Item>
    <ToggleGroup.Item value="hand">
        <Icon name="hand" />
    </ToggleGroup.Item>
    <ToggleGroup.Item value="sticky">
        <Icon name="sticky-note" />
    </ToggleGroup.Item>
    <ToggleGroup.Item value="connector">
        <Icon name="arrow-right" />
    </ToggleGroup.Item>
</ToggleGroup.Root>
```

```svelte
<!-- CommandPalette.svelte -->
<script lang="ts">
    import { Command } from 'bits-ui';
    import { onMount } from 'svelte';

    let open = $state(false);

    onMount(() => {
        window.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                open = true;
            }
        });
    });
</script>

<Command.Dialog bind:open>
    <Command.Input placeholder="Search commands..." />
    <Command.List>
        <Command.Group heading="Add">
            <Command.Item onSelect={() => addStickyNote()}>
                Add Sticky Note
                <Command.Shortcut>N</Command.Shortcut>
            </Command.Item>
            <Command.Item onSelect={() => attachEvidence()}>
                Attach Evidence
                <Command.Shortcut>E</Command.Shortcut>
            </Command.Item>
        </Command.Group>
    </Command.List>
</Command.Dialog>
```

---

### Search Integration

#### Fuse.js (Client-Side)
```typescript
import Fuse from 'fuse.js';

const fuse = new Fuse(boardState.nodes, {
    keys: ['data.text', 'data.title', 'data.evidenceTitle'],
    threshold: 0.3
});

const results = fuse.search('contract amendment');
```

#### PostgreSQL Full-Text (Server-Side)
```typescript
// Search across all boards in a case
const results = await db
    .select()
    .from(boards)
    .where(
        and(
            eq(boards.caseId, caseId),
            sql`snapshot::text @@ to_tsquery('contract & amendment')`
        )
    );
```

---

## Future Enhancements

### Short-Term (Q1 2026)
- [ ] **Visual Evidence Board** - Infinite canvas with Fabric.js + headless core
- [ ] Command palette (Ctrl+K) with Bits-UI v2
- [ ] Minimap + snap guides + lasso select
- [ ] Neo4j integration for knowledge graphs
- [ ] XState workflow orchestration
- [ ] WebGPU shader pipeline optimization
- [ ] ONNX model quantization (300M → 100M)

### Long-Term (Q2+ 2026)
- [ ] Real-time collaboration (Yjs + WebSocket)
- [ ] Multi-GPU support
- [ ] Distributed vector search
- [ ] Mobile app (React Native with WebGPU)
- [ ] Evidence timeline visualization
- [ ] AI-powered board suggestions

---

## Contributing

When adding new features:

1. **Always provide CPU fallback** for WebGPU features
2. **Encrypt sensitive data** before client-side storage
3. **Cache expensive operations** in Redis
4. **Log performance metrics** for monitoring
5. **Write tests** for critical paths

---

## License

Proprietary - Legal AI Platform © 2026

---

**Last Updated:** February 4, 2026
**Version:** 1.0.0
**Authors:** Development Team
