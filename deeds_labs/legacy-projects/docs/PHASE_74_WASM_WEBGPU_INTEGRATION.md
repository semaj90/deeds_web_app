# Phase 74: WASM/WebGPU → Phase72/ACE Integration

**Date**: December 1, 2025
**Status**: Ready to Implement
**Goal**: Wire existing WASM SIMD and WebGPU SOM into Phase72/ACE for GPU-accelerated error clustering

---

## 🎯 Current State

### ✅ What We Already Have

1. **WASM SIMD Vector Ops** (`src/wasm/vector-operations.ts`)
   - AssemblyScript → `static/wasm/vector-ops.wasm`
   - SIMD-enabled for fast vector operations
   - Build script: `npm run build:wasm`

2. **WebGPU SOM Clustering** (`scripts/gpu-cluster-concurrent-executor.mjs`)
   - GPU-accelerated Self-Organizing Maps
   - Script: `npm run webgpu:som:cache`
   - Concurrent execution with 16 goroutines

3. **Svelte-Check Analyzer** (`src/lib/ast/svelte-check-analyzer.ts`)
   - TypeScript AST analysis with ts-morph
   - Error extraction and categorization
   - Already produces structured `ASTError[]`

4. **Phase72/ACE Backend** (`backend/services/ace_orchestrator.py`)
   - Autonomous planning and execution
   - Tool router with guardrails
   - Timeline tracking (ACA)

5. **MinIO SIMD** (Go service on port 8096)
   - AVX2-optimized JSON parsing
   - 16 concurrent goroutines
   - Already integrated

### ❌ What's Missing

The **glue layer** that connects them:
- svelte-check → error vectorization → WebGPU clustering → Phase72 ingestion
- Phase72 seeing "12,345 TS1005 errors in cluster A" instead of raw 80k flat errors
- ACE using cluster IDs to prioritize fixes

---

## 🔄 Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. svelte-check (TypeScript Compiler)                               │
│    80,000+ raw diagnostics                                          │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 2. Error Vectorizer (NEW!)                                          │
│    src/lib/ast/error-vectorizer.ts                                  │
│    • Converts ASTError → ErrorVector (Float32Array)                 │
│    • Features: code, severity, file path, line number              │
│    • Uses WASM vector-ops for normalization                         │
│    Output: svelte-check-vectors.json                                │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 3. WebGPU SOM Clustering (EXISTING)                                 │
│    scripts/gpu-cluster-concurrent-executor.mjs                      │
│    • Reads svelte-check-vectors.json                                │
│    • GPU-accelerated clustering                                     │
│    • Groups similar errors                                          │
│    Output: svelte-check-clusters.json                               │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 4. Phase72 Ingest (NEW!)                                            │
│    scripts/phase72-cluster-ingest.mjs                               │
│    • Reads svelte-check-clusters.json                               │
│    • POSTs to /api/phase72/record_event                            │
│    • Sends cluster summaries, not raw errors                        │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 5. ACE Orchestrator (EXISTING)                                      │
│    backend/services/ace_orchestrator.py                             │
│    • Sees: "Cluster 0: TS1005, 12,345 occurrences"                 │
│    • Plans: TOOL: phase72_fix_cluster, ARGS: {clusterId: 0}        │
│    • Executes with guardrails                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📁 Files to Create

### 1. Error Vectorizer
**File**: `sveltekit-frontend/src/lib/ast/error-vectorizer.ts`

