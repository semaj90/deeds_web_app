# Option B: Repository Scanning Layer Design

**Date**: June 15, 2026 (Session 66 continuation)  
**Status**: 🚀 PLANNING & DESIGN  
**Objective**: Build AST extraction layer that feeds repo-agnostic packets into Parent Atlas library

---

## Overview

Parent Atlas currently assumes deeds-web-app structure. Option B extracts the **repository scanning logic** into a reusable layer that:

1. Scans any directory tree (language-agnostic)
2. Extracts source_ref, file_path, symbols, imports
3. Generates packets (with feature_id, feature_label, etc.)
4. Feeds into Postgres/Qdrant/Redis/Neo4j mirrors
5. Works with or without Parent Atlas (composable, not tightly coupled)

**Goal**: Make Parent Atlas a true **library plugin** that can ingest any codebase.

---

## Current State

### Existing Scanning Infrastructure

**Already exists but hardcoded to deeds-web-app**:
- `scripts/atlas/atlas-parent-indexing.mjs` — main repo scan driver
- `scripts/atlas/build-ast-topology-dry-run.mjs` — AST extraction test
- `scripts/atlas/audit-whole-codebase-index-scope.mjs` — directory walking

**Problem**: These scripts assume:
- Specific directory structure (`src/`, `sveltekit-frontend/`, etc.)
- Specific ignore patterns (`.svelte-kit`, `dist/`, etc.)
- Specific symbol extraction (TypeScript-only patterns)
- Specific feature classification (hardcoded domain rules)

### What We Need to Generalize

1. **Directory walking** — recursive, respects .gitignore, supports filter patterns
2. **File categorization** — detect language, determine parser
3. **Symbol extraction** — AST parsing per language (TS, JS, Python, Go, Rust, etc.)
4. **Feature inference** — infer feature_id/feature_label from context (directory, imports, metadata)
5. **Packet generation** — create atlas_codebase_packets rows with canonical fields
6. **Enrichment** — optional GPU scoring, embedding, clustering

---

## Proposed Architecture

### Layer 1: Directory Scanner (Repo-Agnostic)

**Purpose**: Walk a directory tree, respect ignore patterns, yield file paths.

```typescript
// packages/parent-atlas-ingest/src/scanner/directory-scanner.ts

export interface ScannerConfig {
  rootPath: string;
  excludePatterns?: string[];      // .gitignore patterns
  includePatterns?: string[];      // explicit includes (override exclude)
  maxDepth?: number;               // recursion limit
  followSymlinks?: boolean;
  gitIgnoreMode?: 'strict' | 'loose' | 'off';
}

export interface FileEntry {
  absolutePath: string;
  relativePath: string;            // relative to rootPath
  language: 'ts' | 'js' | 'py' | 'go' | 'rs' | 'unknown';
  size: number;
  mtime: Date;
}

export async function* scanDirectory(config: ScannerConfig): AsyncGenerator<FileEntry> {
  // Walk rootPath, yield each file
  // Respect .gitignore (via ignore package)
  // Infer language from extension
}
```

**Usage**:
```typescript
for await (const file of scanDirectory({ rootPath: '/path/to/repo' })) {
  console.log(file.relativePath);
}
```

---

### Layer 2: Language-Specific Parsers

**Purpose**: Extract symbols, imports, and metadata per language.

```typescript
// packages/parent-atlas-ingest/src/parsers/language-parser.ts

export interface ParsedSymbol {
  name: string;
  kind: 'function' | 'class' | 'variable' | 'type' | 'export' | 'import';
  startLine: number;
  endLine: number;
  isExported: boolean;
  documentation?: string;
  references?: string[];  // imported/used symbols
}

export interface ParsedFile {
  path: string;
  language: string;
  symbols: ParsedSymbol[];
  imports: Array<{ source: string; items: string[] }>;
  exports: string[];
  metadata: Record<string, any>;
}

export async function parseFile(filePath: string): Promise<ParsedFile> {
  const ext = extname(filePath).toLowerCase();
  
  switch (ext) {
    case '.ts':
    case '.tsx':
      return parseTypeScript(filePath);
    case '.js':
    case '.mjs':
      return parseJavaScript(filePath);
    case '.py':
      return parsePython(filePath);
    case '.go':
      return parseGo(filePath);
    default:
      return parseGeneric(filePath);
  }
}

// Language-specific parsers
async function parseTypeScript(filePath: string): Promise<ParsedFile> {
  // Use ts-morph or similar to extract AST
  // Return symbols, imports, exports
}

async function parsePython(filePath: string): Promise<ParsedFile> {
  // Use ast module via Python subprocess or similar
}

async function parseGo(filePath: string): Promise<ParsedFile> {
  // Use go/parser via subprocess
}
```

