# missing qdrant (draft, unreviewed)

**Source report**: `docs/reports/packet-reader-writer-audit.json`
**Generated**: 2026-08-06T16:54:05.365Z
**Status**: DRAFT — not promoted to openspec/changes/. Requires human review via phase109a_promote_recommendation.

## Proposed Action

Investigate and resolve the 55,208 rows missing Qdrant point IDs and 55,294 rows missing Qdrant collection references, as these represent the majority of addressable packets that cannot be stored or retrieved from Qdrant.

## Why (Inference Explanation)

The audit report shows that while 61,658 rows are addressable, 55,208 are missing Qdrant point IDs and 55,294 are missing Qdrant collection references, indicating a systematic failure in the Qdrant integration pipeline. Only 6,451 rows have been successfully backed to Qdrant (6,365 in collection), suggesting the materialization process is not properly assigning or resolving Qdrant identifiers for most packets.

## Validation Criteria

Verify that after the fix, the count of rows with missing Qdrant point IDs drops to zero and rows with missing Qdrant collection references drops to zero. Check that the qdrantCollectionRows count increases significantly beyond the current 6,365, ideally approaching the 61,659 materialized rows. Run a spot check on 100 randomly selected packets to confirm they have valid point IDs and collection references in Qdrant.

## Expected Impact

Resolving the missing Qdrant point IDs and collection references will enable the vast majority of addressable packets (currently ~90%) to be properly stored and retrieved from Qdrant, dramatically improving search and retrieval capabilities for the packet reader/writer system.

## Rollback Plan

If validation fails, revert the Qdrant integration changes by restoring the previous version of the materialization script. Re-run the audit to confirm that the missing Qdrant point ID and collection reference counts return to their pre-change levels (55,208 and 55,294 respectively).

## Rollback Verification

After rollback, run the audit report again and confirm that missingQdrantPointId returns to 55,208 and missingQdrantCollection returns to 55,294. Verify that qdrantCollectionRows returns to 6,365. Check that the output SHA256 matches the pre-change value to ensure no data corruption occurred during rollback.

## Confidence

0.8