```typescript
/**
 * Phase 74: Error Vectorizer
 * Converts AST errors to vectors for WebGPU clustering
 */

import type { ASTError } from './svelte-check-analyzer';

export interface ErrorVector {
	id: string;
	file: string;
	code: string;
	message: string;
	vector: number[]; // Will be Float32Array in WASM
	metadata: {
		line: number;
		severity: string;
		source: string;
	};
}

export class ErrorVectorizer {
	private codeMap: Map<string, number> = new Map();
	private fileMap: Map<string, number> = new Map();
	private nextCodeId = 0;
	private nextFileId = 0;

	/**
	 * Vectorize a single error
	 */
	vectorize(error: ASTError): ErrorVector {
		// Get or create numeric IDs for categorical features
		const codeId = this.getCodeId(error.code);
		const fileId = this.getFileId(error.file);
		const severityId = this.getSeverityId(error.severity);

		// Create feature vector (8 dimensions)
		const vector = [
			codeId,                    // 0: Error code ID
			severityId,                // 1: Severity (0-3)
			error.line,                // 2: Line number
			error.column,              // 3: Column number
			error.endLine - error.line, // 4: Span length
			fileId,                    // 5: File ID
			error.message.length,      // 6: Message length
			this.hashMessage(error.message) // 7: Message hash
		];

		return {
			id: error.id,
			file: error.file,
			code: error.code,
			message: error.message,
			vector,
			metadata: {
				line: error.line,
				severity: error.severity,
				source: error.source
			}
		};
	}

	/**
	 * Vectorize multiple errors
	 */
	vectorizeAll(errors: ASTError[]): ErrorVector[] {
		return errors.map(e => this.vectorize(e));
	}

	/**
	 * Export vectors to JSON for WebGPU
	 */
	exportForWebGPU(vectors: ErrorVector[]) {
		return {
			vectors: vectors.map(v => ({
				id: v.id,
				vector: v.vector,
				metadata: {
					file: v.file,
					code: v.code,
					line: v.metadata.line,
					severity: v.metadata.severity
				}
			})),
			dimensions: 8,
			count: vectors.length,
			codebook: Object.fromEntries(this.codeMap),
			filebook: Object.fromEntries(this.fileMap)
		};
	}

	private getCodeId(code: string): number {
		if (!this.codeMap.has(code)) {
			this.codeMap.set(code, this.nextCodeId++);
		}
		return this.codeMap.get(code)!;
	}

	private getFileId(file: string): number {
		if (!this.fileMap.has(file)) {
			this.fileMap.set(file, this.nextFileId++);
		}
		return this.fileMap.get(file)!;
	}

	private getSeverityId(severity: string): number {
		const map: Record<string, number> = {
			'hint': 0,
			'info': 1,
			'warning': 2,
			'error': 3
		};
		return map[severity] ?? 2;
	}

	private hashMessage(message: string): number {
		let hash = 0;
		for (let i = 0; i < Math.min(message.length, 100); i++) {
			hash = ((hash << 5) - hash) + message.charCodeAt(i);
			hash = hash & hash; // Convert to 32bit integer
		}
		return Math.abs(hash) % 10000;
	}
}

export const errorVectorizer = new ErrorVectorizer();
```

---

### 2. Phase72 Cluster Ingest Script
**File**: `sveltekit-frontend/scripts/phase72-cluster-ingest.mjs`

