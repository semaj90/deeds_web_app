# Parent Atlas Svelte pipeline and TRACE MCP next steps

**Status:** implementation roadmap; the read-only MCP tool is registered and verified against the running TRACE service. No canonical writes are authorized by this document. Canonical Gate V2 remains `FAIL`.

## What works today

- **Svelte template structure:** the official `sveltejs/tree-sitter-svelte` grammar was tested in an isolated harness. Its corpus passed 45/45. On the frozen ten-file comparison it produced no parser errors; 191/203 compiler structures had exact normalized spans. The 12 disagreements are confined to `{:else if ...}` boundaries in `+page.svelte`, `SuggestionsList.svelte`, and `AnalysisPanel.svelte`. Keep the official Svelte compiler AST as the template-range authority; use Tree-sitter as an independent challenger, not as a replacement.
- **Svelte script structure:** the span-preserving script extraction plus ast-grep TypeScript/JavaScript analysis is tested for CRLF, Unicode, multiple script blocks, and exact original-byte readback. Rune/import/function facts can be fused with compiler evidence as proposal-only structural observations.
- **Structural fusion:** the prior 937-component run reported 11,676 agreed rune/import/function facts, zero disagreements, and deterministic replay. This establishes those tested observations only; it does not establish symbol identity, LSP resolution, canonical admission, or relationships.
- **Graphify status:** the shared receipt reader is read-only and reports lifecycle freshness, newest readable gate, blockers, and conflicts. TRACE already has `atlas.workstation_status`, but that tool does not expose these Graphify receipt details.

### Official Svelte grammar comparison decision

The checksummed comparison receipt `.tmp/atlas/svelte-maintained-vs-xberg-grammar-comparison-20261028T032447442Z-v2.json` confirms both existing runs used the same ten frozen source hashes, and all ten still match the current worktree. The historical Xberg language-pack run has **202/203** exact spans, but records one parser-error file and does not record the grammar identity (`grammar: null`). The `sveltejs/tree-sitter-svelte` run has **191/203** exact spans, zero parser-error files, and an exact compiler match for `{@render children?.()}` in `CommandCenterShell.svelte`; its 12 extent disagreements are `else-if` boundaries. The official run does not include a dedicated Unicode/newline fixture table or a complete original-byte-slice tally in its receipt.

**Decision:** do not install or integrate either grammar into production. The official Svelte grammar is the preferred challenger by provenance and error recovery, but it does not meet the 202/203 span floor yet. The Xberg run is a numeric baseline only, not an attributable grammar decision. Keep the compiler AST as the structural authority and test the official grammar again only after the `else-if` extent and byte-fixture evidence are addressed. This comparison read prior receipts only; it did not rerun parsers, change production services, or execute Graphify.

## Pipeline that is safe to use

```text
frozen workspace + exact source bytes
  → official Svelte compiler AST: template structure and byte ranges
  → official Svelte Tree-sitter: independent CST comparison (challenger only)
  → span-preserving script extraction
  → ast-grep TypeScript/JavaScript: script imports, declarations, and rune calls
  → agreement-based structural fusion: proposal-only facts with source digest and byte span
  → Svelte/TypeScript LSP: definition and reference confirmation (currently unverified)
  → revision-qualified symbol-version join (Svelte coverage currently absent)
  → relation proposal with both endpoint identities and evidence
  → canonical admission, authorized persistence, and independent readback (blocked)
```

Do not substitute the old Xberg-bundled `Himujjal/tree-sitter-svelte` grammar. Do not treat ordinary HTML parsing, regex-only snippet recognition, parser agreement, or an extracted path as semantic binding. `semantic_768`, graph projections, ACE, and recommendation ranking are downstream of identity and revision qualification.

## Batch relations to recommendations and file edits

For a batch of Svelte/TypeScript files, keep analysis and editing as separate, revision-bound operations:

```text
frozen file allowlist + workspace revision + per-file digest
  → compiler AST / ast-grep script observations
  → ts-morph semantic enrichment for supported TS/JS source
  → Svelte LSP evidence for template references (not yet verified)
  → relation candidates with exact endpoint evidence and explicit unresolved reasons
  → deterministic batch analysis and deduplication
  → existing recommendation candidate/ranking owner
  → human-reviewed patch plan for an explicit file allowlist
  → apply only after separate approval; reparse and verify against the new revision
```

`ts-morph` enriches an already selected structural candidate; its contract explicitly prevents it from minting canonical IDs or authorizing mutation. For Svelte, analyze extracted script blocks with the established byte-to-character mapping; do not pass the whole `.svelte` file to ts-morph and claim template/LSP semantics. Relation batch output is a proposal until both endpoints have revision-qualified identities. Recommendations may order evidence-backed work, but must not silently edit files or persist relationships. The existing Kanban candidate scorer is a ranking component, not a substitute for candidate identity, evidence admission, or reviewer approval.

