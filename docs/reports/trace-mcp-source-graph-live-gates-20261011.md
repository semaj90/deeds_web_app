# TRACE MCP capability and source-to-graph live proof gates

This document is an implementation checklist, not a production proof receipt.

## TRACE-MCP-01

- [x] Code: separate MCP capability discovery from HTTP health.
- [x] Code: send initialize and notifications/initialized before tools/list.
- [x] Code: paginate tools/list, reject duplicate cursors and malformed schemas.
- [x] Code: do not return readiness when the required tool inventory is missing.
- [ ] Live: compare discovery against the exact runtime registry on port 8788.
- [ ] Live: verify the listener PID/ownership before replacing any process.
- [ ] Live: verify client authentication scopes and tool call authorization.
- [ ] Tests: mock JSON and SSE MCP transports, list pagination, missing tools, malformed schema, initialization failure, auth failure, and restart timeout.
- [ ] Live: write a readback-verified TraceCapabilityReceiptV1 with actual tool names and input-schema digests.

### Local non-destructive check

From sveltekit-frontend:

```bash
node --check scripts/ensure-mcp-server.mjs
node scripts/ensure-mcp-server.mjs
```

The second command performs read-only health and capability discovery; it does not spawn or restart the server. A nonzero exit means the capability gate is not proven.

Do not execute `--spawn` unattended until the PowerShell listener-ownership/stop logic is audited; the legacy function can force-stop an arbitrary process bound to the configured port.

## SOURCE-LIVE-01

- [ ] Bind one SearchRuntime request-local candidate to its independently recorded CandidateOrdinalMapV1.
- [ ] Reopen source bytes via the existing authorized source reader.
- [ ] Check source/workspace revisions, root containment, UTF-8 byte boundaries, exact source span and SHA-256 digest.
- [ ] Record parser/language provenance separately; ast-grep, sed, LSP, and LangExtract do not themselves constitute source admission.
- [ ] Keep source-only retrieval usable when no ontology tuple is admitted.

## TUPLE-LIVE-01 / GRAPH-LIVE-01

- [ ] Ask existing ontology owner for an admitted typed tuple with participant canonical IDs, roles, revision-qualified evidence and admission receipt.
- [ ] Without an admitted tuple, block graph-relation features and ontology synthesis.
- [ ] Freeze role-preserving graph snapshot and digest; retain relation-to-participant direction.
- [ ] Run NetworkX CPU oracle on the frozen snapshot and record graph parameters/result digest.
- [ ] Bind scores back to original candidate ordinals; never re-enumerate cache or retrieval hints as authority.

## MANIFEST-LIVE-01 / PREFILL-LIVE-01

- [ ] Compile candidate features via canonical ranking and fusion owner.
- [ ] Independently read back ContextManifestV1 and verify checksum, source lineage, feature revisions and evidence references.
- [ ] Compile PromptPlan only from eligible manifest entries; bind model/template/adaptor/evidence revision to prefill identity.
- [ ] Keep ACE/BitFrost, IPC/mmap, PyTorch, cuGraph, and cuTile as downstream optimizations with no source-authority privileges.
- [ ] Verify GPU executor parity against identical frozen CPU inputs before admission.

## Existing owner references

- `sveltekit-frontend/src/lib/server/retrieval/revision-qualified-shadow-provider-v1.ts` — source preflight with injected owners; still explicitly not admission.
- `sveltekit-frontend/src/lib/server/atlas/retrieval/search-runtime-context-manifest-shadow-v1.ts` — manifest shadow owner.
- `sveltekit-frontend/src/lib/server/retrieval/semantic-search-workflow.ts` — runtime workflow.
- `packages/parent-atlas/src/core/observation-feature-compiler.ts` — feature contract owner.

No databases, vectors, model caches, or GPU stores are modified by this documentation.