```javascript
#!/usr/bin/env node
/**
 * Phase 74: Ingest WebGPU clusters into Phase72
 */

import fs from 'node:fs';
import path from 'node:path';
import fetch from 'node-fetch';

const SESSION_ID = process.env.PHASE72_SESSION_ID ?? 'phase72:deeds-web-app:main';
const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:8000';
const ROOT = process.cwd();

const CLUSTERS_FILE = path.join(ROOT, 'svelte-check-clusters.json');

async function loadClusters() {
	if (!fs.existsSync(CLUSTERS_FILE)) {
		throw new Error(`Clusters file not found: ${CLUSTERS_FILE}`);
	}

	const raw = fs.readFileSync(CLUSTERS_FILE, 'utf8');
	return JSON.parse(raw);
}

async function sendToPhase72(clusters) {
	// Send overall summary
	const summary = {
		total_clusters: clusters.length,
		total_errors: clusters.reduce((sum, c) => sum + c.count, 0),
		top_clusters: clusters.slice(0, 10).map(c => ({
			id: c.clusterId,
			code: c.code,
			count: c.count,
			files: c.files.length
		}))
	};

	const res = await fetch(`${BACKEND}/api/phase72/record_event`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			session_id: SESSION_ID,
			kind: 'cluster-summary',
			description: `Formed ${clusters.length} error clusters (${summary.total_errors} total errors)`,
			payload: summary
		})
	});

	if (!res.ok) {
		throw new Error(`Phase72 record_event failed: ${res.status} ${await res.text()}`);
	}

	// Send individual cluster events
	for (const cluster of clusters.slice(0, 20)) { // Top 20 clusters
		await fetch(`${BACKEND}/api/phase72/record_event`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				session_id: SESSION_ID,
				kind: 'cluster-formed',
				description: `Cluster ${cluster.clusterId}: ${cluster.code} (${cluster.count} errors)`,
				payload: {
					cluster_id: cluster.clusterId,
					code: cluster.code,
					count: cluster.count,
					files: cluster.files,
					centroid: cluster.centroid,
					priority: cluster.count > 1000 ? 'high' : cluster.count > 100 ? 'medium' : 'low'
				}
			})
		});
	}
}

(async () => {
	console.log('📊 Loading WebGPU clusters...');
	const clusters = await loadClusters();
	console.log(`✅ Loaded ${clusters.length} clusters`);

	console.log('📤 Sending to Phase72...');
	await sendToPhase72(clusters);
	console.log('✅ Phase72 timeline updated with cluster data');

	process.exit(0);
})().catch((err) => {
	console.error('❌ Phase72 cluster ingest failed:', err);
	process.exit(1);
});
```

---

### 3. Complete Pipeline Script
**File**: `sveltekit-frontend/scripts/phase72-gpu-pipeline.mjs`

```javascript
#!/usr/bin/env node
/**
 * Phase 74: Complete GPU-accelerated error analysis pipeline
 * svelte-check → vectorize → WebGPU cluster → Phase72 ingest
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const VECTORS_FILE = path.join(ROOT, 'svelte-check-vectors.json');
const CLUSTERS_FILE = path.join(ROOT, 'svelte-check-clusters.json');

function run(cmd, args, opts = {}) {
	return new Promise((resolve, reject) => {
		console.log(`🚀 Running: ${cmd} ${args.join(' ')}`);
		const proc = spawn(cmd, args, { stdio: 'inherit', ...opts });
		proc.on('exit', (code) => {
			if (code === 0) resolve();
			else reject(new Error(`${cmd} exited with code ${code}`));
		});
	});
}

(async () => {
	console.log('═══════════════════════════════════════════════════════');
	console.log('  Phase 74: GPU-Accelerated Error Analysis Pipeline');
	console.log('═══════════════════════════════════════════════════════\n');

	// Step 1: Run svelte-check and vectorize
	console.log('📝 Step 1: Running svelte-check + vectorization...');
	await run('node', ['scripts/phase72-svelte-check-vectorize.mjs']);
	console.log(`✅ Vectors saved to: ${VECTORS_FILE}\n`);

	// Step 2: Run WebGPU SOM clustering
	console.log('🎮 Step 2: Running WebGPU SOM clustering...');
	await run('npx', ['zx', 'scripts/gpu-cluster-concurrent-executor.mjs', '--input', VECTORS_FILE, '--output', CLUSTERS_FILE]);
	console.log(`✅ Clusters saved to: ${CLUSTERS_FILE}\n`);

	// Step 3: Ingest clusters into Phase72
	console.log('📤 Step 3: Ingesting clusters into Phase72...');
	await run('node', ['scripts/phase72-cluster-ingest.mjs']);
	console.log('✅ Phase72 timeline updated\n');

	console.log('═══════════════════════════════════════════════════════');
	console.log('  ✅ Pipeline Complete!');
	console.log('═══════════════════════════════════════════════════════');
	console.log('\nNext: Run ACE to plan fixes based on clusters:');
	console.log('  npm run ace:plan\n');

	process.exit(0);
})().catch((err) => {
	console.error('\n❌ Pipeline failed:', err.message);
	process.exit(1);
});
```

