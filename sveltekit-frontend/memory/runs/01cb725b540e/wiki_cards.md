# ACE Multi-Lane Retrieval

[All gaps resolved] ACE asks multiple retrieval lanes in parallel (hash, ngram, graph, ace_cache, Qdrant semantic) and merges them into one context packet for Gemma4. The multi-lane module exists in multi-lane-retrieval.ts but is not yet wired into context-assembler.ts.

## Files
- `src/lib/server/ace/context-assembler.ts`
- `src/lib/server/ace/multi-lane-retrieval.ts`
- `src/lib/server/ace/error-fingerprint.ts`
- `src/lib/server/ace/ngram-retrieval.ts`
- `src/lib/server/ace/graph-expander.ts`

## Symbols
- `multiLaneSearch`
- `assembleACEContext`
- `runAceCacheLane`
- `skipVectorLane`

## Redis Keys
- `ace:topk:*:embeddinggemma:768`
- `ace:error:fp:*`

## Gaps (0 open / 2 total)

### ✅ [HIGH] gap_ace_001: multiLaneSearch not called by context-assembler
**Summary**: [FIXED] context-assembler.ts has no import or call to multiLaneSearch() from multi-lane-retrieval.ts. | Evidence: multiLaneSearch import found in context-assembler.ts
**Why**: The multi-lane retrieval system (hash + ngram + graph + ace_cache lanes) exists but is bypassed. ACE context assembly only uses Qdrant/ACP/Redis/SOM paths. Error fingerprint cache hits, ngram recall, and graph node expansion are never surfaced to Gemma4.
**Patch**: In context-assembler.ts: import { multiLaneSearch } from ./multi-lane-retrieval.js; call multiLaneSearch({ text: query, isError: looksLikeError(query), topK: 10 }) in parallel with the Qdrant lane; merge synthesis.synthesisBlock into the assembled context string.
**Files**: `src/lib/server/ace/context-assembler.ts`, `src/lib/server/ace/multi-lane-retrieval.ts`

### ✅ [HIGH] gap_ace_002: skipVectorLane declared but never enforced in multiLaneSearch
**Summary**: [FIXED] MultiLaneQuery.skipVectorLane is typed but the multiLaneSearch() body always runs all lanes regardless. | Evidence: skipVectorLane is checked in multiLaneSearch body
**Why**: Callers cannot opt out of expensive vector lanes. When context-assembler already has Qdrant results, running the vector lane again wastes latency. The flag exists for cost control but has no effect — a silent contract break.
**Patch**: In multi-lane-retrieval.ts multiLaneSearch(): check query.skipVectorLane before pushing lanes; the ace_cache lane and ngram lane should still run when skipVectorLane=true. Add a comment "// vector lane gated by skipVectorLane" so the invariant is visible.
**Files**: `src/lib/server/ace/multi-lane-retrieval.ts`

_Updated: 2026-05-07T00:31:35.318Z_

---

# ACE Cache Key Contract

[All gaps resolved] context-assembler.ts writes ace:topk:{queryHash}:embeddinggemma:768 after Qdrant rerank. retrieval-lanes.ts reads ace:query:{qHash}:embeddinggemma:768 — a different namespace. multi-lane-retrieval.ts reads ace:topk:* correctly but has no shared constant. No canonical aceTopkKey() helper ties these together: format drift causes silent 100% cache miss.

## Files
- `src/lib/server/ace/context-assembler.ts`
- `src/lib/server/ace/multi-lane-retrieval.ts`

## Symbols
- `aceTopkKey`

## Redis Keys
- `ace:topk:*:embeddinggemma:768`

## Gaps (0 open / 1 total)

### ✅ [HIGH] gap_ace_003: ace:topk writer/reader key namespace is shared but ownership unclear
**Summary**: [FIXED] context-assembler.ts writes ace:topk:{queryHash}:embeddinggemma:768 at line 2184. multi-lane-retrieval.ts reads the same key pattern in runAceCacheLane(). There is no canonical constant or import binding the two — if either changes the key format, the cache silently stops working. | Evidence: aceTopkKey constant found in cache-keys.ts
**Why**: A format drift (e.g. model name change, hash length change) would cause 100% cache miss with no error, only silent latency regression. The key pattern is copy-pasted in two places with no shared constant.
**Patch**: Create src/lib/server/ace/cache-keys.ts with: export const aceTopkKey = (queryHash: string, model = "embeddinggemma", dim = 768) => `ace:topk:${queryHash}:${model}:${dim}`; Import and use this in both context-assembler.ts and multi-lane-retrieval.ts.
**Files**: `src/lib/server/ace/context-assembler.ts`, `src/lib/server/ace/multi-lane-retrieval.ts`

_Updated: 2026-05-07T00:31:35.318Z_

---

# Error Fingerprint Pipeline

[All gaps resolved] TypeScript/runtime errors are normalised into stable sha256 hashes and stored in error_fingerprints (Postgres) and cached in Redis under ace:error:fp:*. The multi-lane hash lane reads these to surface prior fixes. The Postgres table is defined but lacks a backfill pipeline from tsgo diagnostics.

## Files
- `src/lib/server/ace/error-fingerprint.ts`
- `src/lib/server/ace/multi-lane-retrieval.ts`
- `src/lib/server/db/schema-postgres.ts`
- `scripts/tsgo-diagnostics-to-jsonb.mjs`

## Symbols
- `fingerprintError`
- `lookupErrorFingerprint`
- `errorFingerprints`
- `normalizeError`

## Redis Keys
- `ace:error:fp:*`

## Gaps (0 open / 1 total)

### ✅ [MED] gap_ace_004: error_fingerprints table exists but has no dedicated ACE retrieval lane
**Summary**: [FIXED] schema-postgres.ts defines errorFingerprints table and error-fingerprint.ts has fingerprintError(). multiLaneSearch runs the hash lane which calls lookupErrorFingerprint(). But lookupErrorFingerprint reads from Redis first (ace:error:fp:*) with Postgres fallback — the Postgres table may be empty if no batch ingest has run. | Evidence: backfill-error-fingerprints.mjs exists
**Why**: Error context is only surfaced when (a) multiLaneSearch is called (gap_ace_001 blocks this) AND (b) the Redis fingerprint cache is warm. Cold starts miss all error context. The Postgres table could serve as a durable fallback but no backfill pipeline populates it from tsgo diagnostics.
**Patch**: Wire tsgo-diagnostics-to-jsonb.mjs output into an error_fingerprints INSERT batch. Add a backfill script: scripts/wiki/backfill-error-fingerprints.mjs that reads scratch/audits/tsgo-diagnostics.json → upserts into error_fingerprints → warms Redis. Then fix gap_ace_001 so ACE actually reads this data.
**Files**: `src/lib/server/db/schema-postgres.ts`, `src/lib/server/ace/error-fingerprint.ts`, `src/lib/server/ace/multi-lane-retrieval.ts`, `scripts/tsgo-diagnostics-to-jsonb.mjs`

_Updated: 2026-05-07T00:31:35.318Z_