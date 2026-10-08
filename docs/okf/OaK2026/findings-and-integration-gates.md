# OaK 2026: Findings and Integration Gates

Updated: 2026-10-07  
Status: architecture findings; implementation and runtime admission remain open.

## Executive finding

Parent Atlas already has pieces of an OaK-style system: a read-only typed ontology kernel, a bounded DSPy repair-program scaffold, a non-authoritative judge-feedback contract, and an OpenSpec ledger for the missing runtime and evaluation gates. These pieces are **not yet one connected OaK → evidence → repair → judge → GEPA loop**.

DSPy is optional. OaK describes an architecture (task-oriented ontology/schema, typed reasoning functions, and judge-driven refinement), not a requirement to use DSPy. GEPA can optimize a custom system through its standalone APIs; DSPy is a convenient integration when the program is already expressed as DSPy modules. The safest Atlas direction is to keep the existing TypeScript/Python owners and use either a small custom GEPA adapter or the existing DSPy scaffold—do not add a second ontology, evidence, or action registry.

All model/extractor/judge outputs remain proposals. Canonical identity, source/workspace revisions, retrieval eligibility, permissions, validator truth, and durable promotion remain with their existing Atlas owners.

## What exists

| Area | Source evidence | What it establishes | What it does not establish |
|---|---|---|---|
| OaK kernel | `python/atlas_oak_kernel.py` | FastAPI kernel descriptor; frozen operations `lookup`, `search`, `ancestors`, and `descendants`; explicit read-only adapter policy; mutations and LLM ontology writes disabled; `canonicalAuthority=false`. The Postgres adapter is intended for bounded read-only access. | A task-specific dynamic ontology builder, repair-function composition, a live request-local repair workflow, or an admitted ontology writer. |
| DSPy repair scaffold | `python/parent_atlas_dspy_repair.py` | Import-safe module; example admission and metric helpers; `DiagnoseRepair` and `ProposeRepair` signatures; lazy DSPy requirement and a DSPy GEPA constructor. | DSPy/GEPA installed in a pinned environment, model calls, OaK catalog handoff, serialized TypeScript/Python boundary, or end-to-end repair execution. |
| Judge feedback | `packages/parent-atlas/src/core/oak-judge-feedback-v1.ts` | A typed, non-authoritative feedback contract/builder. | A live judge producer from independent execution/validator receipts, calibrated evaluation, or automatic promotion. |
| Repair evidence admission | `python/parent_atlas_dspy_repair.py` and the owning OpenSpec tasks | A fail-closed metadata-only example admission helper has focused fixture evidence. It rejects absent or mismatched lineage, ungrounded spans, unqualified retrieval, unknown validators, and mutation-enabled examples. | Acquisition of sourceRefs, independent qualification of candidates, or a live ContextManifest-to-repair path. |
| Task ledger | `openspec/changes/parent-atlas-compute-rank-cache-eval-dspy-gepa/tasks.md` | Explicit open gates for sidecar wiring, runtime versions, lineage inputs, held-out split, shadow optimization, OaK judge, and promotion. | Completion of those gates; checked boxes and constructor presence alone do not prove runtime behavior. |

## What is missing for an OaK-style loop

1. **Task-bounded ontology view:** Define the task schema/profile as a read-only projection of existing ontology and admitted task evidence. Bind it to schema, source/workspace, and ontology revisions. Do not let generated ontology content create canonical facts.
2. **Typed OaK function handoff:** Reconcile repair operations with the existing kernel/operator catalog. The current kernel exposes four ontology lookup/traversal functions; that is not proof of a typed repair tool set. The DSPy predictors currently do not demonstrably invoke this catalog.
3. **Manifest-bound request boundary:** Serialize a bounded request containing the exact ContextManifest checksum, allowed evidence IDs/sourceRefs, revisions, function allowlist, policy revision, and budgets. The Python worker must have no direct store access and must not resolve identity by itself.
4. **Independent execution and validation receipts:** A judge input must derive from actual bounded execution and independent validator receipts. A model-generated self-score is not validator truth.
5. **GEPA adapter and corpus:** Pin and import GEPA in an isolated environment; implement a custom evaluator/adapter over frozen, sourceRef-backed examples; freeze train/validation/held-out IDs and prevent held-out leakage. DSPy may be used, but is not a prerequisite.
6. **Shadow candidate and admission:** Produce an immutable candidate program/policy revision with checksums and evaluation metrics. Run held-out evaluation independently; require explicit human admission. No production request may mutate the active prompt, function order, policy LUT, or task state.
7. **Runtime proof:** Prove the selected model endpoint, bounded generation, response parsing, timeouts, and failure behavior. A healthy endpoint or a generated source file alone is not an integration proof.

## Recommended ownership and data flow

