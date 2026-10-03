# AST failure isolation proof

- status: **PROVEN**
- sidecar: http://127.0.0.1:8095
- files: 4/4 passed
- malformed diagnostic: PASS
- missing delimiter diagnostic: PASS
- typed ChunkingError tag: OPEN (sidecar envelope)

- valid-a: PASS (2 chunks, 0 diagnostics)
- malformed: PASS (0 chunks, 2 diagnostics)
- missing-delimiter: PASS (2 chunks, 1 diagnostics)
- valid-b: PASS (2 chunks, 0 diagnostics)
