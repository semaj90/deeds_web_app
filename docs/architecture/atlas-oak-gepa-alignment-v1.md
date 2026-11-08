# Parent Atlas — OaK / DSPy / GEPA request-local contract (v1)

## Scope: one authorized repair proposal, not a new model or ontology authority

```
AUTHENTICATED REQUEST (existing SvelteKit owner)
  -> existing ContextManifestV2: exact source refs, candidate IDs and revision
  -> existing OaK/ontology kernel :8095: bounded typed facts/relations
  -> FindFailureContextArgsV1 / FailureContextResultV1 (result checksum checked)
  -> prepare_oak_repair_handoff_v1 (candidate and evidence allowlists)
  -> existing python.parent_atlas_dspy_repair.run_repair_request_v1
  -> existing proposal-only output validator
  -> optional independent execution/validator receipts (separate owner)
  -> build_receipt_only_gepa_metric_v1 (existing GEPA metric)
  -> frozen source-disjoint evaluation, shadow candidate program
  -> operator admission decision (NOT automated)
```

## Contract ownership

| Concern | Owner | This kit |
|---|---|---|
| Authentication / case access / source revisions | Existing SvelteKit/ContextManifest/identity | Receives qualified allowlists; **cannot grant access** |
| Ontology grounding | `python/atlas_oak_kernel.py`, `structured_contracts_v1.py` | Re-validates request IDs, hashes, fact IDs, hop/fanout bounds |
| DSPy signatures and structured repair plan | `python/parent_atlas_dspy_repair.py` | Passes existing DTO; re-validates output |
| Independent execution + judge receipts | Existing deterministic executor/validator and `OakJudgeFeedbackV1` owner | Requires trusted callback; creates **no judge** |
| GEPA metric and optimizer | Existing `build_gepa_repair_metric_v1` / `build_gepa_optimizer_v1` | Receipt adapter only; does **not** optimize |
| Prompt source/ranking | Existing SearchRuntime/ACE/Prefill owners | Does not add a retrieval vote or mutate Top-K |
| Publication, task execution, auto-promotion | Existing owners/operators | Not implemented and not permitted |

## Important limitations

`FailureContextResultV1` does not itself carry a `workspaceRevision` or `contextManifestChecksum`. The wrapper records the trusted request's workspace revision and caller-provided manifest checksum; only the original admission owner can independently prove their binding. Do **not** trust a newly resealed client-generated handoff as upstream authorization.

A SHA-256 checksum detects unintentional changes and invalid resealing relative to a trusted artifact. It is not a signature, a source authorization check, or independent validator proof.

The `build_receipt_only_gepa_metric_v1` factory expects *trusted callback implementations* supplied by the existing validator/receipt owner. It intentionally throws if a receipt is missing or cannot be independently attested. Do not substitute a fake `testPassed: true` object or infer hard-gate pass from model text.

## Recommended production gate order

- **OAK-HANDOFF-01:** read-only end-to-end live authorized `:8095` → ContextManifest readback; source and fact IDs match.
- **DSPY-PROPOSAL-02:** one bounded request enters the existing optional DSPy repair worker, produces checked JSON (no write), and fails closed on unauthorized refs.
- **VALIDATOR-TRUST-03:** actual independent typecheck/Vitest/AST-validator receipts, matched to proposal digest and source workspace revisions; failure and replay tests.
- **GEPA-CORPUS-04:** frozen source-disjoint train/validation/heldout fixtures plus baseline judged scores and no leakage.
- **GEPA-SHADOW-05:** pin actual DSPy/GEPA package versions and run offline bounded optimizer on real receipts; compare to frozen baseline, no promotion.
- **SEARCHRUNTIME-06:** separately connect evidence-bound recommendation bundle to a real authorized caller; unchanged Top-K until explicitly admitted.

No new database schema, extra GPU environments, model finetuning, or `ae:train` required.

## Verified RTX Tensor Analysis & Community DSPy Helper Bridge (2026-11-08)

- **Community-Scoped DSPy Evidence Packets** ([`scripts/atlas/prove-rtx-mlp-kmeans-umap-domain-dspy-v1.py`](file:///c:/Users/james/Videos/deeds-web-app/scripts/atlas/prove-rtx-mlp-kmeans-umap-domain-dspy-v1.py)):
  - Reconciles the 6,527-task cohort via TASK-01 crosswalk ([`docs/reports/openspec-cohort-6527-crosswalk-v1.json`](file:///c:/Users/james/Videos/deeds-web-app/docs/reports/openspec-cohort-6527-crosswalk-v1.json), `0` synthetic `task:ordinal:<n>` IDs).
  - Binds each Louvain community (`1, 6, 9, 10, 21, 32` + top unrouted communities) to `CommunityEvidenceV1` (`python/parent_atlas_dspy_community.py`) and validates output citations via `validate_community_label_output_v1` (adversarially tested in [`scripts/atlas/test_rtx_mlp_kmeans_umap_domain_dspy_v1.py`](file:///c:/Users/james/Videos/deeds-web-app/scripts/atlas/test_rtx_mlp_kmeans_umap_domain_dspy_v1.py)).
  - Enriches `DomainGraphRagDspyProposalV1` envelopes with RTX 3060 Ti PyTorch Contextual MLP domain probabilities (`10` NES LUT domains), spherical Adaptive KMeans cluster margins ($K \in \{16, 32, 47, 64\}$), and 3D graph-regularized UMAP manifold coordinates + 30-bit Morton codes while keeping `canonical_authority=False` and `proposal_status="PROPOSAL_ONLY"`.