The pasted Vite log is **not** a Svelte parser failure: the `.svelte-kit/generated/*.js` lines are SSR reload notices. The `RabbitMQ write ECONNRESET` lines show an AMQP connection loss; the log says the outbox publisher stopped. That can interrupt queue-backed downstream processing, but this excerpt does not establish that local AST parsing failed or that a particular relation batch uses RabbitMQ. Source review of `outbox-boot.ts` shows its connection-close handler clears the publisher handle but does not schedule a reconnect. RabbitMQ’s container is healthy at the latest check, but that alone does not prove the application publisher recovered; verify its live status or reinitialize it before depending on queued delivery. No direct RabbitMQ dependency was found in the Svelte parser or ts-morph enrichment owners. Do not interpret the Vite reload and RabbitMQ reset as one causal event from this log alone.

## TRACE MCP tool added

`graphify.status` is a no-argument, read-only MCP tool in `sveltekit-frontend/src/mcp/trace-mcp-server.ts`. It calls the existing `readGraphifyStatus` owner and returns a bounded JSON receipt summary. The tool:

- reads the existing lifecycle and Canonical Gate receipts only;
- reports `runsGraphify: false`, `writesPerformed: false`, and `canonicalAuthority: false`;
- never launches a command, changes files, writes a database/cache, or promotes a gate;
- can report `ELIGIBLE_PENDING_OTHER_GATES`, never final admission.

The source change was activated through the existing TRACE launcher. The service health endpoint is healthy; live `tools/list` returned 201 tools including `graphify.status`, and a live call returned the typed status below. No Graphify execution or persistence occurred.

Latest live response: `graphifyDependentWork=GATED`; reasons include `LIFECYCLE_STALE`, `GATE_FAIL`, and `FIRST_BLOCKER:PACKET_IDENTITY:IDENTITY_GATE:GRAPHIFY_EXECUTION_NOT_CANONICAL`. The tool reports `readOnly=true`, `runsGraphify=false`, `writesPerformed=false`, and `canonicalAuthority=false`.

Example MCP call after activation:

```json
{"method":"tools/call","params":{"name":"graphify.status","arguments":{}}}
```

## Next steps, in dependency order

1. **Keep Graphify gate closed.** Resolve canonical execution authority, packet identity, repository/snapshot scope, and workspace revision lineage. Treat existing stale receipts as diagnostics, not current admission.
2. **Explain Svelte processing coverage.** Reconcile the admitted Svelte paths with Graphify file/symbol rows; do not mint symbols or infer identity from names or paths. Establish the authorized producer and revision-qualified symbol-version policy first.
3. **Close the parser disagreement.** Compare the 12 `else-if` boundaries against original bytes and compiler AST semantics. Add explicit node/coverage verdicts; do not coerce mismatching spans into agreement.
4. **Verify semantic references.** Retry a bounded Svelte LSP sample with timeout/cancellation and record exact query, target, source/workspace revision, and outcome. A timeout is `UNVERIFIED`, not a negative definition result.
5. **Build one read-only vertical slice.** Start with one frozen Svelte component and carry exact source digest, byte span, workspace/source revision, and evidence IDs through compiler structure, script facts, LSP result, symbol-version lookup, and relation proposal. Stop at the first missing identity; persist nothing.
6. **Prove retrieval separately.** Only after the slice has admitted identity, test structural retrieval through the existing SearchRuntime/ACE owners. Keep `semantic_768` gated until the producer recipe and representation lineage qualify. Do not build another index or retrieval-fusion owner.
7. **Defer learning and acceleration.** Keep Naive Bayes in proposal-only mode until reviewer-proven labels meet its trusted-label gate. Do not train XGBoost or claim ranking gains without query-grouped judgments. Benchmark GPU/ANN only after bounded CPU parity and exact source-to-candidate joins.
8. **Maintain the TRACE tool deliberately.** The initial activation and handshake are verified. On future changes, rerun focused tests and verify `/health`, `tools/list`, and a real `graphify.status` call. Do not invoke `graphify:daily` through MCP.

## Verification and safety

- Focused status-reader tests: `node --test scripts/atlas/lib/graphify-status-v1.test.mjs`
- TRACE registration contract test: `node --test scripts/atlas/lib/graphify-status-mcp-registration-v1.test.mjs`
- Svelte structural suites: `node --test scripts/atlas/lib/svelte-template-chunks-v1.test.mjs scripts/atlas/lib/svelte-template-references-v1.test.mjs scripts/atlas/lib/structural-evidence-fusion-v1.test.mjs scripts/atlas/lib/ast-grep-symbol-extraction.test.mjs`
- Registration inventory: `npm run trace:mcp:audit` from `sveltekit-frontend/`
- No Graphify execution, canonical database/registry/relation writes, migrations, Qdrant/Neo4j/Valkey writes, production package changes, or service restart is included.

**Current first blockers:** canonical Graphify/packet identity admission and revision-qualified Svelte symbol coverage. **Target:** a read-only, revision-bound Svelte source-to-relation proposal with LSP evidence; canonical writes remain disabled until their independent admission gates pass.
