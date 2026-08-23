# Node Tree-sitter vs 8095 corpus parity v2

- status: **CORPUS_PARITY_MISMATCH**
- git HEAD: `13ef46af464eeabebfa9709b0c01a045441d0091`
- Node provider blob: `0965b87e66525a918d8b340985014e50a43a46c2`
- 8095 facade blob: `6aacc506cfcc3bb7ca797a4eb063a8266fd8b7fc`
- comparator blob: `3f30fd18c5a6e5ee73fa3e74ee0cbecd6b78b0e6`
- runtime-readiness blob: `4ac8e15d8dc64fdf7775fba1d6090061679b4f21`
- corpus files: 66
- runtime available: 66/66
- source bytes frozen: 66/66
- Node span self-valid: 66/66
- 8095 span self-valid: 66/66
- named-symbol coverage: 61/66
- semantic-kind parity: 57/66
- exact-span parity: 24/66
- full parity: 22/66

## Aggregate mismatch classes

- EXACT_SPAN_MISMATCH: 421
- NAMED_SYMBOL_MISSING_LEFT: 12
- SEMANTIC_KIND_MISMATCH: 6

Duplicate names are paired one-to-one. A `fragment` chunk remains semantic kind `UNKNOWN`; UNKNOWN never counts as semantic parity.
A provider with `engine: unavailable` blocks the proof even when the HTTP response itself is schema-valid.
Canonical ownership and persistence remain unchanged.
