# Node Tree-sitter vs 8095 corpus parity v2

- status: **CORPUS_PARITY_MISMATCH**
- git HEAD: `350f302a999361414227557aac63ae1deaf7a4d1`
- Node provider blob: `29f1081eda063f45044690ea8ce05caac3356e73`
- 8095 facade blob: `b2a596fed2603690f44cd4e2515b61a60fa94a00`
- comparator blob: `3e63746e2aedff7f8837cf3a72b8231827a19039`
- corpus files: 66
- runtime available: 66/66
- source bytes frozen: 66/66
- Node span self-valid: 66/66
- 8095 span self-valid: 66/66
- named-symbol coverage: 45/66
- semantic-kind parity: 42/66
- exact-span parity: 45/66
- full parity: 42/66

## Aggregate mismatch classes

- NAMED_SYMBOL_MISSING_LEFT: 12
- NAMED_SYMBOL_MISSING_RIGHT: 60
- SEMANTIC_KIND_MISMATCH: 7

Duplicate names are paired one-to-one. A `fragment` chunk remains semantic kind `UNKNOWN`; UNKNOWN never counts as semantic parity.
Canonical ownership and persistence remain unchanged.