```text
Atlas evidence/retrieval owners
  → canonical identity + exact revisions + sourceRefs
  → ContextManifest (sealed/checksummed)
  → existing OaK kernel: allowlisted read-only typed operations
  → bounded proposal program (DSPy optional; custom Python is valid)
  → Ornith :8090 only after a bounded compatibility check
  → typed proposal response; no writes
  → existing deterministic authorization and validation owners
  → execution + independent validator receipts
  → non-authoritative OaK judge feedback
  → frozen offline GEPA evaluation
  → candidate program revision + checksum
  → held-out evaluation + explicit human admission
```

Keep the boundaries distinct:

- **OaK** supplies task-oriented typed reasoning over existing, qualified evidence; it does not become a second packet or ontology authority.
- **DSPy** is optional program structure and predictor composition. It does not own retrieval, identity, permissions, or validator truth.
- **GEPA** is offline optimization of bounded program behavior (for example prompt text or function-selection/order policy). It does not rewrite the admitted production policy in response to an individual request.
- **Ornith** is a generation backend, not an embedding, evidence, or judge authority. Confirm model ID and API behavior before runtime claims.
- **PostgreSQL/Atlas owners** remain canonical for identity, revisions, eligibility, and durable state. Worker outputs are proposals until existing gates admit them.

## Suggested proof order

| Gate | Acceptance evidence | Initial status |
|---|---|---|
| `OAK-REPAIR-FUNCTION-MAP-01` | Map each required repair operation to an existing typed function or explicitly identify a minimal extension to the existing catalog. | Open; current ontology kernel has lookup/search/ancestor/descendant operations, while repair-function coverage is partial. |
| `DSPY-MANIFEST-01` / `DSPY-SIDECAR-01` | One serialized, checksummed ContextManifest request reaches an isolated worker; worker can invoke only the allowlisted typed functions and cannot access stores. | Open. |
| `OAK-REPAIR-RUNTIME-01` | One bounded read-only request-local composition returns a schema-valid proposal and receipt preserving source/packet/workspace revisions. | Open. |
| `OAK-JUDGE-01` | Independent validator receipts produce a deterministic, non-authoritative feedback record; no model self-certification. | Open. |
| `GEPA-VERSION-01` | Pinned GEPA imports in an isolated Python environment; if DSPy is selected, pin and prove it separately. | Open; the current ledger says runtime imports are not proven. |
| `GEPA-CORPUS-01` / `GEPA-HELDOUT-01` | Frozen lineage-qualified examples and disjoint train/validation/held-out IDs with leakage checks. | Open. |
| `GEPA-SHADOW-01` | Fixed-seed bounded run emits a checksummed candidate; independent held-out evaluation shows results without promotion. | Open. |
| `PROMOTION-01` | Human review and immutable promotion receipt after held-out non-regression. | Open. |

Do not combine these gates into one “DSPy installed” checkbox. Runtime, source lineage, policy safety, evaluation quality, and admission are separate claims.

## Safe optimization boundary

Potential GEPA targets after the corpus and receipt gates pass:

- proposal instructions and output formatting;
- selection/order among already-allowlisted typed OaK functions;
- bounded evidence-request and stopping policies;
- recovery instructions for known, receipt-backed failure classes.

Never optimize or infer from GEPA:

- canonical identity or source/workspace revisions;
- sourceRefs, byte spans, or evidence existence;
- embedding recipe or semantic representation identity;
- permissions, mutation authority, validator truth, or task state;
- live production policy through online self-updates.

## References

- OaK paper: [Ontology-as-a-Kernel](https://arxiv.org/abs/2608.22974).
- GEPA custom-system integration: [GEPA guides](https://github.com/gepa-ai/gepa/blob/main/docs/docs/guides/index.md).
- GEPA API overview: [GEPA API](https://github.com/gepa-ai/gepa/blob/main/docs/docs/api/index.md).
- Existing OaK kernel: `python/atlas_oak_kernel.py`.
- Existing repair/DSPy scaffold: `python/parent_atlas_dspy_repair.py`.
- Existing judge-feedback contract: `packages/parent-atlas/src/core/oak-judge-feedback-v1.ts`.
- Owning implementation gates: `openspec/changes/parent-atlas-compute-rank-cache-eval-dspy-gepa/tasks.md`.

## Decision

Proceed with a **custom OaK + standalone GEPA** path as the primary design, retaining DSPy as an optional adapter if its module structure reduces implementation effort. First prove the manifest-bound OaK function handoff and receipt-derived judge feedback; only then run offline GEPA on a frozen corpus. Until those proofs pass, status remains `IMPLEMENTED_PARTIAL / RUNTIME_AND_EVALUATION_NOT_PROVEN`, with no promotion or durable write implied.
