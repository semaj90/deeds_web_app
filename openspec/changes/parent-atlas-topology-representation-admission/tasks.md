# Parent Atlas Topology Representation Admission — Tasks

## Current alignment checkpoint (2026-08-28)

- `semantic_768 -> exact retrieval -> ContextManifestV1` is
  `PROVEN_CANARY` on 15 exact lineage-qualified candidates and is independent
  of this topology change.
- Full source namespace reconciliation is still blocked: the current audit
  found zero exact manifest/projection matches. Do not use topology artifacts
  to repair source identity.
- `CandidateOrdinalMapV1` is proven only for the 15-row canary. Global 128/768
  scaling remains blocked on exact lineage and semantic projection parity.
- The higher-hop audit table error is fixed and live read-only coverage is
  partial: SOM 49/50, Qdrant 100/100 sampled, Valkey 50/50, Neo4j 17/50,
  glyph records 0/50.
- No topology representation, SOM, CouchDB, Qdrant fan-out, or GPU topology
  write is authorized by the canary receipt.

- [ ] TOPO-01 Freeze `RepresentationDerivationDagV1` with independent
  `rff_128`, `ae_latent_128`, and `ae_latent_64` branches.
- [ ] TOPO-02 Audit representation definitions against live artifacts and
  classify unbound vectors as diagnostic-only.
- [ ] TOPO-03 Implement/read-prove `RepresentationArtifactV1` digests and
  revision bindings.
- [ ] TOPO-04 Prove `ae_latent_64` numeric FP32 identity separately from its
  FP16/MsgPack transport encoding.
- [ ] TOPO-05 Bind `SOMAssignmentV1` to one input artifact and SOM model
  revision.
- [ ] TOPO-06 Separate `ManifoldPca4V1` from `Topology4DCoordinateV1`.
- [ ] TOPO-07 Require workspace/source/candidate/ordinal revision parity on
  topology rows.
- [ ] TOPO-08 Define `CanonicalEligibilityQueryV1` in PostgreSQL.
- [ ] TOPO-09 Compile `CandidateEligibilityBitmapV1` by CandidateOrdinal.
- [ ] TOPO-10 Prove PostgreSQL eligibility-to-bitmap exact parity.
- [ ] TOPO-11 Prove Qdrant filter-to-bitmap exact parity.
- [ ] TOPO-12 Prove cuVS filter-to-bitmap exact parity.
- [ ] TOPO-13 Admit only bounded topology fan-out with independent readback.
- [ ] TOPO-14 Benchmark PostgreSQL AIO/bitmap scans, mmap, and GPU execution
  only after correctness gates pass.

## Current gate state

- `semantic_768 -> exact retrieval -> ContextManifestV1`: proven independently.
- `rff_128`: optional challenger, producer not yet proven.
- `ae_latent_128`: reserved/future.
- `ae_latent_64`: representation contract corrected; live artifact admission
  remains open.
- SOM/4D/fan-out: downstream and non-blocking for Workstation V1.

## Ordered next steps

1. Complete `LINEAGE-01` source namespace/content-hash reconciliation.
2. Produce a 128-row exact `CandidateOrdinalMapV1` before any topology tensor.
3. Freeze `RepresentationArtifactV1` for one real input representation.
4. Prove PostgreSQL eligibility → CandidateOrdinal bitmap parity.
5. Prove Qdrant and cuVS filter parity against that bitmap.
6. Only then run bounded topology fan-out and independent readback.

Failure of any topology gate leaves the proven semantic retrieval canary
unchanged and reports topology as unavailable or challenger-only.
