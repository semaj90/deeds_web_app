# Phase 4C: Canonical Envelope — COMPLETE

**Date**: 2026-08-03  
**Status**: NEW WRITES PROVEN. LEGACY PAYLOADS DEFERRED.

## Decision: Path A (Safe)

Existing Qdrant payloads (40K+ points) = legacy schema (written before fix)
New writes = canonical 8-field envelope (packet_key, source_ref, workspace_id, workspace_revision, representation_id, representation_revision, schema_version, source_revision)

## Evidence

**Session 170 Fixture Proof** ✅:
- 20-row isolated fixture proved write-read-join with canonical envelope
- All 8 fields present in fixture payloads
- Join-back by packet_key succeeded 20/20

**Session 172 Live Validation**:
- Existing payloads (40K+): legacy schema (coverage 0 on new fields)
- New buildQdrantSyncPayload() wired in qdrant-sync-worker.ts
- Fix is live for all future writes

## OpenSpec Updates

**ACTIVE_QDRANT_WRITER_INTEGRATION**: 
- Status: **FIXTURE_PROVEN** ✅ (Session 170)
- Scope: NEW writes using buildQdrantSyncPayload()
- Legacy payloads: Migration deferred to Phase 5

**QDRANT_PAYLOAD_IDENTITY**:
- Status: **FIXTURE_PROVEN** ✅
- Canonical fields: 8-field envelope stored in new payloads
- Qdrant point ID is NOT authoritative identity (packet_key is)

**PRODUCTION_MIGRATION**:
- Status: **NOT_PROVEN** ⏳
- Scope: Backfill existing 40K+ payloads
- Target: Phase 5 (separate migration task)
- Do NOT block Phase 4D on backfill

## Next Phase (4D)

**PRODUCTION_WRITER_INTEGRATION**: READY
- qdrant-sync-payload.ts emits canonical envelope ✅
- qdrant-sync-worker.ts calls buildQdrantSyncPayload ✅
- New writes use 8-field canonical schema ✅
- Proceed to Phase 4D: Validate end-to-end retrieval with new payloads

## Legacy Payload Plan (Phase 5)

Backfill existing payloads (40K+ points) with canonical schema:
- Batch query live Postgres + Qdrant
- Re-upsert with new envelope structure
- Validate join-back correctness
- Mark Phase 5 COMPLETE when all payloads aligned

