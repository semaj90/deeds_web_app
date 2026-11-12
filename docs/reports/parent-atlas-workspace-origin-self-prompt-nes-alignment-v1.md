# Parent Atlas Workspace Origin, Self-Prompting, and NES-Style Context Alignment

**Review date:** 2026-11-10
**Disposition:** source and task-owner review; no service, database, cache, crawler, or Kanban writes
**Authority:** advisory architecture report; no new OpenSpec or Kanban identity is created here

## Executive finding

The design combines useful existing components, but the end-to-end bridge is not proven. Parent Atlas already has external-document capture, workspace grants, semantic packet identity, an action FSM, a checksummed PromptPlan executor, ACE/ContextManifest owners, and an NES-style numeric lookup-table proof. Those components do not yet demonstrate one fetched external document traveling through workspace authorization, source-qualified admission, bounded tool selection, compact context assembly, and a grounded response.

The main missing implementation is a **workspace-scoped external-source admission bridge**. Do not solve this by making a crawler, embedding, LLM, cache, cluster, or compressed packet an authority.

## Identity contract

Keep these facts distinct:

| Fact | Owner / evidence | What it proves |
|---|---|---|
| Workspace and actor access | `actor-workspace-grant-v1.ts` | Whether the actor may use a workspace/source scope under a revisioned grant |
| External observation | `external-doc-capture-runtime.ts` | Which URL/provider/time/content bytes and parser output were observed |
| Content identity | Raw and normalized SHA-256 in the capture receipt | Which bytes/text were observed; does not authorize their use |
| Canonical packet identity | `semantic-packet.ts` and packet-key resolver | Stable packet/source/revision binding after the applicable admission path |
| Execution boundary | `atlas.action.v1` FSM and tool registry | Which action is permitted in the current state |
| Context authority | ACE admission → ContextManifest/PromptPlan | Which qualified evidence may enter model context |

An external source observation should be admitted only after a join proves the workspace grant, source identity, observation revision/content digest, terms/policy result, and actor scope. `canonical_authority:false` on a fetch receipt is appropriate and must remain so. The sample `workspaceId` field in the proposal is not evidence that capture currently carries a verified grant.

### Current source findings

- `external-doc-capture-runtime.ts` has source ID/revision, requested and resolved URL, fetcher, fetch time, parser revision, raw/normalized digests, and non-authoritative status. It archives content-addressed artifacts and creates a fetch receipt; that path has side effects and was not invoked in this review.
- `semantic-packet.ts` carries packet/source/feature/workspace-revision/content-digest/evidence-state fields, but it is not itself the external fetch authorization join.
- `actor-workspace-grant-v1.ts` owns fail-closed actor/workspace access and grant revision checks. A grant check alone does not establish the identity or content revision of a fetched page.
- The existing integration-hardening task 8.1 already owns the Firecrawl/BeautifulSoup handoff audit. Task 8.2 separately covers SSRF/egress controls; task 8.6 covers distinct source/provider/model terms. These remain the correct owners; do not add another crawler or source registry.

## Source acquisition policy

Use a provider-specific observation contract, not a generic “scrape then trust” rule:

1. **GitHub:** use authenticated API/webhook paths where available. Bind repository, path, commit/blob revision, delivery/request identity, and content digest. Use conditional requests to avoid needless polling. Verify webhook signatures before accepting deliveries.
2. **Official API documentation:** fetch only within allowlisted schemes/hosts, redirect revalidation, bounded response/time limits, and source terms. BeautifulSoup is a parser, not authorization, identity, or a license decision.
3. **Reddit:** do not plan around RSS as a durable provider. Reddit says RSS support ends November 13, 2026; this does not deprecate RSS/Atom for other publishers. Use only a supported, authorized Reddit access path and retain its policy/terms result.
4. **All providers:** retain requested/resolved URL, provider, observation time, upstream revision when available, raw digest, normalized digest, parser version, terms/policy result, and workspace/grant reference. If upstream has no immutable revision, make the content digest the observed-content revision and mark upstream revision unavailable.

## Self-prompting: safe state machine, not recursive authority

