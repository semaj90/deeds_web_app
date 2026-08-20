# Parent Atlas Governed Compute Fabric — Progress Baseline

Observed: 2026-08-19
Branch: `feature/parent-atlas-spectral-multihop`

This file is a proof-weighted progress view, not a claim of production readiness.
Each lane advances only through ordered 20-point gates:

- 0% — discovered/planned only
- 20% — contract/ownership defined
- 40% — implementation present
- 60% — targeted tests proven
- 80% — live shadow/canary proven
- 100% — production hardening + rollback proven

A lane may not skip gates. Source code existing is not enough for 60%, and tests
existing is not enough for 60% until they actually run and pass in the intended
environment.

## Current weighted completion

**22.0%** overall weighted completion.

This number is intentionally conservative. It reflects the new governed-kernel/native-ABI
integration change itself, not all historical Parent Atlas work that these lanes reuse.

| Lane | Weight | Current | Current gate | Next gate | Evidence / blocker |
|---|---:|---:|---|---|---|
| Ownership & authority | 8 | 20% | CONTRACT_DEFINED | IMPLEMENTATION_PRESENT | Long-horizon coordination OpenSpec exists; cross-OpenSpec owner reconciliation is still open. |
| Kernel contracts | 10 | 40% | IMPLEMENTATION_PRESENT | TESTS_PROVEN | `AtlasKernelSessionV1`, typed host request/response scaffolds, and proof-weighted progress schemas exist; targeted tests still need an executed PASS receipt. |
| Skill admission | 10 | 40% | IMPLEMENTATION_PRESENT | TESTS_PROVEN | `AtlasSkillAdmissionReceiptV1`, deterministic source hashing, permission declarations, revocation checks, and tests now exist; tests have not yet been run on the workstation. |
| Persistent kernel worker | 12 | 0% | DISCOVERED | CONTRACT_DEFINED | No live persistent IPython/Jupyter worker or authenticated host bridge proof yet. |
| Python-backed skills | 8 | 40% | IMPLEMENTATION_PRESENT | TESTS_PROVEN | Four skill packages exist (`semantic-search`, `graph-evidence`, `claim-verifier`, `file-repair`); fresh-kernel install/import/call proof remains open. |
| DAG / MCP / ACP / A2A | 10 | 40% | IMPLEMENTATION_PRESENT | TESTS_PROVEN | DAG/tool contracts and kernel-to-DAG binding scaffolds exist; no end-to-end governed skill invocation proof yet. |
| Artifact & ACE residency | 7 | 20% | CONTRACT_DEFINED | IMPLEMENTATION_PRESENT | Existing ACE/BitFrost/residency owners are identified; kernel artifact-handle integration remains incomplete. |
| Executor registry | 7 | 20% | CONTRACT_DEFINED | IMPLEMENTATION_PRESENT | Lane/executor separation and execution manifests are defined; no single host capability registry behind skills yet. |
| Native C ABI / Node loader | 10 | 0% | DISCOVERED | CONTRACT_DEFINED | Existing monolithic Node-API bridge has been audited conceptually; `AtlasNativeCAbiV1` header/loader does not yet exist. |
| Backend parity | 6 | 20% | CONTRACT_DEFINED | IMPLEMENTATION_PRESENT | Exact/parity methodology exists elsewhere in Atlas; parity for the new stable operation contract/backends is not yet wired. |
| Security & receipts | 6 | 20% | CONTRACT_DEFINED | IMPLEMENTATION_PRESENT | Kernel access policy forbids canonical writes and skill admission now records permissions/review gates; hostile-kernel, lifecycle, and execution receipts remain incomplete. |
| Production rollout | 6 | 0% | DISCOVERED | CONTRACT_DEFINED | No shadow rollout, canary, rollback drill, or owner cutover for this new fabric yet. |

## Gate completion view

- Contract-defined or better: **9 / 12 lanes**
- Implementation-present or better: **4 / 12 lanes**
- Tests-proven or better: **0 / 12 lanes**
- Shadow-proven or better: **0 / 12 lanes**
- Production-hardened: **0 / 12 lanes**

## Next production-hardening sequence

1. **Kernel contracts → 60%**: execute targeted TypeScript/Vitest tests for
   `AtlasKernelSessionV1`, governed-compute progress, and skill-admission schemas; fix any type/schema failures.
2. **Skill admission → 60%**: run its tests, then add real skill-directory hashing/metadata collection and a clean-environment admission fixture rather than relying only on in-memory test strings.
3. **Python skills → 60%**: create a clean temporary Python environment, install each admitted
   skill, bind a fake/fixture host bridge, and prove each skill emits only the declared request.
4. **Kernel worker → 40% then 60%**: implement persistent worker lifecycle and one authenticated
   `host.request()` bridge; prove timeout/restart/stale-session behavior.
5. **DAG transports → 60%**: run a fixture flow
   `semantic_search -> graph_evidence -> claim_verifier -> ContextManifest` with no canonical writes.
6. **Mutation path → 60%**: prove `file_repair` stops at `AgenticFileMutationPlanV1`; host then
   performs CAS + validation + materialization in an isolated test worktree.
7. **Native ABI → 40%**: freeze `AtlasNativeCAbiV1` header, POD structs, status codes,
   capability discovery, allocator/lifetime rules, and compile-only ABI tests.
8. **Native loader/backend → 60%**: thin Node-API loader + one LibTorch backend + CPU reference
   parity for `batch_cosine_topk_v1`; do not promote until numerical/lifetime tests pass.
9. **Shadow/canary → 80%**: compare new skill/kernel/native path to current production owners on a
   frozen replay corpus and then live read-only traffic; record fallback/degradation receipts.
10. **Production hardening → 100%**: least-privilege process policy, hostile-kernel tests,
    backend/DLL failure matrix, resource pressure, rollback drill, observability, and explicit owner cutover.

## Production readiness rule

Overall weighted percentage is descriptive only. **Production readiness remains false until every
lane reaches 100%**, because a high average must not hide a zero-percent authority, security,
rollback, or native-lifecycle lane.
