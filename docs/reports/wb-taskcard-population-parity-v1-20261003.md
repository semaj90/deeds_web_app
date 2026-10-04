# WB-TASKCARD-POPULATION-PARITY-01 — Same-revision join

**Result: PASS.** The old 337 board-only / 1,742 card-only counts do not describe Workboard-vs-TaskCard unmatched rows. They came from comparing Workboard tasks with the distinct EvidenceCard population. Re-running against the surviving `TaskCardV1` projection yields exact population parity.

## Frozen source

- Workspace head: `6ff213ca1537927ad59916c2c29b13cde9589dcb`
- Workspace revision: `sha256:d1aa4ace727167000c1b40af2e4009dfb5f068645fb7c7b166a253d7a45c04e8`
- Task-source population revision: `sha256:233d86704de656247ce6cac7d9e7d0f59cedaeaf4a52700e7e403f596ea10876`
- Task ledgers: 94; Workboard source-file hashes and TaskCard source-file hashes match.
- TaskCard corpus: 10,463 rows; 8,337,981 bytes, below the strict 10,000,000-byte gate.
- Output location: ignored scratch `.tmp/atlas/wb-taskcard-owner-20261003/cards-final.json`; shared Workboard and TaskCard reports were not overwritten. This final build includes the owner-gate ledger update.

## Population comparison

Identity used on both sides: `logicalTaskKey ?? taskIdentity.logicalTaskKey ?? stableKey`. The builder's stable source coordinate remains a locator, not task identity. Each shared identity was checked for exact task-block revision (`blockHash === taskRevision`).

| Measure | Result |
|---|---:|
| Workboard tasks | 10,463 |
| TaskCards | 10,463 |
| Shared stable identities | 10,463 |
| Board-only | 0 |
| Card-only | 0 |
| Duplicate Workboard identities | 0 |
| Duplicate TaskCard identities | 0 |
| Shared identities with block-revision mismatch | 0 |
| Source-population checksum mismatch | 0 |

## Explicit admitted cohort

The canonical selector/cohort adapter was exercised with `retrievalStates=[CURRENT]` and `states=[OPEN]`. It returned 1,398 TaskCards with workspace, population, and cohort checksum `sha256:ca261a542c65b8a56e9a4552d9c6757db33eada15e7b97d330d2d1a720f0f511`; `canonicalAuthority=false`, `mutationAuthorized=false`, and `writesPerformed=false`. This defines a retrieval/admission cohort only; it does not imply gate readiness or authorize execution.

## Disposition of earlier unmatched counts

The cited 337 / 1,742 values compared different universes: the Workboard task population and 11,024 EvidenceCards. EvidenceCards represent evidence/analysis units and are not a one-row-per-task projection. Treating those as TaskCard unmatched rows would be a false join. EvidenceCard-to-TaskCard association remains a separate exact-span/task-revision evidence join under `ANALYSIS-EVIDENCECARD-OWNER-01`; it must not change this parity result.

No task checkbox, shared report, database, vector, cache, graph, or archive data was written. `writesPerformed:false`.
