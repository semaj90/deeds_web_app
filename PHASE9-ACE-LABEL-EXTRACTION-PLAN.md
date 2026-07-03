# Phase 9: ACE Label Extraction (Architecture & Implementation Plan)

**Status**: ⏳ Ready to implement (triggers after Phase 7 completion)

---

## Overview

Phase 9 transforms Phase 7 raw summaries into machine-actionable **ACE routing labels** for:
- Neo4j graph joins (DEFINES, USES, FALLS_BACK_TO relations)
- Qdrant payload filtering (routing hints for Stage A0)
- Redis BitFrost hot cache (feature → packets mapping)
- ACE planner decision routing (feature_id → preferred lane)

**Key principle**: `summary != label`
- Summary: human-readable explanation (Phase 7 output)
- Label: machine-actionable metadata (Phase 9 output)

---

## Input/Output Contract

### Input (from Phase 7)
```json
{
  "id": "uuid",
  "relative_path": "src/lib/server/api/response-helper.ts",
  "content": "function code...",
  "summary": "Defines various helper functions for API responses (200, 201, 404, 500, etc.)",
  "updated_at": "2026-07-02T18:30:00Z"
}
```

### Output (to Postgres ACE labels table)
```json
{
  "source_ref": "src/lib/server/api/response-helper.ts",
  "packet_key": "sha256:...",
  "human_summary": "Defines various helper functions for API responses including status code handlers.",
  "semantic_label": "api_response_helpers",
  "title_id": "helpers.response",
  "feature_id": "api.responses",
  "concepts": ["http", "status-codes", "error", "helper", "response"],
  "nouns": ["responses", "errors", "codes", "handlers", "functions"],
  "verbs": ["handle", "return", "format", "check"],
  "relations": [
    { "from": "response_helper", "type": "DEFINES", "to": "http_status_handler" },
    { "from": "response_helper", "type": "USES", "to": "error_formatter" }
  ],
  "routing_hints": ["api", "http", "server_lane", "helpers"],
  "summary_short": "HTTP response status code handlers (2xx/4xx/5xx)."
}
```

---

## 8-Pass Extraction Pipeline

### Pass 1: AST Structure (Tree-sitter)
**Input**: relative_path + content  
**Output**: code_kind, function_count, exported_symbols, import_edges  
**Tool**: `scripts/atlas/ast-grep-extraction.mjs` (existing)

```javascript
// Extract from AST
- export const x = ... → exported_symbols: ["x"]
- import { y } from "z" → import_edges: [{ from: "z", symbol: "y" }]
- class MyClass { method() {} } → code_kind: "class", exported: false
```

### Pass 2: Lexical Features (Regex + Tokenizer)
**Input**: content + summary  
**Output**: nouns, verbs, adjectives, entities  
**Tool**: `scripts/atlas/lexical-extraction.mjs` (new, simple regex)

```javascript
// Tokenize summary
const summary = "Defines various helper functions for API responses...";
const nouns = ["responses", "helpers", "functions", "APIs"];
const verbs = ["defines"];
```

### Pass 3: Semantic Label (Gemma4 synthesis)
**Input**: relative_path + summary + nouns + verbs  
**Output**: semantic_label, title_id, feature_id, concepts  
**Tool**: `scripts/atlas/semantic-label-generator.mjs` (uses Gemma4)

```bash
# Gemma4 prompt (120 tokens max)
Summarize this code's semantic label in a machine-readable format.

Path: src/lib/server/api/response-helper.ts
Summary: Defines various helper functions for API responses including status code handlers.
Nouns: responses, errors, codes, handlers, functions
Verbs: handle, return, format

Output JSON:
{
  "semantic_label": "api_response_helpers",
  "title_id": "helpers.response",
  "feature_id": "api.responses",
  "concepts": ["http", "status-codes", "error", "helper", "response"]
}
```

### Pass 4: Embedding (EmbeddingGemma)
**Input**: human_summary + semantic_label + concepts  
**Output**: 768-dim vector (pgvector)  
**Tool**: Existing `/api/embed` endpoint

```
Vector stored in: Postgres ace_labels.embedding (768)
Also: Qdrant ace_labels collection for semantic search
```

### Pass 5: Relation Extraction (AST + Gemma4)
**Input**: exported_symbols + imports + summary  
**Output**: relations array  
**Tool**: `scripts/atlas/relation-extractor.mjs`

```javascript
// From AST imports: export helper → uses errorFormatter
relations: [
  { from: "response_helper", type: "USES", to: "error_formatter" },
  { from: "response_helper", type: "DEFINES", to: "http_status_handler" }
]
```

### Pass 6: Routing Hints (Heuristic + Gemma4)
**Input**: feature_id + concepts + relations  
**Output**: routing_hints array (for Stage A0 cache)  
**Tool**: `scripts/atlas/routing-hint-generator.mjs`

```javascript
// Rules
if (feature_id.includes("api")) routing_hints.push("api");
if (feature_id.includes("server")) routing_hints.push("server_lane");
if (concepts.some(c => c.includes("error"))) routing_hints.push("error_lane");
if (relations.length > 2) routing_hints.push("hub_pattern");

Result: ["api", "server_lane", "error_handling", "http"]
```

### Pass 7: Validation Gate
**Input**: ace_label object  
**Output**: validation_status, rejection_reason (if failed)  
**Tool**: `validateAceLabel()` function (existing spec)

