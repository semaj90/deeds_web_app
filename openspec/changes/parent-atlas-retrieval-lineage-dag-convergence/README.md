# Parent Atlas Retrieval Lineage and DAG Convergence

This change decomposes the remaining retrieval and OaK runtime work into
dependency-ordered, evidence-backed gates. It preserves `semantic_768` as the
canonical dense representation, keeps learned autoencoder outputs separate from
EmbeddingGemma native MRL outputs, and does not authorize production mutation.

Status: PROPOSED / READ-ONLY FIRST

This is a new coordination change. It does not replace the existing semantic
768 contract, graph-runtime, neural-prefill, or ontology-kernel changes.