The repo has `atlas.action.v1` with explicit states and an action DAG contract. It also has `classify_intent`, `build_agentic_rag_context`, tool contract inspection/preflight, and a PromptPlan executor that runs an already compiled and checksum-validated plan. Those are building blocks, not proof of an autonomous retrieval/tool loop.

Use this bounded sequence:

```text
CLASSIFY
  → DECOMPOSE (bounded subquestions, max depth and count)
  → DISCOVER (registered tools only)
  → PREFLIGHT (schema, policy, actor/workspace grant, side-effect class)
  → RETRIEVE / OBSERVE
  → QUALIFY (identity, revision, digest, terms, evidence spans)
  → ASSEMBLE (ACE ContextManifest, token/byte budget)
  → CANONICALIZE (existing reranker/fusion owner)
  → RESPOND or STOP/ASK
```

The compact control equation is:

\[
s_{t+1}=\delta\left(s_t,\;\arg\max_{a\in A(s_t)}\operatorname{MLP}(x_t)_a,\;e_t\right)
\]

Here the FSM computes the permitted action set `A(s_t)` from authorization, tool contract, task state, and evidence admission. The MLP only orders that set. For a first evaluation, use explicit policy configuration such as maximum decomposition depth 2, at most 4 subquestions per level, and at most 8 tool calls per request; these are proposed test caps, not current repo defaults. The context constraint is `B_identity + B_policy + B_evidence + B_tool_contracts + B_state <= B_max`; use the existing request-scoped ContextManifest/PromptPlan budget owner rather than a new global budget store.

The model may propose subquestions or tools. A deterministic policy mask decides which registered actions are eligible. The MLP/HMM may rank only that allowed set; it cannot relax permissions, invent source identity, admit evidence, or advance durable workflow state. Until revision-qualified outcome labels exist, keep deterministic ranking as the oracle and HMM/MLP as disabled challengers. The existing HMM training recorder rejects placeholder revisions, and the reviewed policy data is not sufficient to fit or validate a useful sequence model.

Never inject raw retrieval hits. Assemble, admit, and canonicalize through the existing ACE/ContextManifest path first. The OpenSpec ledger already records PromptPlan/context integration as partially built or dormant and the production caller/readback gate open.

## NES analogy: what 40 KiB means and what to reuse

An NROM-256 cartridge has 32 KiB PRG-ROM plus 8 KiB CHR-ROM; 40 KiB is the combined nominal ROM capacity, not a text budget. The PRG region competes among code, tables, dialogue, and other data. CHR stores reusable graphics tiles. Text can refer to glyph tiles and use dictionaries or dual-tile encodings to avoid repeating common sequences.

For Parent Atlas, the useful mapping is:

| NES concept | Parent Atlas analogue | Safety condition |
|---|---|---|
| Reusable glyph/tile | Reusable prompt fragment or evidence excerpt | Fragment is versioned and its source bindings remain attached |
| String/dictionary code | Compact reference to a revision-qualified evidence object | Resolve the reference against the same workspace/source revision |
| ROM bank / offset | Tensor or artifact descriptor with path, byte offset, shape, digest | Bounds and digest verified before read |
| Dialogue state | FSM state | Transition policy remains deterministic and auditable |

Task 10.1 (`TENSOR-IO-01`) proves an NES-style **numeric resource lookup table** for contiguous vectors and ordinal-to-identity resolution. It is not a text codec. No reviewed source or task receipt proves a reversible dictionary codec for ACE text/context. Keep ordinary ACE serialization as the baseline; any codec experiment must compare exact decode fidelity, source-reference preservation, token/byte savings, and invalidation behavior before adoption.

## Existing owners and actual gaps

