# Proposal: Parent Atlas Compiler-Semantic Graph Resolution

## Problem

The current-source structural edge pipeline (`scripts/atlas/plan-current-structural-edge-artifact-v2.mjs`)
extracts AST evidence from the 8095 treesitter-chunker sidecar and produces `REFERENCES`/`CALLS`/
`IMPORTS`/`EXPORTS` edges, but the vast majority come back unresolved. A live run against a 111-file
bounded cohort produced **10,506 unresolved edges vs. only 1,334 resolved** (89% unresolved).

**Corrected breakdown** (an earlier pass of this investigation mis-counted via a whole-file grep
that matched both resolved and unresolved edges — this is the actual per-bucket count from
`docs/reports/current-structural-edge-artifact-plan-v2.json`'s `unresolvedEdges` array):

- By type: `REFERENCES` 5,292, `CALLS` 4,438, `EXPORTS` 468, `IMPORTS` 308.
- By resolution reason: `unresolved_target` 9,730 (92.6% — the sidecar attempted same-file
  resolution and found no matching declaration), `syntax_only` 776 (7.4% — e.g.
  `{"type": "IMPORTS", "toEvidenceKey": "import fs from 'node:fs';", "resolution": "syntax_only"}`,
  external/`node:` modules the sidecar correctly never attempts to resolve in-repo).
- **Every single one of the 10,506 unresolved edges has `edge.resolved === false` from the sidecar
  itself** — none are cases where the sidecar found a match that the downstream planner then
  dropped.

**Root cause, confirmed by reading the code and the data together**: the 8095 sidecar's `/ast/chunk`
endpoint receives exactly one file's source text per call and has no visibility into any other
file. It can therefore never mark a cross-file `REFERENCES`/`CALLS`/`IMPORTS` edge `resolved: true`
in the first place — same-file declarations get `resolved: true`, everything else correctly comes
back `resolved: false`. There is no symbol-resolution pass anywhere downstream that could turn a
`syntax_only`/`unresolved_target` edge into a resolved one; nothing in this pipeline currently calls
out to anything with cross-file/cross-module awareness.

**A hypothesis this investigation initially raised and then falsified**: that
`plan-current-structural-edge-artifact-v2.mjs`'s per-file-scoped `byNativeId` map (rebuilt fresh
inside the per-source loop) was silently dropping resolvable cross-file matches. Checked directly
against the unresolved-edge data: **zero of the 10,506 unresolved edges have `resolved: true`** —
so there is nothing for a wider-scoped map to have caught. The map's per-file scope is consistent
with what the sidecar itself can ever produce; it is not the cause of the unresolved count and
fixing it would not measurably change today's numbers. This is recorded here rather than silently
dropped so a later pass doesn't re-raise the same already-checked hypothesis.

The actual gap is exactly what the workstation status doc (`docs/parent-atlas-workstation-todo.md`)
already tracks independently as the "compiler-semantic/LSP lane," current status
`PROVEN_FIXTURE_AND_LIVE_READ_ONLY` — meaning only a bounded fixture proof exists, not a production
pass. That fixture proof is real: `scripts/atlas/prove-typescript-lsp-readonly.mjs` (and its Svelte
counterpart `prove-svelte-language-server-readonly.mjs`) spawn `typescript-language-server --stdio`,
speak real JSON-RPC (`initialize` → `textDocument/didOpen` → `textDocument/definition`), and get a
real answer back — but each is hardcoded to one probe symbol
(`createNodeTreeSitterAstProvider`) in one file. Neither is a reusable resolver a pipeline could
call per-edge. Building that reusable resolver (CSGR-1 below) is the real next step; there is no
cheaper mechanical fix available first.

No OpenSpec change currently owns this gap — checked via grep for `CompilerSemanticGraphRevisionV1`/
`LSP-01`/`LSP-02`/`LSP-03`/`compiler-semantic` across `openspec/changes/`; only one incidental
mention turned up, in an unrelated change (`parent-atlas-semantic-512-canonicalization`).

## Why this matters now

