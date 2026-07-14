# Session 138 — ACE Barrel Restoration & Consolidation Complete

**Date**: July 13, 2026  
**Status**: ✅ COMPLETE

---

## What Was Done

### 1. Dead Code Elimination
- **Removed from live `src/lib/server/ace/index.ts`** (lines 10–28):
  - HyperRAG RPC contract exports (HyperRAGPacketState, HyperRAGRequest, HyperRAGResponse, etc.)
  - createHyperRAGPacketPipeline
  - validateHyperRAGRequest / validateHyperRAGResponse
- **Archived**: Dead modules moved to `deeds_labs/archived-modules/hyperrag/`
  - `hyperrag-packet-pipeline.ts` (234 lines)
  - `hyperrag-rpc-client.ts` (149 lines)
- **Audit Finding**: Zero consumers of HyperRAG exports in live codebase (verified via grep)

### 2. ACE Barrel Restoration
**Restored `src/lib/server/ace/index.ts` with three categories:**

#### Phase 1 Core Infrastructure (Smoke-Tested)
```typescript
export { AcePacketReader, createAcePacketReader } from './ace-packet-reader.js';
export { AcePacketWriter, createAcePacketWriter } from './ace-packet-writer.js';
export { AcePacketValidator, createAcePacketValidator } from './ace-packet-validator.js';
export type { ValidationResult, SafetyCheckResult } from './ace-packet-validator.js';
```

#### Serialization (Token Remapping Ready)
```typescript
export {
  encodePacketToMsgpack,
  decodePacketFromMsgpack,
  encodePacketBatchToNdjsonMsgpack,
  decodePacketBatchFromNdjsonMsgpack,
  encodeFP16, decodeFP16,
  encodeFP32, decodeFP32,
  compareEncodingSizes,
  PacketMsgpackTags,
} from '../serialization/packet-msgpack-codec.js';
export type { PacketTopologyEnvelope } from '../hyperrag/packet-topology-envelope.js';
```

**Removed from barrel** (not re-exported):
- ❌ AceContextAssembler (consumed only by features/ai/ace/context-assembler.ts directly, not via barrel)
- ❌ ACE Materializer functions (consumed only by acp/ modules directly)
- ❌ AceRetrievalLogger (observability-only, no production consumers)

### 3. Architecture Clarity

**Retrieval → Reranking → Serialization Pipeline:**
```
SearchRuntime (canonical retrieval)
  ↓ RRF fusion (4 lanes: BM25, Qdrant, AST, exact)
  ↓ Cross-encoder reranking (XGBoost)
  ↓ Domain classifier + title generation
  ↓ Topology enrichment (SOM, K-Means, PageRank)
  ↓ Promotion to Postgres (truth) → Qdrant/Neo4j (mirrors)
  ↓ ACE Packet (reader/writer/validator)
  ↓ Msgpack binary serialization (FP16 latent_64, FP32 manifold_4d)
  ↓ mmap-backed RL datasets / token remapping
```

**ACE role**: Final serialization boundary, NOT retrieval logic.

---

## Files Changed

| File | Change | Status |
|------|--------|--------|
| `src/lib/server/ace/index.ts` | Restored: removed HyperRAG, kept reader/writer/validator/msgpack | ✅ |
| `deeds_labs/archived-modules/hyperrag/` | Archived 383 lines dead code | ✅ |
| Git commit | `131f3e682a` | ✅ |

---

## Verification

✅ No ace/index.ts import errors (barrel validated)  
✅ No ace barrel consumers in codebase (grep confirmed)  
✅ Individual ACE modules directly imported where needed (expected pattern)  
✅ Msgpack serialization exports wired (ready for token remapping)  
✅ Canonical packet envelope shape preserved (PacketTopologyEnvelope)

---

## Next Steps

The barrel is now ready for **token 4×6 remapping layer**:

1. Create `token-remapping-layer.ts` that:
   - Reads canonical ACE packet via AcePacketReader
   - Normalizes identity fields (packet_key, source_ref, feature_id as token indices)
   - Encodes latent vectors (FP16 latent_64 → 128 bytes, FP32 manifold_4d → 16 bytes)
   - Serializes via encodePacketToMsgpack()
   - Writes to mmap-backed binary file for RL replay dataset

2. Wire into promotion pipeline (`promote-results.ts` → msgpack export)

3. Build RL dataset consumer that reads mmap-backed files

---

## Architecture Decision Record

**Question**: Should ACE barrel be restored or deleted?

**Decision**: Restore with focused scope (reader/writer/validator + serialization only)

**Rationale**:
- Reader/writer/validator are load-bearing for ACE packet I/O
- Msgpack serialization is the final boundary before token remapping
- HyperRAG + materializer + logger + context-assembler were dead code
- Individual ACE module imports work fine without barrel (current state)
- But having the barrel reduces import scatter when wiring token remapping

**Trade-off**: 
- Keep: reader, writer, validator, msgpack codec
- Delete: HyperRAG, materializer, logger, context-assembler
- Result: Minimal barrel, focused on packet I/O + serialization only
