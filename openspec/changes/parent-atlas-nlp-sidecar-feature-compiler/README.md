# parent-atlas-nlp-sidecar-feature-compiler

Multi-pass structural/NLP/sequence feature compiler in the miniforge-nlp-sidecar Docker container: AnalysisPassResult envelope, treesitter-chunker structural pass, spaCy linguistic pass, AST-conditioned semantic cards, HMM route-state inference, MiniLM/Mixedbread reranker tiers, NetworkX/cuGraph parity, control5 feature families. Non-generative (no LLM in the hot path except optional gated LangExtract).