Per `docs/parent-atlas-workstation-todo.md`'s own "Safe execution order," `CompilerSemanticGraphRevisionV1`
sits directly between the structural edge lane and every downstream gate (`RF4` identity acceptance,
`SymbolFeatureAlignmentV1`, `LineageQualifiedCandidateOrdinalMapV1`, `CandidateFeatureMatrixManifestV1`,
`CompositeGraphProjectionV1`). `plan-graphify-run-completion-v1.mjs`'s own blocker,
`UNRESOLVED_STRUCTURAL_EDGES_PRESENT`, cannot clear without this. Every change downstream of it in
the workstation's active critical path (`parent-atlas-topology-representation-admission`,
`parent-atlas-graph-runtime-enhancement`) is correctly sequenced behind this gate — it isn't
optional scaffolding, it's the actual next structural blocker.

## Non-goals (explicit)

- **Not** replacing the 8095 treesitter-chunker sidecar or its AST evidence — that stays the
  structural-fact producer. This proposal adds symbol *resolution* on top of its evidence, it does
  not re-parse anything.
- **Not** building a general-purpose LSP orchestration framework. Scope is narrowly: resolve the
  `IMPORTS`/cross-file `CALLS` edges the structural-edge planner already emits as unresolved.
- **Not** claiming this makes `graphify:daily` production-ready end to end. Per this repo's status
  language discipline, this proposal targets exactly one gate
  (`CompilerSemanticGraphRevisionV1` / `LSP-03`) — downstream gates remain separately proven.
- **Not** attempting full-corpus (24,465-file) resolution in the first pass. Start bounded, prove
  the resolver correct and deterministic on the same 111-file cohort the current unresolved-edge
  data already exists for, then scale.

## Proposal

Two layers, not one monolithic client module — per design review, splitting transport from
Atlas-facing resolution keeps per-server protocol quirks (svelte-language-server's cmd.exe
wrapping, its extra settle time) out of the reusable contract, and keeps the reusable contract
(persistent servers, byte→position conversion, result classification) out of raw JSON-RPC:

```
scripts/atlas/lib/
  lsp-jsonrpc-client.mjs        — process lifecycle, JSON-RPC framing, request IDs, timeouts,
                                   didOpen/didClose/initialize/shutdown convenience wrappers.
                                   Generic LSP, zero Atlas concepts.
  compiler-semantic-resolver-v1.mjs
                                 — Atlas-facing contract: persistent one-server-per-language
                                   pool (never spawn-per-edge), byte-offset → LSP-position
                                   conversion, result classification, CompilerSemanticResolutionV1
                                   receipt shaping. canonicalAuthority/writesPerformed always false.
```

1. **Build the transport layer** (`lsp-jsonrpc-client.mjs`) by extracting the JSON-RPC-over-stdio
   mechanics already proven working in the two existing probe scripts (Content-Length framing,
   request/notify, timeouts) — plus generic lifecycle convenience wrappers (`initialize`, `didOpen`,
   `didClose`, `shutdown`) those two scripts previously duplicated inline.
2. **Build the resolver layer** (`compiler-semantic-resolver-v1.mjs`) on top of it: one server
   spawned per language (`typescript`, `javascript`, `svelte`), reused across every
   `resolveDefinition()` call until `dispose()` — **never** spawn a fresh server per edge. A
   111-file cohort at one server-init-per-edge would mean thousands of
   initialize/didOpen/shutdown cycles; TypeScript's own guidance on project references exists
   because language-service load cost is real at scale. `resolveDefinition()` takes exact source
   bytes bound to a `sourceRevision` (never re-reads from disk at call time) plus a byte offset,
   converts byte→UTF-16 LSP position itself (naive `character = byteOffset` is wrong for any
   non-ASCII source — proven with an explicit Unicode fixture below), and returns a
   `CompilerSemanticResolutionV1` receipt with a real status enum: `RESOLVED_IN_REPO`,
   `EXTERNAL_MODULE`, `AMBIGUOUS`, `UNRESOLVED`, `TIMEOUT`, `SERVER_ERROR`, `STALE_SOURCE` — not a
   boolean. `EXTERNAL_MODULE` classification (via a separate `classifyModuleSpecifier()` helper)
   happens *before* any LSP call, so a `node:fs`/package.json-dependency import never wastes a
   round trip proving what a string prefix already answers.
