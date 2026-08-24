# AST sidecar capability proof

- structural status: **PROVEN**
- LangExtract grounding status: **DEGRADED**
- endpoint: http://127.0.0.1:8095
- contract: provenance-v2
- engine: treesitter-chunker 4.0.0
- chunks: 3
- edges: 9
- diagnostics: 0

- SIDECAR_HEALTH_PASS: PASS
- PROVENANCE_V2_CONTRACT: PASS
- SIDECAR_CAPABILITY_DISCOVERY: PASS
- TREESITTER_CHUNKER_IMPORTABLE: PASS
- AST_EVIDENCE_ENDPOINT: PASS
- AST_EVIDENCE_DIAGNOSTICS_EMPTY: PASS
- STRUCTURAL_CHUNKS_NONEMPTY: PASS
- NATIVE_CHUNK_IDS: PASS
- NATIVE_NODE_IDS: PASS
- NATIVE_FILE_IDS: PASS
- NATIVE_SYMBOL_IDS_FOR_NAMED_CHUNKS: PASS
- HIERARCHY_PRESERVED: PASS
- DEFINES_EDGE_EVIDENCE: PASS
- REFERENCE_EDGE_EVIDENCE: PASS
- EDGE_TYPES_RECOGNIZED: PASS
- NO_FAKE_CALL_SYMBOLS: PASS
- GROUNDED_PROBE_COMPLETED: PASS
- LANGEXTRACT_NATIVE_CHAR_INTERVAL: FAIL
- LANGEXTRACT_ALIGNMENT_STATUS_VISIBLE: FAIL

The proof requires definition evidence plus at least one typed reference edge; it does not require every possible XRef edge kind to appear in one fixture.
Native Consiliency IDs remain upstream provenance. This proof only establishes provenance completeness; GIS still owns canonical identity promotion.
