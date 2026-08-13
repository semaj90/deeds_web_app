# ACE Vector Selection Slice

This adds only the missing vectorization layer underneath the already-completed ACE packet consumer pipeline.

## Add

- `src/lib/server/ace/vector/ace-packet-vector.ts`
- `src/lib/server/ace/vector/turbovec-interpolation.ts`
- `src/lib/server/ace/vector/ace-packet-vector.test.ts`
- `src/lib/server/ace/vector/turbovec-interpolation.test.ts`
- `src/lib/server/ace/ranking/packet-feature-matrix.ts`
- `src/lib/server/ace/ranking/packet-feature-matrix.test.ts`

## Do not replace

Keep your existing:

- `ranking/packet-rtx-ranker.ts`
- `context/packet-assembler.ts`
- `tools/tool-call-receipt.ts`
- `consumer/packet-consumer-pipeline.ts`

## First integration

1. Load/derive packet `latent64`.
2. Load the packet SOM `centroid64`.
3. Encode the query to `query64`.
4. Call `interpolateTurboVec(...)`.
5. Derive the scalar row:
   - semanticScore
   - centroidAffinity
   - quaternionAffinity
   - graphAuthority
   - demandUtility
   - executionUtility
   - recency
   - cacheHotness
   - normalizedCost
6. Call `buildPacketFeatureMatrix(...)`.
7. Feed the same feature order into the existing packet RTX ranker.
8. Keep packet identity, canonical lookup, dedup, token budgeting, Postgres writes, and MCP authorization outside the vector/GPU lane.

## Tests

From `sveltekit-frontend`:

```powershell
npm exec vitest run `
  src/lib/server/ace/vector/ace-packet-vector.test.ts `
  src/lib/server/ace/vector/turbovec-interpolation.test.ts `
  src/lib/server/ace/ranking/packet-feature-matrix.test.ts
```

## Acceptance gates

- ACE_VECTOR_SCHEMA_PASS
- LATENT64_DIMENSION_PASS
- TURBOVEC_INTERPOLATION_DETERMINISTIC
- INTERPOLATED_VECTOR_L2_NORMALIZED
- FEATURE_MATRIX_STABLE
- CANONICAL_PACKET_UNCHANGED

After these pass, add CUDA behind the ranker interface and prove CPU/GPU parity before making GPU output authoritative for top-K.
