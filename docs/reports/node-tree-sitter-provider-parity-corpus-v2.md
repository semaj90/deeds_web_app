# Node Tree-sitter vs 8095 corpus parity v2

- status: **CORPUS_PARITY_MISMATCH**
- git HEAD: `ec2f544a2bfa26a825de69d9af9ce846647fc3da`
- Node provider blob: `3a0e758956f2aa6371a2f0b9b03867ca0ca1e6bb`
- 8095 facade blob: `7330acce0d140a832951382aa6bffa476b7dfc13`
- comparator blob: `8143dac83bff2ebe772de8fa95d5c5a65a50b5dd`
- corpus files: 66
- runtime available: 66/66
- source bytes frozen: 66/66
- Node span self-valid: 66/66
- 8095 span self-valid: 66/66
- named-symbol coverage: 53/66
- semantic-kind parity: 50/66
- exact-span parity: 53/66
- full parity: 50/66

## Aggregate mismatch classes

- NAMED_SYMBOL_MISSING_RIGHT: 37
- SEMANTIC_KIND_UNKNOWN_BOTH: 4

Duplicate names are paired one-to-one. A `fragment` chunk remains semantic kind `UNKNOWN`; UNKNOWN never counts as semantic parity.
Canonical ownership and persistence remain unchanged.
