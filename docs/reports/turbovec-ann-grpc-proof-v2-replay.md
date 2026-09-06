# TurboVec ANN gRPC Proof

Status: PASS
Qdrant collection: codebase_chunks_768_v2
Usable candidates: 50
HTTP indexed: 50
gRPC candidates: 9

## Gates

| Gate | Result |
|---|---:|
| qdrant_vectors | PASS |
| qdrant_identity_qualified | FAIL |
| http_indexed | PASS |
| grpc_ok | PASS |
| grpc_search_nonempty | PASS |
| grpc_canonical_only | PASS |
| grpc_identity_preserved | PASS |
| identity_preserved | PASS |
| pass | PASS |
