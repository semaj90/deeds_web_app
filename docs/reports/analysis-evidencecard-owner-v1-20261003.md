# ANALYSIS-EVIDENCECARD-OWNER-01

Status: `OWNER_BOUNDARY_PROVEN`; no persistence or projection writes performed.

## Ownership decision

- `atlas.evidence-card.v1` in `scripts/atlas/audit-openspec-evidence-fabric-v1.mjs` is the OpenSpec evidence/analysis unit. It is keyed to the exact task reference and workspace revision, records proof state and evidence IDs, and carries a canonical checksum.
- `TaskCardV1` (`atlas.openspec-task-card.v1`) in `scripts/atlas/lib/openspec-task-card-v1.mjs` is the task-oriented derived projection. It joins a Workboard task to the evidence census by exact source reference, task block hash, and workspace revision, then derives lifecycle/retrieval state without canonical authority.
- `CandidateEvidenceCardV1/V2` in `sveltekit-frontend/src/lib/server/atlas/contracts/` describe ranked code-retrieval candidates and grounded extraction/rank signals. Their packet/candidate identity and extraction sections are not an alternate OpenSpec task evidence owner and they are not inputs to the OpenSpec TaskCard builder.

## Deterministic binding and checksum

The builder rejects missing task/evidence joins, source-coordinate mismatches, task block revision mismatches, logical identity mismatches, and workspace revision mismatches. The evidence card checksum is validated by the evidence-fabric producer. The corpus records the workspace revision and source-population checksum; the canonical TaskCard selector binds the exact selected card list to task/workspace revisions and a candidate checksum. Thus the checksum boundary is evidence-card input plus corpus/selection population, not a per-TaskCard checksum field.

## Limits

This closes type/owner reconciliation and the existing derivation path only. It does not prove database persistence, semantic indexing, EvidenceCard-to-all-receipt lineage, independent report-file checksum readback, ranking quality, or production retrieval. No sixth tuple store, new card type, embedding, or write path is introduced.

`canonicalAuthority=false`; `writesPerformed=false`.