| Work package | Existing owner | Current state | Missing acceptance proof |
|---|---|---|---|
| Workspace-origin source bridge | External capture + workspace grant + packet identity owners; OpenSpec integration-hardening 8.1/8.2 | Components exist separately | One fixture/test path joining a fetched observation to a valid grant and exact content/source revision, denying missing/expired/wrong-workspace grants |
| Bounded self-prompting | `atlas.action.v1`, tool registry/preflight, PromptPlan, ACE | Contracts/tools exist; PromptPlan caller is dormant/partial | One request-path replay through bounded decomposition, registered-tool validation, evidence qualification, ContextManifest, and response/stop, with no unauthorized dispatch |
| NES-style compact context | ACE packet/ContextManifest and TENSOR-IO-01 | Numeric LUT proof exists; text compression not proven | Reversible text-context codec experiment with exact round-trip and measured token/byte budget, preserving source refs and revision checks |
| HMM/MLP action ranking | Existing policy extraction/training and recommendation owners | Candidate design only; insufficient admitted labels | Revision-qualified state/action/outcome dataset, held-out comparison against deterministic ranking, calibrated abstention, and policy mask invariant |
| External provider continuity | Firecrawl/BeautifulSoup plus provider-specific acquisition | Source-level implementations and tasks exist | Current license/terms, SSRF, egress, redirect, size/timeout, and supported-source verification per provider |

Do not call this fully wired until there is one end-to-end receipt covering grant check, provider observation, exact content hash, evidence admission, ContextManifest, selected registered tool, policy decision, and final output/readback. A passing component test is contract proof, not this operational proof.

## OpenSpec alignment; no new task IDs

- `parent-atlas-agent-framework-integration-hardening/tasks.md`: tasks 8.1–8.6 own external acquisition, parser/provider metadata, network controls, and license terms. Task 10.1 is the completed numeric NES LUT proof; 10.3 owns the action FSM. Do not reinterpret 10.1 as text compression.
- `parent-atlas-ace-rlm-bitfrost-integration/tasks.md`: owns ACE/BitFrost/ContextManifest and external-document pipeline alignment. Existing packet/cache rules keep token budgets request-scoped and cache entries revision-addressed.
- `parent-atlas-agentic-repair-fabric/tasks.md`: AR-17/ACE context and PromptPlan integration remains partially built/dormant; its ledger explicitly records the absent live route caller and the need for a specific caller decision.
- `parent-atlas-retrieval-lineage-dag-convergence/tasks.md`: ContextManifest-backed request path and independent readback remain separate gates.

## Exact source fingerprints reviewed

SHA-256 of the current source files at review time:

| Source | SHA-256 |
|---|---|
| `packages/parent-atlas/src/core/external-doc-capture-runtime.ts` | `81319ccf7e2a861655670f464df439762054a56b13fe851e2cf7f82d22184a3b` |
| `packages/semantic-contracts/src/semantic-packet.ts` | `efb3dcdbbf75199fdc0d080f1b96b012849cba5cd0e3ee611d7554c01fae3ed2` |
| `sveltekit-frontend/src/lib/server/atlas/authorization/actor-workspace-grant-v1.ts` | `2e2256b73041fd6a55d3e29afd506b61df02ddcd72e590cb8f500078884b8d23` |
| `packages/atlas-orchestrator/src/models/prompt-plan-agent.ts` | `f622be0bbd80a180e152ce277d854c02d069653183b64065b70e4fee3c33fa89` |
| `sveltekit-frontend/src/lib/server/atlas/policy/policy-training.ts` | `ee759aac1dc4754b66d2b0fd2e28f7de9a2a2ccb1729e12f3aadecaf3adeb535` |

No sealed aggregate checksum is claimed.

## Next safe milestone

Add a focused, no-network test at the existing external-capture/workspace-grant boundary. It should construct an observation fixture and grant fixture, prove exact workspace/source/revision/digest binding, and reject wrong workspace, stale revision, missing grant, and source-content mismatch. Then prepare one bounded PromptPlan replay using only that admitted fixture and the existing tool registry. Keep the text codec as a separate benchmark proposal until the baseline packet budget and fidelity are measured.

No crawl, live tool dispatch, model call, cache write, DB write, task mutation, or GPU run was performed for this report.

## External references

- GitHub [REST API best practices](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api) and [webhook delivery validation](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries).
- Reddit Help [RSS service change](https://support.reddithelp.com/hc/en-us/articles/54058188280852-Setting-up-mod-alerts-in-Discord-or-Slack): the announced Reddit-specific end date is November 13, 2026; this is not a universal RSS/Atom deprecation.
- NESdev [NROM](https://www.nesdev.org/wiki/Programming_NROM) and [text compression](https://www.nesdev.org/wiki/Text_compression).
