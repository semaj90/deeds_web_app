# TurboVec & cuVS Readiness Audit

Generated: 2026-06-20T15:44:48.831Z

## Readiness Score: 80/100 ✅

## Checks

### 1. TurboVec Sidecar (:50062)
❌ Not available

- Error: fetch failed

### 2. Qdrant (:6333)
✅ Available
- Status: 200


### 3. tensorrt_bridge.node Addon
✅ Exists
✅ Loadable
- Size: 359.5 KB


### 4. cuVS Library
✅ Available
- Note: cuVS-compatible compression is exposed by the loaded native addon

### 5. Qdrant Collection (codebase_chunks_768)
✅ Available
- Points: 52606


### 6. Payload Structure
✅ Available
- source_ref: ✅
- feature_id: ✅
- tags: ✅
- community_id: ✅

## Blockers

None ✅

## Warnings

- TurboVec sidecar not available at :50062; N-API fallback remains available

## Status

- Gates Pass: ✅ YES
- Ready for TurboVec deployment: ✅ YES
