# SPAN-DIAG-01 Recovery Status v1

Status: `BLOCKED_HISTORICAL_INPUTS_NOT_FOUND`; capture path: `WIRED_NOT_LIVE_RUN`  
Canonical authority: false  
LangExtract execution this pass: no  
Persistent writes: none

## Recovery search

- Searched the named LangExtract, grounded-extraction, proposal, and temporary probe artifacts for rejected-span records. None supplied both exact input text and the two raw LangExtract surfaces/intervals.
- `docs/reports/ast-node-8095-parity.json` contains a `spanMismatches: 2` fixture count, but that report compares Tree-sitter AST chunkers and is not the LangExtract mismatch cohort. It lacks the needed source/extraction interval evidence.
- Re-running LangExtract without the original inputs/settings cannot recover the historical failures. It could produce a new diagnostic only, and must not be represented as the old two cases.

## Diagnostic capture added

`python/miniforge_nlp_sidecar.py` now retains rejected LangExtract spans in response metadata rather than silently dropping them. It records the exact extraction surface, returned character interval/alignment status, source checksum and byte/character lengths, CR/LF/CRLF counts, NFC/NFD status, original slice result, derived UTF-8 byte interval/slice result, normalization probes, and a typed classification. Accepted extractions still require exact character and byte slices against the original text; normalization probes never promote a candidate.

The response also distinguishes `NOT_ATTEMPTED`, `COMPLETED_EMPTY`, `COMPLETED_GROUNDED`, `FAILED`, and `REJECTED_SPAN_MISMATCH`, with attempted/available/completed flags and producer/model/input metadata. This diagnostic is returned to the caller; it does not persist source text or write to a store.

## Validation

- Isolated span/execution checks: 5 passed (exact multibyte slice, CRLF classification, Unicode normalization classification, completed-empty state, rejected-span receipt).
- Sidecar syntax compilation: passed with the configured WSL Python runtime.
- Repository pytest suite: not run; system and repository Windows environments do not contain pytest. No dependency was installed.
- No live LangExtract request was run. Historical SPAN-DIAG-01 remains blocked until the original two inputs/receipts are recovered or supplied.

## Next gate

Use the same original inputs and configuration if recoverable from caller/session receipts. Otherwise, obtain operator approval for a new bounded diagnostic replay, capture this response metadata, and label it a new cohort. Only after the two cases are classified should `SPAN-CONTRACT-01`, the FI-03 LangExtract run, and the one-case ast-grep fence proof proceed.