3. **Prove the byte→position conversion against a Unicode fixture before it ever touches a real
   source file** — ASCII, a BMP multibyte character (`é`, 2 UTF-8 bytes / 1 UTF-16 code unit), and
   a surrogate-pair astral character (an emoji, 4 UTF-8 bytes / 2 UTF-16 code units). All three
   must convert correctly; the astral case in particular is where a naive implementation silently
   produces a position off by one code unit.
4. **Route both existing proof scripts through the new resolver** (not just the transport layer) —
   this exercises the full contract (sourceRevision binding, byte-offset math, persistent-server
   reuse, server/resolver revision capture) rather than only the JSON-RPC framing, and doubles as
   the regression gate that the extraction didn't change observable behavior.
5. **CSGR-2 (separate task, not this pass)**: wire the resolver into the structural-edge planner,
   prioritized by actual unresolved volume, not edge-type label — `REFERENCES` (5,292) and `CALLS`
   (4,438) dominate the unresolved set, `IMPORTS` (308) is a small fraction. The LSP
   `textDocument/definition` mechanism doesn't care about the edge-type label, only the position.
6. **CSGR-3 (separate task)**: derive `CompilerSemanticGraphRevisionV1` from a full
   `CompilerSemanticGraphRevisionInputV1` — see the strengthened contract below. A naive checksum
   over just `(sourceRef, sourceRevision, symbolPosition, resolvedTarget*)` is insufficient:
   TypeScript resolution also depends on `tsconfig.json` (`moduleResolution`, `paths`, project
   references), `package.json` `imports`/`exports`, and the lockfile. Two runs with identical
   source bytes but a changed `tsconfig.json` can legitimately resolve the same position to a
   different target — the revision must change when that happens, or it silently lies.
7. **Only after CSGR-2/3 pass on the bounded 111-file cohort**, scope full-corpus (24,465-file)
   scaling as a separate follow-up (CSGR-5) — do not attempt it as part of closing this gap, and do
   not apply the pending 24,465-source Graphify inventory `--apply` write ahead of this gate either:
   that source-inventory snapshot and this structural-edge fixture are already bound to two
   different workspace revisions (see the workspace-owner investigation earlier this session), so
   completing the inventory write would not make the stale structural artifact promotable on its
   own.

## `CompilerSemanticGraphRevisionInputV1` (strengthened, CSGR-3 target)

```
CompilerSemanticGraphRevisionInputV1
  workspaceRevision
  sourceInventoryDigest
  projectConfiguration:
    tsconfigChecksum
    svelteConfigChecksum?
    packageJsonChecksum
    lockfileChecksum
    projectReferenceDigest
  runtime:
    typescriptVersion
    typescriptLanguageServerVersion
    svelteLanguageServerVersion
    resolverRevision
  resolutions[]:            # canonically sorted before hashing
    sourceRef
    sourceRevision
    occurrencePosition
    targetSourceRef
    targetSourceRevision
    targetRange
    resolutionClass

CompilerSemanticGraphRevisionV1 = sha256(canonical-sorted, JSON-stable-stringified input)
```

Independent of `astGraphRevision` per the workstation doc's "Independent graph revision domains"
section — this revision changes only when LSP resolution output or the project-environment
inputs that could affect it change, never when only the treesitter parse changes.

## Design: what's reused vs. what's new

