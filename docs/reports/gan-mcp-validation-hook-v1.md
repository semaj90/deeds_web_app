# GAN MCP validation hook v1

Date: 2026-11-18

## Scope

Added an observational GAN validation hook to the existing Atlas semantic MCP result path. The hook annotates KAG/RAG/DAG/ACE and action-surface results with explicit gate state; it does not admit retrieval candidates, create canonical source identity, authorize writes, or claim validation proof.

## Status

- **CREATED:** `packages/atlas-core/src/validation/gan-validation-hook-v1.ts` defines the observation contract and status classifier.
- **WIRED:** `atlas-semantic-tools.ts` attaches the observation to both successful and blocked semantic-tool results.
- **PROVEN:** The focused TypeScript project check passed, the `.okf` manifest/schema validation passed in this work session, and the adversarial probe below passed.
- **DONE:** No. Reviewer acceptance and live, revision-qualified replay/cache/provenance proof are still missing.

## Evidence

The live Atlas context-building lookup returned `UNADMITTED_RETRIEVAL_CANDIDATES`, `MISSING_SOURCE_REVISION`, and `proofUsable:false`; source references for the requested tool/schema owners were unresolved. These results remain discovery-only. Direct source inspection found that semantic tool results already expose noncanonical and unverified-input status, while context building is not configured as an admitted source.

Focused adversarial probe output:

```json
{"probe":"GAN_MCP_UNADMITTED_CONTEXT_AND_MISSING_PROVENANCE","result":"PASS","statusWhenGateRefMissing":"WIRED","rawHitsPromoted":false,"sourceRevisionInvented":false,"writesPerformed":false}
```

The probe verified that a missing provenance reference cannot promote the status beyond `WIRED`, and that an unadmitted retrieval result does not gain a source revision, proof usability, or write claim.

Focused TypeScript command:

```text
node ./sveltekit-frontend/node_modules/typescript/bin/tsc --noEmit -p packages/atlas-core/tsconfig.json
exit code: 0
```

The `.okf` schema check passed after setting `raw_hits_to_model: false`; result: `OKF_SCHEMA_VALID; GAN_HOOK_REGISTERED; status=NOT_CREATED,CREATED,WIRED,PROVEN,DONE`.

## Remaining proof gates

- Run the two existing read-only adapters through bounded replay with exact source/workspace revisions and an independently checked output digest.
- Prove cache identity and invalidation against the same revisions; a cache hit is not source proof.
- Obtain admitted `ContextManifest` evidence with source refs, ConceptID, confidence, and bounded context; raw retrieval hits must remain outside model input.
- Complete an adversarial matrix for malformed inputs, stale revisions, authorization denial, timeout, replay mismatch, and attempted write surfaces.
- Obtain reviewer acceptance before classifying the hook as `DONE`.

OpenSpec task 4.5 remains unchecked. No database, Redis/Valkey, Qdrant, Neo4j, or SeaweedFS writes were performed.

## Changed files for this slice

- `packages/atlas-core/src/validation/gan-validation-hook-v1.ts`
- `packages/atlas-core/src/index.ts`
- `sveltekit-frontend/src/lib/server/atlas/atlas-semantic-tools.ts`
- `.okf/pipelines/agentic-documentation-context-v1.yaml`
- `.okf/schemas/agentic-documentation-context-v1.schema.json`
- `openspec/changes/parent-atlas-agent-framework-integration-hardening/tasks.md`

## Required closeout

```yaml
likely_cause: GAN validation had no shared status contract at the existing KAG/RAG/DAG/ACE MCP result boundary, so discovery results could be confused with proof.
evidence:
  - packages/atlas-core/src/validation/gan-validation-hook-v1.ts
  - sveltekit-frontend/src/lib/server/atlas/atlas-semantic-tools.ts
  - docs/reports/gan-mcp-validation-hook-v1.md
  - live context lookup reported UNADMITTED_RETRIEVAL_CANDIDATES and MISSING_SOURCE_REVISION
patch_targets:
  - packages/atlas-core/src/validation/gan-validation-hook-v1.ts
  - packages/atlas-core/src/index.ts
  - sveltekit-frontend/src/lib/server/atlas/atlas-semantic-tools.ts
  - .okf/pipelines/agentic-documentation-context-v1.yaml
  - .okf/schemas/agentic-documentation-context-v1.schema.json
  - openspec/changes/parent-atlas-agent-framework-integration-hardening/tasks.md
safe_next_command: "node ./sveltekit-frontend/node_modules/typescript/bin/tsc --noEmit -p packages/atlas-core/tsconfig.json"
smoke_command: "node --import tsx --input-type=module -e '/* run GAN_MCP_UNADMITTED_CONTEXT_AND_MISSING_PROVENANCE probe */'"
report_path: "docs/reports/gan-mcp-validation-hook-v1.md"
```
