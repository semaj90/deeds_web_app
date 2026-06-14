# Feature/Metadata Alignment Verification

**Generated**: 2026-06-14T02:50:52.464Z

## PostgreSQL Coverage

| Table | Total | feature_id | source_ref | metadata |
|-------|-------|-----------|-----------|----------|
| atlas_packets | 17,476 | ⚠️  50.5% | ⚠️  50.5% | ✅ 100.0% |
| nes_chrom_packets | 14,911 | ✅ 100.0% | ✅ 100.0% | ✅ 100.0% |
| glyph_records | 14,515 | ⚠️  0.0% | ⚠️  0.0% | ✅ 100.0% |
| codebase_chunk_index | 40,754 | ⚠️  0.0% | ⚠️  0.0% | ✅ 100.0% |

## Redis Status

- **Karpathy scores**: UNAVAILABLE

## Gate Result

⚠️ **PARTIAL** — Postgres feature lineage is missing critical fields.

## Next Steps


1. Run backfill: `npm run atlas:feature-metadata:backfill -- --apply`
2. Re-verify: `npm run atlas:feature-metadata:verify`
3. Proceed to Qdrant sync

