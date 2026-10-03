# Semantic / projection lane

Question: do embeddings, Qdrant and retrieval evidence match the representation revision?

Status: not automated. Report NOT_EXERCISED unless a run actually compared projections; never PROVEN by default.

Rules:
- Canonical semantic_768 is `codebase_chunk_index.content_embedding`. `atlas_packets.embedding` is legacy and non-canonical. `content_embedding_768` is diagnostic only.
- A stored vector is not a qualified representation. It needs `SemanticRepresentationV1Schema` provenance (representation/model/tokenizer revision, input digest, vector checksum). Do not create a second provenance schema.
- Identical-vector detector: group by `md5(vector::text)`; a group above 1% of embedded rows is a placeholder (Phase 106 embedded empty text). Mask such rows as unavailable. Absent is not zero.
- Qdrant/Redis/graph agreement is a mirror check, never authority. Point ids and locators are not identity.
- Feature gain is unproven without frozen human-graded labels (Recall@K, MRR, nDCG@K vs baseline). Feature derivation correctness is a separate claim from retrieval lift.