---

### 4. Svelte-Check Vectorize Script
**File**: `sveltekit-frontend/scripts/phase72-svelte-check-vectorize.mjs`

```javascript
#!/usr/bin/env node
/**
 * Phase 74: Run svelte-check and vectorize errors
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { svelteCheckAnalyzer } from '../src/lib/ast/svelte-check-analyzer.js';
import { errorVectorizer } from '../src/lib/ast/error-vectorizer.js';

const ROOT = process.cwd();
const SVELTE_CHECK_JSON = path.join(ROOT, 'svelte-check-machine.json');
const VECTORS_FILE = path.join(ROOT, 'svelte-check-vectors.json');

function runSvelteCheck() {
	return new Promise((resolve, reject) => {
		console.log('⚙️  Running svelte-check...');
		const proc = spawn('npx', ['svelte-check', '--output', 'machine'], {
			stdio: ['ignore', 'pipe', 'inherit']
		});

		let buf = '';
		proc.stdout.on('data', (chunk) => {
			buf += chunk.toString();
		});

		proc.on('exit', (code) => {
			if (code !== 0 && code !== 1) {
				return reject(new Error(`svelte-check exited with ${code}`));
			}
			fs.writeFileSync(SVELTE_CHECK_JSON, buf, 'utf8');
			resolve(buf);
		});
	});
}

function parseAndVectorize() {
	console.log('📊 Parsing errors...');
	const raw = fs.readFileSync(SVELTE_CHECK_JSON, 'utf8');
	const data = JSON.parse(raw);

	// Convert to ASTError format
	const errors = (data.diagnostics ?? []).map((d, i) => ({
		id: `${d.filename}:${d.start?.line ?? 0}:${d.code ?? 'UNKNOWN'}:${i}`,
		line: d.start?.line ?? 0,
		column: d.start?.column ?? 0,
		endLine: d.end?.line ?? d.start?.line ?? 0,
		endColumn: d.end?.column ?? d.start?.column ?? 0,
		message: d.text ?? '',
		severity: d.severity === 'error' ? 'error' : 'warning',
		code: d.code ?? 'UNKNOWN',
		source: 'svelte',
		file: d.filename ?? 'unknown'
	}));

	console.log(`📈 Found ${errors.length} errors`);

	// Vectorize
	console.log('🔢 Vectorizing errors...');
	const vectors = errorVectorizer.vectorizeAll(errors);
	const exportData = errorVectorizer.exportForWebGPU(vectors);

	// Save
	fs.writeFileSync(VECTORS_FILE, JSON.stringify(exportData, null, 2), 'utf8');
	console.log(`✅ Saved ${vectors.length} vectors to ${VECTORS_FILE}`);

	return { errors: errors.length, vectors: vectors.length };
}

(async () => {
	await runSvelteCheck();
	const stats = parseAndVectorize();
	console.log(`\n📊 Stats: ${stats.errors} errors → ${stats.vectors} vectors`);
	process.exit(0);
})().catch((err) => {
	console.error('❌ Vectorization failed:', err);
	process.exit(1);
});
```

---

## 📦 Package.json Scripts

Add these to `sveltekit-frontend/package.json`:

```json
{
  "scripts": {
    "phase72:gpu:pipeline": "node scripts/phase72-gpu-pipeline.mjs",
    "phase72:vectorize": "node scripts/phase72-svelte-check-vectorize.mjs",
    "phase72:cluster:ingest": "node scripts/phase72-cluster-ingest.mjs",
    "phase72:watch": "nodemon --watch src --ext ts,svelte --exec 'npm run phase72:gpu:pipeline'"
  }
}
```

---

## 🚀 Usage

