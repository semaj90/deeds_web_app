# Qdrant Component Parity Audit

Generated: 2026-07-14T15:26:52.596Z
Collection requested: codebase_chunks_384
Collection resolved: codebase_chunks_384
Sample requested: 50
Sample resolved: 50
Status: FAIL

## Components

- point_present: WARN (20/50, 40%)
- packet_id_matches: WARN (0/20, 0%)
- packet_key_matches: PASS (20/20, 100%)
- source_ref_matches: PASS (20/20, 100%)
- qdrant_point_id_matches: FAIL (0/20, 0%)
- aggregate_version_matches: WARN (0/20, 0%)
- content_384_present: PASS (20/20, 100%)
- summary_384_present: PASS (20/20, 100%)
- signature_384_present: WARN (0/20, 0%)
- bm42_present: WARN (0/20, 0%)
- collection_contract: FAIL (0/1, 0%)

## Qdrant

- sampled_packets: 50
- points_present: 20
- missing_points: 30
- identity_contradictions: 20
- stale_points: 0
- incomplete_points: 60
- content_384_present: 20
- summary_384_present: 20
- signature_384_present: 0
- bm42_present: 0

## Repair Requests

- 4439c492e016f9d3: full_projection (missing_point)
- 271b5446f6a86a48: quarantine (qdrant_point_id_mismatch)
- 38da098bc2c36c22: full_projection (missing_point)
- 9f4573e52fce4175: full_projection (missing_point)
- 885c6c04322f6095: full_projection (missing_point)
- 175066b8a4ceee3c: quarantine (qdrant_point_id_mismatch)
- 613f572a65b1ffcc: full_projection (missing_point)
- 58e6adafde74465d: full_projection (missing_point)
- 322b9cf893125f07: quarantine (qdrant_point_id_mismatch)
- d15cb3849bdef3b8: quarantine (qdrant_point_id_mismatch)
- 43f38d7b75868c7c: full_projection (missing_point)
- 25c824811a2efd81: full_projection (missing_point)
- 28e942decdcdb342: full_projection (missing_point)
- 9b11b6f522def1a1: full_projection (missing_point)
- 35afe6ea3fdb17b8: quarantine (qdrant_point_id_mismatch)
- 1d5eba7211dea6f9: full_projection (missing_point)
- 0ba2345cd9c542fa: full_projection (missing_point)
- 313d57f685058b60: full_projection (missing_point)
- c6e9ace45ef36e52: full_projection (missing_point)
- 891b73e8db9c3bb7: quarantine (qdrant_point_id_mismatch)
- 3edd306a02055c3a: full_projection (missing_point)
- a318d009a88a31fb: quarantine (qdrant_point_id_mismatch)
- aae4f83738c25068: full_projection (missing_point)
- c91eb4c9cb71b033: quarantine (qdrant_point_id_mismatch)
- ba2929dea127c94b: full_projection (missing_point)
- 17dc1fe9f5f8a021: full_projection (missing_point)
- cbd1423a7a39317f: full_projection (missing_point)
- bb446aa53705f58d: full_projection (missing_point)
- 6274b1cfbc90f2e1: quarantine (qdrant_point_id_mismatch)
- 69af5ffe1b3af354: quarantine (qdrant_point_id_mismatch)
- 64090fce409bb5c9: full_projection (missing_point)
- 3f73ebb0336ae4f3: full_projection (missing_point)
- bbbe630740c5d753: quarantine (qdrant_point_id_mismatch)
- 40ce2356b07edded: quarantine (qdrant_point_id_mismatch)
- 3d0da82598d9064a: quarantine (qdrant_point_id_mismatch)
- cdc6075da031b7ac: full_projection (missing_point)
- 482abc5766b6f8ed: quarantine (qdrant_point_id_mismatch)
- 32c7446a769f9c86: full_projection (missing_point)
- 368c71501e9385c5: full_projection (missing_point)
- 54fb19b574528f1a: full_projection (missing_point)
- 1703d9c005252a62: quarantine (qdrant_point_id_mismatch)
- 1dc5ac2b3cd9bfe8: full_projection (missing_point)
- 4d4c2e69d3f629ba: quarantine (qdrant_point_id_mismatch)
- 0bffe0382a0d44bb: full_projection (missing_point)
- 53f30b2bfd5e68b9: full_projection (missing_point)
- 0ee918abc8c53e8d: full_projection (missing_point)
- 3bf3bc0c64d433c0: quarantine (qdrant_point_id_mismatch)
- 8d44b9719637706f: quarantine (qdrant_point_id_mismatch)
- 748e8cfa0abd4e6a: quarantine (qdrant_point_id_mismatch)
- c6cd8b39d33db2aa: quarantine (qdrant_point_id_mismatch)

## Contradictions

- 271b5446f6a86a48: qdrant_point_id_mismatch
- 175066b8a4ceee3c: qdrant_point_id_mismatch
- 322b9cf893125f07: qdrant_point_id_mismatch
- d15cb3849bdef3b8: qdrant_point_id_mismatch
- 35afe6ea3fdb17b8: qdrant_point_id_mismatch
- 891b73e8db9c3bb7: qdrant_point_id_mismatch
- a318d009a88a31fb: qdrant_point_id_mismatch
- c91eb4c9cb71b033: qdrant_point_id_mismatch
- 6274b1cfbc90f2e1: qdrant_point_id_mismatch
- 69af5ffe1b3af354: qdrant_point_id_mismatch
- bbbe630740c5d753: qdrant_point_id_mismatch
- 40ce2356b07edded: qdrant_point_id_mismatch
- 3d0da82598d9064a: qdrant_point_id_mismatch
- 482abc5766b6f8ed: qdrant_point_id_mismatch
- 1703d9c005252a62: qdrant_point_id_mismatch
- 4d4c2e69d3f629ba: qdrant_point_id_mismatch
- 3bf3bc0c64d433c0: qdrant_point_id_mismatch
- 8d44b9719637706f: qdrant_point_id_mismatch
- 748e8cfa0abd4e6a: qdrant_point_id_mismatch
- c6cd8b39d33db2aa: qdrant_point_id_mismatch