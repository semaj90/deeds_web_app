# AST sidecar capability proof

- status: **PROVEN**
- endpoint: http://127.0.0.1:8095
- engine: treesitter-chunker 4.0.0
- chunks: 3
- edges: 9
- diagnostics: 0

- SIDECAR_HEALTH_PASS: PASS
- SIDECAR_CAPABILITY_DISCOVERY: PASS
- TREESITTER_CHUNKER_IMPORTABLE: PASS
- AST_EVIDENCE_ENDPOINT: PASS
- AST_EVIDENCE_DIAGNOSTICS_EMPTY: PASS
- UPSTREAM_CHUNK_ID_ONLY: PASS
- TYPED_EDGE_EVIDENCE: PASS
- NO_FAKE_CALL_SYMBOLS: PASS

The sidecar emits structural evidence only. Parent Atlas identity and persistence remain downstream owners.