| Reused as-is | New in this proposal |
|---|---|
| 8095 treesitter-chunker sidecar (AST evidence, unchanged) | `scripts/atlas/lib/lsp-jsonrpc-client.mjs` — generic transport, extracted from the two proof scripts |
| `deriveGraphNodeKeyV1` (unchanged identity primitive) | `scripts/atlas/lib/compiler-semantic-resolver-v1.mjs` — Atlas-facing persistent-server resolver + `classifyModuleSpecifier()` |
| `plan-current-structural-edge-artifact-v2.mjs`'s overall shape (read-only plan, no writes), including its existing per-file `byNativeId` (checked, not the bottleneck — see Problem section) | `byteOffsetToPosition()` — UTF-8 byte → UTF-16 LSP position, Unicode-fixture-proven |
| `typescript-language-server`'s real `textDocument/definition` implementation (already translates to TS server Definition/DefinitionAndBoundSpan commands — not a resolver this proposal invents) | Position-based, edge-type-agnostic edge resolution in the structural-edge planner (CSGR-2) |
| — | `CompilerSemanticGraphRevisionV1` derivation over the strengthened input contract above (CSGR-3) |

## Gated rollout order

1. **CSGR-0 — CLOSED, empirically falsified before implementation.** Original hypothesis: fix a
   `byNativeId` per-file scope bug in the structural-edge planner. Checked directly against
   `unresolvedEdges` data first: zero of 10,506 unresolved edges have `resolved: true`, so there is
   nothing for a wider-scoped map to have caught. No code change made. Recorded so this hypothesis
   isn't re-raised without re-checking.
2. **CSGR-1 — implemented and proven this pass.** `lsp-jsonrpc-client.mjs` (transport) +
   `compiler-semantic-resolver-v1.mjs` (persistent-server Atlas resolver) built; Unicode
   byte→position fixture `PROVEN_FIXTURE` (4/4, including a surrogate-pair case); both existing
   proof scripts rewritten to call `resolveDefinition()` and re-run successfully
   (`PROVEN_READ_ONLY` / `PROVEN_LIVE_READ_ONLY`) — see tasks.md for the exact evidence. No
   database writes, no graph revision, no full-corpus scaling.
3. **CSGR-2** — wire the resolver into the planner by position, across all edge types, prioritized
   by volume (`REFERENCES`/`CALLS` first, per the corrected breakdown) on the same 111-file cohort;
   record resolved / external-module / genuinely-unresolved counts separately (three buckets, not
   two — collapsing "external module" into "unresolved" would misrepresent a correct terminal state
   as a gap). Not started.
4. **CSGR-3** — derive and checksum `CompilerSemanticGraphRevisionV1` from the strengthened input
   contract above, using CSGR-2's output. Not started.
5. **CSGR-4** — feed `CompilerSemanticGraphRevisionV1` into `plan-graphify-run-completion-v1.mjs`'s
   `UNRESOLVED_STRUCTURAL_EDGES_PRESENT` check; confirm it now reads the resolved/external/unresolved
   split correctly rather than treating external-module edges as blockers. Not started.
6. **CSGR-5 (follow-up, separate task)** — scale CSGR-2's approach from 111 files to the full
   corpus; not started as part of this proposal.

## Relationship to other changes

- **`docs/parent-atlas-workstation-todo.md`**: this proposal is the OpenSpec-tracked owner of the
  doc's own "compiler-semantic/LSP lane" line item, previously undocumented anywhere in
  `openspec/changes/`.
- **`parent-atlas-graph-runtime-enhancement`**: unaffected — that change's GR-series gates are the
  Neo4j/GDS structural side; this proposal is upstream of it only insofar as
  `CompilerSemanticGraphRevisionV1` is a future input to `CompositeGraphProjectionV1`, not something
  that change currently blocks on.
- **`parent-atlas-topology-representation-admission`**: currently sequenced correctly behind
  `LineageQualifiedCandidateOrdinalMapV1`, which is itself downstream of this gate. No conflict.
- **`parent-atlas-memory-architecture-freeze`**: this proposal's narrow CSGR-1/2 scoping ("no
  database writes, no graph revision yet, no 24k scaling") is a unit-of-work boundary, not an
  architectural deletion of the wider data plane (simdjson, MessagePack, Arrow/mmap, BitFrost, ACE
  packets, GPU tensor caching, ACP/A2A descriptors) — see that change's 2026-08-29 addendum for the
  full data-plane restatement and the explicit "correctness spine vs. performance data plane"
  separation this change is walking the correctness side of.
