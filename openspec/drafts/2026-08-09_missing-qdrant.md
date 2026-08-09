# missing qdrant (draft, unreviewed)

**Source report**: `docs/reports/packet-reader-writer-audit.json`
**Generated**: 2026-08-09T02:54:32.705Z
**Status**: DRAFT — not promoted to openspec/changes/. Requires human review via phase109a_promote_recommendation.

## Proposed Action

Investigate and resolve the 55,208 rows missing Qdrant point IDs to ensure full addressability of atlas_packets.

## Why (Inference Explanation)

The report shows 55,208 rows with missing Qdrant point IDs, which is a significant portion of the 61,659 total rows. This indicates a potential issue in the Qdrant indexing pipeline that needs to be addressed to improve data completeness.

## Validation Criteria

Verify that after the fix, the count of missingQdrantPointId drops to 0 and all 61,659 rows have valid Qdrant point IDs.

## Expected Impact

Full addressability of all atlas_packets rows, enabling complete search and retrieval capabilities through Qdrant.

## Rollback Plan

If validation fails, revert the Qdrant indexing changes and restore the original state with 55,208 missing point IDs.

## Rollback Verification

Confirm that the missingQdrantPointId count returns to 55,208 after rollback.

## Confidence

0.7
