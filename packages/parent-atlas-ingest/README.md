# @deeds/parent-atlas-ingest

Repository scanning, AST parsing, and packet generation for Parent Atlas. Produces canonical identity packets that feed into the retrieval pipeline.

## Overview

Ingestion pipeline for Parent Atlas:

```
Repository Scan
  ↓
AST Parser (TypeScript/JavaScript)
  ↓
Feature Extraction
  ↓
Packet Generation (identity contract)
  ↓
Postgres Insert
  ↓
Qdrant Mirror + Neo4j Topology
```

## Installation

```bash
npm install @deeds/parent-atlas-ingest @deeds/parent-atlas-core
```

## Components

### Scanner

Discovers source files in repository and walks AST.

```typescript
import { scanRepository } from '@deeds/parent-atlas-ingest';

const files = await scanRepository('/path/to/repo', {
  exclude: ['node_modules', '.git', 'dist'],
  include: ['**/*.ts', '**/*.tsx', '**/*.js'],
});
```

### AST Parser

Extracts functions, classes, constants, and exports from source files.

```typescript
import { parseFile } from '@deeds/parent-atlas-ingest';

const symbols = await parseFile('src/lib/server/auth.ts');
// Returns: [
//   { name: 'validateSession', type: 'function', ... },
//   { name: 'createSession', type: 'function', ... },
//   { name: 'SessionError', type: 'class', ... },
// ]
```

### Packet Generator

Produces canonical identity packets matching frozen identity contract.

```typescript
import { generatePackets } from '@deeds/parent-atlas-ingest';
import { IDENTITY_CONTRACT } from '@deeds/parent-atlas-core';

const packets = await generatePackets({
  directoryPath: 'src/lib/server',
  sourceRef: 'src/lib/server/auth.ts',
  symbols: [/* parsed symbols */],
});

// Returns packets conforming to IDENTITY_CONTRACT:
// {
//   directory_path: 'src/lib/server',
//   source_ref: 'src/lib/server/auth.ts',
//   file_path: 'src/lib/server/auth.ts',
//   function_symbol: 'validateSession',
//   feature_id: 'auth.sessions',
//   feature_label: 'Authentication Sessions',
//   packet_key: 'ace:packet:auth:001',
//   summary: '...',
// }
```

## API Reference

### Scanner

- **`scanRepository(root, options?)`** — Walk filesystem and discover source files
  - Options: `exclude`, `include`, `maxDepth`
  - Returns: File paths matching glob patterns

### Parser

- **`parseFile(filePath)`** — Extract symbols from source file
  - Input: TypeScript/JavaScript file path
  - Output: Array of symbols with position, type, JSDoc
  - Handles: functions, classes, constants, exports, types

### Packet Generation

- **`generatePackets(options)`** — Create identity packets
  - Input: directory, sourceRef, symbols, existing identities
  - Output: Array of ParentAtlasPacket objects
  - Validates: All 7 fields per IDENTITY_CONTRACT
  - Hard fails: Missing required fields, duplicates

## Identity Contract Enforcement

All generated packets MUST satisfy:

```typescript
import { verifyLineageContract } from '@deeds/parent-atlas-core';

for (const packet of packets) {
  const { passed, errors } = await verifyLineageContract(packet);
  if (!passed) {
    throw new Error(`Identity violation: ${errors.join(', ')}`);
  }
}
```

**Required fields** (hard fail if missing):
- `directory_path` — Repository subdirectory
- `source_ref` — Canonical file path
- `file_path` — Same as source_ref (for now)
- `function_symbol` — Exported name or '(module)'
- `feature_id` — Semantic grouping (auth.sessions)
- `feature_label` — Human-readable feature name
- `packet_key` — Unique key (ace:packet:domain:###)

## Storage

### Postgres (Canonical)

Insert packets into `atlas_packets` table:

```sql
INSERT INTO atlas_packets (
  directory_path, source_ref, file_path, function_symbol,
  feature_id, feature_label, packet_key, summary,
  qdrant_point_id, redis_key
) VALUES (...)
```

### Qdrant (Mirror)

Upsert embeddings into `codebase_chunks_768` collection with payload:

```json
{
  "directory_path": "src/lib/server",
  "source_ref": "src/lib/server/auth.ts",
  "file_path": "src/lib/server/auth.ts",
  "function_symbol": "validateSession",
  "feature_id": "auth.sessions",
  "feature_label": "Authentication Sessions",
  "packet_key": "ace:packet:auth:001"
}
```

### Neo4j (Topology)

Create USED_CONCEPT edges between function nodes:

```cypher
CREATE (f:Function { sourceRef: 'src/lib/server/auth.ts:validateSession' })
CREATE (other:Function { sourceRef: '...' })
CREATE (f)-[:USED_CONCEPT]->(other)
```

## Configuration

### Environment Variables

```bash
# Repository scanning
REPO_ROOT=/path/to/deeds-web-app
EXCLUDE_PATTERNS=node_modules,.git,dist,build

# Storage
POSTGRES_URL=postgresql://...
QDRANT_URL=http://127.0.0.1:6333
NEO4J_URI=neo4j://127.0.0.1:7687
```

## Usage Examples

### Full Ingestion Pipeline

```typescript
import { scanRepository, parseFile, generatePackets } from '@deeds/parent-atlas-ingest';
import { verifyLineageContract } from '@deeds/parent-atlas-core';

async function ingestRepository(repoRoot: string) {
  // 1. Scan
  const files = await scanRepository(repoRoot);
  
  // 2. Parse
  const allSymbols = new Map();
  for (const file of files) {
    const symbols = await parseFile(file);
    allSymbols.set(file, symbols);
  }
  
  // 3. Generate packets
  const packets = [];
  for (const [file, symbols] of allSymbols) {
    const filePackets = await generatePackets({
      directoryPath: dirname(file),
      sourceRef: file,
      symbols,
    });
    packets.push(...filePackets);
  }
  
  // 4. Verify
  for (const packet of packets) {
    const { passed, errors } = await verifyLineageContract(packet);
    if (!passed) console.error(`${packet.packet_key}: ${errors}`);
  }
  
  // 5. Store
  await insertPostgres(packets);
  await upsertQdrant(packets);
  await createNeo4j(packets);
  
  console.log(`Ingested ${packets.length} packets`);
}
```

## Testing

```bash
npm test
# Tests scanner, parser, packet generation, identity contract validation
```

## See Also

- [@deeds/parent-atlas-core](../parent-atlas-core/README.md) — Identity contract
- [@deeds/parent-atlas-retrieval](../parent-atlas-retrieval/README.md) — Retrieval pipeline
- [docs/PARENT-ATLAS-PACKAGE-INTEGRATION.md](../../docs/PARENT-ATLAS-PACKAGE-INTEGRATION.md) — Integration guide

## License

MIT