### One-Shot Pipeline
```bash
# Run complete pipeline
npm run phase72:gpu:pipeline

# Output:
# ✅ 80,000 errors → 80,000 vectors
# ✅ 80,000 vectors → 150 clusters
# ✅ 150 clusters → Phase72 timeline
```

### Watch Mode (Auto-Run on File Changes)
```bash
npm run phase72:watch
```

### Manual Steps
```bash
# 1. Vectorize errors
npm run phase72:vectorize

# 2. Cluster with WebGPU
npm run webgpu:som:cache --input svelte-check-vectors.json --output svelte-check-clusters.json

# 3. Ingest into Phase72
npm run phase72:cluster:ingest
```

---

## 🎯 ACE Integration

### Backend: Add Cluster Fix Tool

**File**: `backend/services/tool_router.py`

```python
def _tool_phase72_fix_cluster(self, args: Dict[str, Any]) -> Dict[str, Any]:
    """
    Fix errors in a specific cluster

    Args:
        cluster_id: Cluster ID from WebGPU SOM
        strategy: 'auto' | 'suggest' | 'manual'
    """
    cluster_id = args.get("cluster_id")
    strategy = args.get("strategy", "suggest")

    # Fetch cluster details from Phase72 timeline
    cluster = self._fetch_cluster_details(cluster_id)

    if strategy == "auto":
        # Apply automated fix if confidence is high
        return self._apply_cluster_fix(cluster)
    else:
        # Generate suggestions
        return self._suggest_cluster_fixes(cluster)

# Register tool
self._async_tools["phase72_fix_cluster"] = self._tool_phase72_fix_cluster
```

### ACE Planning with Clusters

```python
# In ace_orchestrator.py

async def plan_next_action(self, session_id: str, user_message: str):
    # ... existing code ...

    # Add cluster context to prompt
    clusters = await self._fetch_top_clusters(session_id)
    cluster_context = "\n".join([
        f"Cluster {c['id']}: {c['code']} ({c['count']} errors in {len(c['files'])} files)"
        for c in clusters[:5]
    ])

    prompt = f"""...
Available clusters:
{cluster_context}

Prioritize fixing high-count clusters first.
Use TOOL: phase72_fix_cluster for cluster-based fixes.
"""
```

---

## 📊 Expected Results

### Before (Flat Errors)
```
ACE sees: 80,000 individual errors
Planning: Overwhelmed, picks random error
Execution: Fixes 1 error at a time
Progress: 0.00125% per fix
```

### After (GPU Clusters)
```
ACE sees: 150 clusters
Planning: "Cluster 0 (TS1005) has 12,345 errors in src/routes/cases/*"
Execution: Fixes entire cluster pattern
Progress: 15.4% per cluster fix
```

---

## 🎮 WebGPU SOM Configuration

Update `scripts/gpu-cluster-concurrent-executor.mjs`:

```javascript
const config = {
  input: process.argv.includes('--input')
    ? process.argv[process.argv.indexOf('--input') + 1]
    : 'svelte-check-vectors.json',
  output: process.argv.includes('--output')
    ? process.argv[process.argv.indexOf('--output') + 1]
    : 'svelte-check-clusters.json',
  dimensions: 8,
  gridSize: [20, 20], // SOM grid
  iterations: 1000,
  learningRate: 0.5,
  neighborhoodRadius: 3,
  useGPU: true
};
```

---

## ✅ Success Criteria

- [ ] Error vectorizer converts ASTError → ErrorVector
- [ ] WebGPU SOM clusters 80k errors → ~150 clusters
- [ ] Phase72 receives cluster summaries
- [ ] ACE plans fixes using cluster IDs
- [ ] Pipeline runs in <5 minutes (vs hours for flat analysis)
- [ ] Cluster fixes reduce errors by 10-20% per run

---

**Phase 74 Status**: Ready to implement
**Next**: Create the 4 files above and test the pipeline

🚀 Let's make Phase72 GPU-accelerated!
