# Node Tree-sitter vs 8095 corpus parity v2

- status: **CORPUS_PARITY_MISMATCH**
- git HEAD: `f45052109c7460dd6721ddb74b139bde0ab67377`
- Node provider blob: `56a08ce1038505f37330077f3d1f0eb324a41a9d`
- 8095 facade blob: `666b15c63aa2cdafe942928a71de01a46c9fdbdc`
- comparator blob: `3e63746e2aedff7f8837cf3a72b8231827a19039`
- corpus files: 66
- runtime available: 66/66
- source bytes frozen: 66/66
- Node span self-valid: 66/66
- 8095 span self-valid: 66/66
- named-symbol coverage: 66/66
- semantic-kind parity: 63/66
- exact-span parity: 66/66
- full parity: 63/66

## Aggregate mismatch classes

- SEMANTIC_KIND_UNKNOWN_BOTH: 4

Duplicate names are paired one-to-one. A `fragment` chunk remains semantic kind `UNKNOWN`; UNKNOWN never counts as semantic parity.
Canonical ownership and persistence remain unchanged.