```javascript
export function validateAceLabel(x) {
  return Boolean(
    x.source_ref &&
    x.packet_key &&
    x.human_summary &&
    x.semantic_label &&
    x.title_id &&
    x.feature_id &&
    x.concepts?.length >= 5 &&      // Must have 5+ concepts
    x.nouns?.length >= 5 &&         // Must have 5+ nouns
    x.verbs?.length >= 3 &&         // Must have 3+ verbs
    x.relations?.length >= 2 &&     // Must have 2+ relations
    x.routing_hints?.length >= 2    // Must have 2+ routing hints
  );
}
```

**If validation fails**: Log to `ace_labels.validation_errors`, skip to next chunk.

### Pass 8: Persist & Fan-Out
**Input**: validated ace_label  
**Output**: Postgres + Neo4j + Qdrant + Redis  
**Tool**: `scripts/atlas/ace-label-persister.mjs`

```javascript
// 1. Insert to Postgres
INSERT INTO ace_labels (source_ref, packet_key, label_json, embedding, created_at)
VALUES (...)

// 2. Insert to Qdrant
UPSERT ace_labels collection
  vector: embedding
  payload: { source_ref, feature_id, routing_hints, relations }

// 3. Create Neo4j edges
CREATE (n:CodeFeature { feature_id })-[r:DEFINES]->(m:CodeFeature)
CREATE (n)-[r:USES]->(m)

// 4. Warm Redis BitFrost
SADD bitfrost:feature:{feature_id}:labels {label_key}
SADD bitfrost:routing:{hint}:labels {label_key}
SADD bitfrost:concept:{concept}:labels {label_key}
```

---

## Implementation Order

### Stage 1: Schema + Validation (Week 1)
1. Add `ace_labels` table to Postgres
   - source_ref (text, indexed)
   - packet_key (text, indexed, UNIQUE)
   - label_json (jsonb)
   - embedding (vector(768))
   - validation_status (enum: pending, valid, rejected)
   - validation_errors (text[])
   - created_at (timestamp)

2. Add `ace_labels` collection to Qdrant
   - Points: one per label
   - Vector: 768-dim embedding
   - Payload: { source_ref, feature_id, routing_hints, concepts, relations }

3. Implement `validateAceLabel()` function (10 lines)

### Stage 2: Extraction Passes (Week 1-2)
1. `ast-grep-extraction.mjs` (existing, minor refactor)
2. `lexical-extraction.mjs` (100 lines, regex-based)
3. `semantic-label-generator.mjs` (150 lines, Gemma4 call)
4. `relation-extractor.mjs` (200 lines, AST + heuristics)
5. `routing-hint-generator.mjs` (100 lines, rules-based)

### Stage 3: Orchestration (Week 2)
1. `phase9-ace-label-extractor.mjs` (main orchestrator)
   - Reads summaries from Postgres batch-by-batch (100 at a time)
   - Runs 8-pass pipeline on each batch
   - Validates and persists
   - Tracks progress and errors
   - Auto-triggers after Phase 7 completion

2. npm script: `npm run phase9:extract:apply` (full dataset)
3. npm script: `npm run phase9:extract:sample --limit=100` (testing)

### Stage 4: Integration (Week 2-3)
1. Neo4j relationship writer
2. Qdrant payload enricher
3. Redis BitFrost warmer
4. ACE planner integration (reads feature_id → routing_hints)

### Stage 5: Reporting (Week 3)
1. Validation report: % passed/rejected, error categories
2. Coverage report: how many chunks → labels
3. Quality report: average concept/relation/hint counts

---

## Timeline Estimate

- **Phase 7 completion**: ~6-7 hours (concurrent)
- **Phase 9 setup** (schema + validation): 2 hours (before Phase 7 done)
- **Phase 9 extraction passes**: 8 hours (after Phase 7)
- **Phase 9 integration + testing**: 4 hours

**Total to ACE labels ready**: ~20 hours from now

---

## Success Criteria

- [ ] 100% of Phase 7 summaries converted to ACE labels
- [ ] ≥95% pass hard validation gate
- [ ] 5+ concepts per label (avg)
- [ ] 2+ relations per label (avg)
- [ ] Labels queryable in Neo4j + Qdrant
- [ ] BitFrost hot labels warmed in Redis
- [ ] ACE planner can route by feature_id → routing_hints

---

## Database Schema (Ready to Create)

```sql
CREATE TABLE ace_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_ref TEXT NOT NULL,
  packet_key TEXT NOT NULL UNIQUE,
  label_json JSONB NOT NULL,
  embedding vector(768) NOT NULL,
  validation_status TEXT DEFAULT 'pending' CHECK (validation_status IN ('pending', 'valid', 'rejected')),
  validation_errors TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_ace_labels_source_ref ON ace_labels(source_ref);
CREATE INDEX idx_ace_labels_packet_key ON ace_labels(packet_key);
CREATE INDEX idx_ace_labels_status ON ace_labels(validation_status);
CREATE INDEX idx_ace_labels_embedding ON ace_labels USING HNSW (embedding vector_cosine_ops);

-- JSONB path indexes for fast filtering
CREATE INDEX idx_ace_labels_feature_id ON ace_labels USING GIN (label_json);
CREATE INDEX idx_ace_labels_routing_hints ON ace_labels USING GIN ((label_json->'routing_hints'));
```

---

## Next Action

Once Phase 7 hits 50%+ completion:
```bash
npm run phase9:extract:sample --limit=100
# Validates pipeline on small batch before full sweep
```

Then after Phase 7 completes:
```bash
npm run phase9:extract:apply
# Full dataset extraction (8 passes, ~8 hours)
```

---

**Architecture**: Phase 7 (Summary) → Phase 8 (Warm) → Phase 9 (Label) → ACE Router  
**Timing**: Pipelined (concurrent, not sequential)  
**Data flow**: Postgres → Qdrant/Neo4j/Redis → ACE Planner
