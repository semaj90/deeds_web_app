# Node Tree-sitter vs 8095 corpus parity v2

- status: **CORPUS_PARITY_MISMATCH**
- git HEAD: `0952b72dfce405b8ae15e827fd1336f802339fee`
- Node provider blob: `29f1081eda063f45044690ea8ce05caac3356e73`
- 8095 facade blob: `666b15c63aa2cdafe942928a71de01a46c9fdbdc`
- comparator blob: `3e63746e2aedff7f8837cf3a72b8231827a19039`
- corpus files: 66
- runtime available: 66/66
- source bytes frozen: 66/66
- Node span self-valid: 66/66
- 8095 span self-valid: 66/66
- named-symbol coverage: 45/66
- semantic-kind parity: 45/66
- exact-span parity: 45/66
- full parity: 45/66

## Aggregate mismatch classes

- NAMED_SYMBOL_MISSING_LEFT: 12
- NAMED_SYMBOL_MISSING_RIGHT: 60

Duplicate names are paired one-to-one. A `fragment` chunk remains semantic kind `UNKNOWN`; UNKNOWN never counts as semantic parity.
Canonical ownership and persistence remain unchanged.