---

### Layer 3: Feature Inference Engine

**Purpose**: Classify symbols into features, infer feature_id and feature_label.

```typescript
// packages/parent-atlas-ingest/src/feature-inference/classifier.ts

export interface FeatureClassification {
  featureId: string;        // e.g., "auth.sessions", "ui.forms", "db.migrations"
  featureLabel: string;     // "Authentication Sessions", "Form Components"
  domain: string;           // "auth", "ui", "db", "infra", "data", etc.
  confidence: number;       // 0.0 - 1.0
  reason: string;           // why this classification
}

export interface ClassifierConfig {
  domainRules?: Record<string, string[]>;       // dir patterns → domain
  symbolPatterns?: Record<string, RegExp>;      // name patterns → feature
  importPatterns?: Record<string, RegExp>;      // import path → feature
  metadata?: Record<string, any>;               // custom metadata
}

export function inferFeature(
  filePath: string,
  symbol: ParsedSymbol,
  context: {
    directory: string;
    imports: string[];
    exports: string[];
    metadata?: Record<string, any>;
  },
  config?: ClassifierConfig
): FeatureClassification {
  // Apply rules in order: directory → symbol name → imports → fallback
  // Return feature_id, feature_label, confidence, reason
}
```

**Examples**:
```typescript
// Input: filePath="src/lib/server/auth/sessions.ts", symbol="validateSession"
// Output: featureId="auth.sessions", featureLabel="Authentication Sessions", confidence=0.95

// Input: filePath="src/routes/api/cases/+server.ts", symbol="GET"
// Output: featureId="cases.api", featureLabel="Cases API", confidence=0.85
```

---

### Layer 4: Packet Generation

**Purpose**: Create atlas_codebase_packets rows from parsed files + features.

```typescript
// packages/parent-atlas-ingest/src/packet-generator/packet-builder.ts

export interface PacketGenConfig {
  repoRoot: string;
  workspaceRoot?: string;           // e.g., "sveltekit-frontend" for deeds-web-app
  sourceRefMode: 'absolute' | 'repo-relative' | 'workspace-relative';
  classifierConfig?: ClassifierConfig;
  includeSymbols?: boolean;         // create packet per symbol or per file?
  includeDependencies?: boolean;
}

export async function generatePackets(
  scanConfig: ScannerConfig,
  genConfig: PacketGenConfig
): Promise<Array<{
  directoryPath: string;
  sourceRef: string;
  filePath: string;
  functionSymbol: string;
  featureId: string;
  featureLabel: string;
  packetKey: string;
  summary: string;
  metadata: Record<string, any>;
}>> {
  const packets = [];
  
  for await (const file of scanDirectory(scanConfig)) {
    const parsed = await parseFile(file.absolutePath);
    
    for (const symbol of parsed.symbols) {
      const feature = inferFeature(file.relativePath, symbol, {
        directory: dirname(file.relativePath),
        imports: parsed.imports.map(i => i.source),
        exports: parsed.exports,
      }, genConfig.classifierConfig);
      
      const packet = {
        directoryPath: dirname(file.relativePath),
        sourceRef: computeSourceRef(file, genConfig),
        filePath: file.relativePath,
        functionSymbol: symbol.name,
        featureId: feature.featureId,
        featureLabel: feature.featureLabel,
        packetKey: `${feature.featureId}:${symbol.name}:${hashOf(file.relativePath)}`,
        summary: symbol.documentation || `${symbol.kind} ${symbol.name} in ${file.relativePath}`,
        metadata: {
          symbolKind: symbol.kind,
          isExported: symbol.isExported,
          lineRange: [symbol.startLine, symbol.endLine],
          featureConfidence: feature.confidence,
          inferenceReason: feature.reason,
        },
      };
      
      packets.push(packet);
    }
  }
  
  return packets;
}
```

---

### Layer 5: Store Adapters

**Purpose**: Write packets to Postgres, Qdrant, Redis, Neo4j.

Already exists in `packages/parent-atlas/src/adapters/`:
- `postgres.ts` — INSERT packets into atlas_codebase_packets
- `qdrant.ts` — Upsert vectors into codebase_chunks_768
- `valkey.ts` (Redis) — Cache centroids + metadata
- `neo4j.ts` — Create BELONGS_TO_FEATURE edges

The ingest layer passes generated packets to these adapters.

---

## Integration Points

### With Parent Atlas Core

