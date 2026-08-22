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
- parity-comparator blob SHA
- source SHA-256 / UTF-8 byte length / CRLF count
- provider engine versions returned at runtime

### AST-PARITY-1 — UTF-8 byte invariant

The parser input and the compared source must use the same UTF-8 byte representation.

The 8095 facade writes its `treesitter-chunker` temporary file in binary mode using `source.encode("utf-8")`. This removes Python text-mode newline translation from the byte-span boundary. The boundary test covers CRLF plus multibyte UTF-8 and both the modern `identity_path` call and the legacy fallback call.

Acceptance:

- request/disk SHA-256 must agree before provider comparison
- Node spans must be self-valid against the original request UTF-8 bytes
- 8095 spans must be self-valid against the same original request UTF-8 bytes
- CRLF/LF conversion must never be hidden by comparison normalization

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

### AST-PARITY-3 — deterministic one-to-one comparison

`StructuralParityComparisonV2` performs one-to-one pairing for repeated symbol names. A right-side observation may not satisfy more than one left-side observation.

Pair preference is deterministic:

1. known equal semantic kind
2. same parent context
3. minimum byte-span delta
4. stable source-order tiebreak

This prevents overloads, repeated methods, nested declarations, or duplicate local names from inflating parity.

Corpus parity is not one boolean comparison. Report independently:

1. runtime availability
2. source bytes frozen
3. Node span self-validity
4. 8095 span self-validity
5. named-symbol coverage
6. semantic-kind parity
7. exact byte-span parity
8. full parity = conjunction of the above

Unknown semantic kinds do not count as semantic-kind matches.

### AST-PARITY-4 — executable mismatch classes

The comparator emits these classes directly:

- `LEFT_SPAN_INVALID`
- `RIGHT_SPAN_INVALID`
- `NAMED_SYMBOL_MISSING_LEFT`
- `NAMED_SYMBOL_MISSING_RIGHT`
- `SEMANTIC_KIND_UNKNOWN_LEFT`
- `SEMANTIC_KIND_UNKNOWN_RIGHT`
- `SEMANTIC_KIND_UNKNOWN_BOTH`
- `SEMANTIC_KIND_MISMATCH`
- `EXACT_SPAN_MISMATCH`

For the corpus runner, `left = Node challenger` and `right = 8095 sidecar`.

Therefore:

- `NAMED_SYMBOL_MISSING_LEFT` means 8095 observed a named symbol that Node did not pair.
- `NAMED_SYMBOL_MISSING_RIGHT` means Node observed a named symbol that 8095 did not pair.
- `LEFT_SPAN_INVALID` is a Node self-span failure.
- `RIGHT_SPAN_INVALID` is an 8095 self-span failure.

A higher-level `CHUNK_BOUNDARY_ONLY_DIFFERENCE` may only be assigned during post-run interpretation when named semantic observations agree but provider chunk segmentation differs. It is not used to hide semantic or span mismatches.

### AST-PARITY-5 — corpus rerun

Run from `sveltekit-frontend` with the 8095 sidecar available:

```powershell
$env:ATLAS_AST_PARITY_CORPUS_LIMIT='66'
npx vitest run \
  src/lib/server/atlas/indexing/structural-observation-v1.spec.ts \
  src/lib/server/atlas/indexing/structural-parity-comparator-v2.spec.ts
npx tsx scripts/atlas/prove-node-tree-sitter-corpus-parity-v2.mts
```

Run the Python byte-boundary proof from the repository Python environment:

```powershell
python -m pytest python/test_miniforge_nlp_sidecar_v2_bytes.py -q
```

For comparison with the previous 66-file cohort, keep the deterministic corpus root, limit, and maximum-size conditions unchanged.

Outputs:

- `docs/reports/node-tree-sitter-provider-parity-corpus-v2.json`
- `docs/reports/node-tree-sitter-provider-parity-corpus-v2.md`

### AST-PARITY-6 — post-run classification

After rerun:

1. fail first on runtime/source-byte/span-self-validity errors
2. then inspect named-symbol coverage
3. then semantic-kind disagreements/UNKNOWN kinds
4. only then evaluate exact-span differences
5. separately inspect chunk-boundary policy when semantic observations otherwise agree

No normalization rule may be proposed before the mismatch class and provider-native evidence are recorded.

## Promotion rule

Fixture parity remains valid evidence for the fixtures only. Corpus parity must be proven separately. Failure of corpus parity blocks promotion of Node Tree-sitter as the canonical structural owner but does not invalidate unrelated GPH batch-isolation, delta-orchestration, or 8095 reachability proofs.

`CORPUS_PARITY_PROVEN` requires all executable gates to pass for the frozen corpus. A partial improvement in match rate remains `CORPUS_PARITY_MISMATCH`.

Graphify APPLY remains out of scope for this tranche.
