# DOC-14 GEPA split integrity v1

**Date:** 2026-11-23  
**Scope:** Prevent candidate-context source leakage across GEPA splits and detect post-freeze corpus mutation.  
**Training or promotion:** none.

## Changes

`python/atlas_graph_runtime/gepa_frozen_corpus_adapter_v1.py` previously grouped each query using only the source of its highest-graded candidate. A source included as a distractor in another query's candidate context could therefore cross from training into validation or held-out data.

The splitter now groups queries by overlap across **all** `sourceRef` values present in `candidateContext`. It constructs connected components, so transitive overlap also stays in one split. If this leaves too few independent groups to form a held-out split, construction fails closed.

The promotion-check adapter now requires the caller to provide the expected frozen-corpus checksum. It recomputes the checksum from the three split arrays and rejects a changed or mismatched checksum. It also checks unique query IDs, cross-split source isolation, split counts, schema, and noncanonical/no-hidden-state flags before evaluating readiness. A free-form `approved_by` string no longer unlocks promotion: the caller must provide a decision receipt bound to the dataset, program, metric, and before/after scores, and an independent approval-verifier callback must accept it. No production approval verifier is wired here, so this change keeps promotion fail-closed until the existing authorized owner is connected.

## Verification

Focused command:

```powershell
$env:PYTHONPATH='python'
C:\Python313\python.exe -m pytest python/tests/test_gepa_frozen_corpus_adapter_v1.py python/tests/test_doc14_versioned_replay_export_v1.py -q
```

Result: **7 passed**. Coverage includes shared distractor-source grouping, stale/tampered frozen content, source-byte replay validation, held-out readiness behavior, and rejection when an approval verifier denies a receipt. The positive approval case uses a test verifier only; it does not prove a production authorization owner. `openspec validate parent-atlas-versioned-doc-intelligence --strict` passed; scoped `git diff --check` passed.

## Limits

This proves adapter behavior on fixture bundles. A current read-only label count found 36 task-evaluation rows with zero reviewed/labeled rows, 30 official-document decisions with zero reviewed rows, and an empty `doc14-golden-label-review-draft-v1.json`. Therefore no actual `dspy.GEPA` optimization or held-out quality measurement is justified yet. The report also does not prove an independent production promotion authority has been connected. No live corpus, PostgreSQL, graph, cache, or model weights were changed.