```typescript
// packages/parent-atlas-ingest/src/ingest-pipeline.ts

export async function ingestRepository(config: {
  repoRoot: string;
  workspaceRoot?: string;
  stores: {
    postgres?: boolean;
    qdrant?: boolean;
    redis?: boolean;
    neo4j?: boolean;
  };
  dryRun?: boolean;
  featureClassifier?: ClassifierConfig;
}): Promise<IngestReport> {
  // 1. Scan directory
  const scanConfig = {
    rootPath: config.repoRoot,
    excludePatterns: DEFAULT_IGNORES,
  };
  
  // 2. Generate packets
  const packets = await generatePackets(scanConfig, {
    repoRoot: config.repoRoot,
    workspaceRoot: config.workspaceRoot,
    sourceRefMode: 'repo-relative',
    classifierConfig: config.featureClassifier,
  });
  
  // 3. Write to stores
  if (config.stores.postgres) {
    await postgres.insertPackets(packets, { dryRun: config.dryRun });
  }
  if (config.stores.qdrant) {
    // Generate embeddings, upsert to Qdrant
    await qdrant.upsertPackets(packets, { dryRun: config.dryRun });
  }
  // ... etc
  
  // 4. Return report
  return {
    repoRoot: config.repoRoot,
    filesScanned: packets.length, // or unique file count
    packetsCreated: packets.length,
    errors: [],
    stores: config.stores,
  };
}
```

### With OpenCode

```typescript
// packages/parent-atlas-opencode/src/commands/ingest.ts

export const ingestRepoCommand = {
  name: 'atlas.ingestRepo',
  description: 'Ingest a repository into Parent Atlas',
  parameters: {
    repoPath: { type: 'string', description: 'Path to repo root' },
    stores: { type: 'array', description: 'Which stores to populate: postgres, qdrant, redis, neo4j' },
  },
  execute: async (repoPath: string, stores: string[]) => {
    const report = await ingestRepository({
      repoRoot: repoPath,
      stores: {
        postgres: stores.includes('postgres'),
        qdrant: stores.includes('qdrant'),
        redis: stores.includes('redis'),
        neo4j: stores.includes('neo4j'),
      },
    });
    return report;
  },
};
```

### With SvelteKit Routes

```typescript
// sveltekit-frontend/src/routes/api/atlas/ingest/+server.ts

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
  
  const { repoRoot, stores, dryRun } = await request.json();
  
  const report = await ingestRepository({
    repoRoot,
    stores,
    dryRun,
  });
  
  return json(report);
};
```

---

## Package Structure

```
packages/
  parent-atlas/                         # Core (already exists)
    src/
      adapters/
      gates/
      pipelines/
      env.ts
      index.ts
  
  parent-atlas-ingest/                  # NEW: Scanning + Feature inference
    src/
      scanner/
        directory-scanner.ts            # Walk directories
      parsers/
        language-parser.ts              # Extract symbols per language
        typescript.ts
        javascript.ts
        python.ts
        go.ts
      feature-inference/
        classifier.ts                   # Infer feature_id/label
      packet-generator/
        packet-builder.ts               # Create atlas_codebase_packets rows
      ingest-pipeline.ts                # Orchestrate: scan → parse → infer → generate
      types.ts                          # Shared types
    package.json
    tsconfig.json

  parent-atlas-opencode/                # NEW: OpenCode integration
    src/
      commands/
        ingest.ts
        verify.ts
        health.ts
      skills/
      index.ts
    package.json

  parent-atlas-sveltekit/               # NEW: SvelteKit routes + UI
    src/
      routes/
        api/atlas/ingest/+server.ts
        api/atlas/verify/+server.ts
      components/
        RepoIngestUI.svelte
      index.ts
    package.json
```

---

## Implementation Order

1. **Create `parent-atlas-ingest` package**
2. **Build directory scanner** (repo-agnostic)
3. **Build language parsers** (start with TypeScript, add others as needed)
4. **Build feature classifier** (can start simple, iterate)
5. **Build packet generator** (orchestrate 1-4)
6. **Wire to Parent Atlas adapters** (use existing Postgres/Qdrant/Redis/Neo4j)
7. **Create OpenCode integration** (expose as commands)
8. **Create SvelteKit routes** (UI + API)

---

## Success Criteria

- ✅ Can scan any Git repo (language-agnostic)
- ✅ Can extract symbols from TS/JS/Python (at minimum)
- ✅ Can infer features without hardcoded rules
- ✅ Can generate packets with canonical identity contract
- ✅ Can populate Postgres/Qdrant/Redis/Neo4j without deeds-app assumptions
- ✅ Can be called from OpenCode commands
- ✅ Can be called from SvelteKit API routes
- ✅ Parent Atlas remains library-first (not tightly coupled to ingest)

---

**Owner**: Parent Atlas Ingest Layer Design (Option B)  
**Last Updated**: June 15, 2026 (Session 66)  
**Next**: Build directory scanner (Phase 1 of Option B)
