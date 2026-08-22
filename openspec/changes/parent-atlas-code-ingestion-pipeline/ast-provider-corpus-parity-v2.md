# AST provider corpus parity v2

Status: `IMPLEMENTED_UNPROVEN`

This proof tranche responds to the corpus-scale result where fixture parity was 3/3 but real-file full parity collapsed. The result is treated as an architectural observation, not patched around with provider-specific aliases.

## Authority

- Default Graphify structural owner remains the 8095 Consiliency/treesitter-chunker provider.
- Node Tree-sitter remains a read-only challenger.
- No canonical identity, `source_revision`, persistence, or Graphify APPLY authority changes in this tranche.
- `fragment` is not mapped to `variable` or `function` without structural evidence.

## AST-PARITY gates

### AST-PARITY-0 — revision freeze

Every corpus receipt must record:

- git HEAD
- Node provider blob SHA
- 8095 facade blob SHA
- source SHA-256 / UTF-8 byte length / CRLF count
- provider engine versions returned at runtime

### AST-PARITY-1 — UTF-8 byte invariant

The parser input and the compared source must use the same UTF-8 byte representation.

The 8095 facade now writes its `treesitter-chunker` temporary file in binary mode using `source.encode("utf-8")`. This removes Python text-mode newline translation from the byte-span boundary.

Acceptance:

`SOURCE_BYTE_PARITY` requires provider spans to be valid against the original request buffer. CRLF/LF conversion must never be hidden by comparison normalization.

### AST-PARITY-2 — provider-neutral observation

`StructuralObservationV1` separates:

- `rawNodeType`
- `rawKind`
- semantic `symbolKind`
- `name`
- byte span
- parent route/context
- span validity

`fragment`, generic `declaration`, and chunk/fallback vocabulary remain `UNKNOWN` semantic kind unless evidence proves a symbol class.

### AST-PARITY-3 — split parity metrics

Corpus parity is no longer one boolean comparison. Report independently:

1. source bytes frozen
2. Node span self-validity
3. 8095 span self-validity
4. named-symbol coverage
5. semantic-kind parity
6. exact byte-span parity
7. full parity = conjunction of the above

Unknown semantic kinds do not count as semantic-kind matches.

### AST-PARITY-4 — corpus rerun

Run from `sveltekit-frontend` with the 8095 sidecar available:

```powershell
$env:ATLAS_AST_PARITY_CORPUS_LIMIT='100'
npx tsx scripts/atlas/prove-node-tree-sitter-corpus-parity-v2.mts
```

For the previous 66-file cohort, set the same deterministic corpus limit/path conditions used by the original proof before comparing rates.

Outputs:

- `docs/reports/node-tree-sitter-provider-parity-corpus-v2.json`
- `docs/reports/node-tree-sitter-provider-parity-corpus-v2.md`

### AST-PARITY-5 — disagreement classification

After rerun, classify each mismatch into exactly one primary class:

- `SOURCE_BYTE_MISMATCH`
- `SPAN_INVALID_NODE`
- `SPAN_INVALID_8095`
- `NAMED_SYMBOL_MISSING_NODE`
- `NAMED_SYMBOL_MISSING_8095`
- `SEMANTIC_KIND_UNKNOWN`
- `SEMANTIC_KIND_MISMATCH`
- `EXACT_SPAN_MISMATCH`
- `CHUNK_BOUNDARY_ONLY_DIFFERENCE`

Only after this classification may a normalization rule be proposed.

## Promotion rule

Fixture parity remains valid evidence for the fixtures only. Corpus parity must be proven separately. Failure of corpus parity blocks promotion of Node Tree-sitter as the canonical structural owner but does not invalidate unrelated GPH batch-isolation, delta-orchestration, or 8095 reachability proofs.

Graphify APPLY remains out of scope for this tranche.
