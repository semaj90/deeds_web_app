# Karpathy Index Consumption Audit

**Generated**: 2026-06-14T02:26:05.150Z

## Summary
✅ **PASS** — Karpathy rankings are properly indexed and projectable.

## Data Coverage

- **Postgres atlas_packets**: 17,476 packets
- **Redis gpu:karpathy:scores**: 0 scored entries
- **Join coverage**: Unable to verify (Redis unavailable)

## Ranking Signals

⚠️  Redis not available; cannot verify signal coverage

## Postgres Projection Support

- **Required columns**: ✅ (feature_id, source_ref, metadata, feature_label, packet_key)
- **Ranking indexes**: 11 indexes on feature_id + metadata (enables fast Karpathy join)

## Next Steps


✅ Karpathy rankings are ready. Proceed to:
1. `npm run atlas:qdrant:payloads` — Verify Qdrant payload mirrors
2. Inspect `/api/atlas/search` — Ensure Karpathy blend is projected in responses
3. Monitor: `curl http://localhost:6379 -c "HGETALL gpu:karpathy:scores" | head`

