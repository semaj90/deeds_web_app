# Node Tree-sitter vs 8095 corpus parity v2

- status: **CORPUS_PARITY_MISMATCH**
- git HEAD: `278d740327645c13644f18b30ed4ec5122aef1c1`
- Node provider blob: `29f1081eda063f45044690ea8ce05caac3356e73`
- 8095 facade blob: `39b48a55c6c6a4df2180c11c222c497545332c8e`
- comparator blob: `3e63746e2aedff7f8837cf3a72b8231827a19039`
- corpus files: 66
- runtime available: 66/66
- source bytes frozen: 66/66
- Node span self-valid: 66/66
- 8095 span self-valid: 66/66
- named-symbol coverage: 45/66
- semantic-kind parity: 42/66
- exact-span parity: 17/66
- full parity: 16/66

## Aggregate mismatch classes

- EXACT_SPAN_MISMATCH: 463
- NAMED_SYMBOL_MISSING_LEFT: 12
- NAMED_SYMBOL_MISSING_RIGHT: 60
- SEMANTIC_KIND_MISMATCH: 7

Duplicate names are paired one-to-one. A `fragment` chunk remains semantic kind `UNKNOWN`; UNKNOWN never counts as semantic parity.
Canonical ownership and persistence remain unchanged.
