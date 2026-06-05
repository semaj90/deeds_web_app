# Karpathy Research Notes on GPT Optimization & Code Processing
> **Focus**: Tokenization boundaries, raw byte pair encoding (BPE), and nanoGPT architectures.

## 1. Tokenization Boundaries and GPT Code Understanding
Standard LLM tokenizers (like GPT-4's cl100k_base or Llama's tiktoken configurations) split mathematical symbols, variable names, and code structural indentation (`    ` or `\t`) into highly fragmented sub-token patterns.
This dramatically increases context window usage and decreases model reasoning effectiveness over deep codebase topologies.

*   **Key Lesson**: When chunking code for semantic indexers, preserve logical AST boundaries (e.g. classes, functions, variable declarations) rather than using simple character offsets.
*   **BPE Optimization**: Fine-tuning or injecting custom vocabulary tokens for common syntax strings (e.g. `const `, `import {`, `async () =>`) reduces average token lengths by up to 35% in dense javascript repos.

## 2. nanoGPT Architectural Insights for Local Workstations
To achieve ultra-low tail latency (p99 < 50ms) on standard developer workstations (e.g. 8GB RTX 3060 Ti):
1.  **Rotary Embeddings (RoPE)**: Replace static absolute positional encodings to allow for dynamic context length interpolation.
2.  **FlashAttention-2**: Standardize on scaled dot-product attention fused kernels, bypassing manual attention matrix allocations and avoiding memory-bound operations.
3.  **Speculative Decoding**: Run a lightweight 1.5B parameter helper model alongside the canonical 8B parameter model to speculative-generate candidate token completions, validating them in parallel on the GPU.

## 3. High-Fidelity Context Ingestion (RAG)
Simple semantic cosine similarity matches often miss deep structural relationships. Standard multi-hop retrieval must couple:
*   **Lexical Anchor matching** (exact file names and functions)
*   **Dense vector embeddings** (high-level structural goals)
*   **Graph topological distance** (import matrices and class inheritance structures)
*   **PageRank centrality** (identifying master entry points)
