# parent-atlas-nlp-sidecar-feature-compiler

Multi-pass structural/NLP/sequence feature compiler in the `miniforge-nlp-sidecar` Docker container: `AnalysisPassResult` envelope, `treesitter-chunker` structural pass, spaCy linguistic pass, AST-conditioned semantic cards, HMM route-state inference, MiniLM/MixedBread reranker tiers, NetworkX/cuGraph parity, `control5` feature families.

Implementation note: the TypeScript side already defines the core contracts in `sveltekit-frontend/src/lib/server/analysis/nlp-feature-compiler.ts` (`AnalysisPassResult`, `AstUnit`, `SemanticCodeCard`, `ExperimentFeatureMatrix`, `Control5`). This change now focuses on wiring the sidecar, ACP surface, and downstream consumers to those existing contracts instead of inventing new shapes.

Runtime note: the checked-in container is Docker-hosted Python 3.13 slim with pip-installed NLP packages. `miniforge`/Conda is a historical service name here, not the current runtime owner, and `torch` is not part of the checked-in image unless a future GPU-sidecar change adds it explicitly. Non-generative path stays default; LangExtract remains opt-in/gated.
