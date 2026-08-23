# Node Tree-sitter vs 8095 corpus parity v2

- status: **CORPUS_PARITY_MISMATCH**
- git HEAD: `035d93145245a1100485d5772b95161ffc7f293a`
- Node provider blob: `29f1081eda063f45044690ea8ce05caac3356e73`
- 8095 facade blob: `39b48a55c6c6a4df2180c11c222c497545332c8e`
- comparator blob: `3e63746e2aedff7f8837cf3a72b8231827a19039`
- corpus files: 66
- runtime available: 66/66
- source bytes frozen: 66/66
- Node span self-valid: 66/66
- 8095 span self-valid: 66/66
- named-symbol coverage: 44/66
- semantic-kind parity: 42/66
- exact-span parity: 2/66
- full parity: 2/66

## Aggregate mismatch classes

- EXACT_SPAN_MISMATCH: 606
- NAMED_SYMBOL_MISSING_LEFT: 18
- NAMED_SYMBOL_MISSING_RIGHT: 61
- SEMANTIC_KIND_MISMATCH: 6

Duplicate names are paired one-to-one. A `fragment` chunk remains semantic kind `UNKNOWN`; UNKNOWN never counts as semantic parity.
Canonical ownership and persistence remain unchanged.
