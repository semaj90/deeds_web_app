# Deeds Architectural Principles

## 🕊️ Mission Statement
Deeds is a **Local-First, Privacy-First** research and synthesis engine designed for deep codebase intelligence and autonomous legal research. We prioritize high-fidelity reasoning on consumer-grade hardware without leaking sensitive data to commercial APIs.

## 🏛️ The 4-Lane Synthesis Architecture
Our orchestration follows a multi-lane retrieval and synthesis strategy (TRACE: Triage, Retrieve, Align, Compose, Encode):

### Lane 1: Identity-Spine Retrieval (KB Server)
*   **Purpose**: Fast, stable retrieval of notecards and codebase facts.
*   **Strategy**: Hybrid Dense + Sparse Fusion. Combines N8 Lexical search (BM25-style) with Qdrant 768d dense embeddings.
*   **Tooling**: `kb.search_cards`, `kb.hybrid_search`.

### Lane 2: GEMMA4 Offload (Diagnostic & Reasoning)
*   **Purpose**: Cheap local reasoning, classification, and intent inference.
*   **Strategy**: Uses lightweight models (`gemma3:270m`, `gemma4-rotorquant:latest-fast`) to perform "Phase D" diagnostic hooks, keeping the primary LLM context clean and token-efficient.
*   **Tooling**: `gemma4-offload` MCP server.

### Lane 3: Deep Research (Hypergraph & Web)
*   **Purpose**: External knowledge grounding and cross-repo synthesis.
*   **Strategy**: Recursive agentic research using Google Search (via SearXNG) and Hypergraph exploration.
*   **Tooling**: `trace.graphrag_search`, `trace.deep_research`.

### Lane 4: Synthesis & Memory (Cognitive Loop)
*   **Purpose**: Final brief composition and long-term memory encoding.
*   **Strategy**: Autonomous mission auditing and "Topological Knowledge Atlas" updates.
*   **Tooling**: `synth:loop`, `admin_ai_skills`.

## 🧠 Core Principles

### 1. Privacy is Non-Negotiable
All Knowledge Augmented Generation (KAG) stays within the local environment. We use local Ollama, Qdrant, and Postgres (with PGVector) to ensure zero data exfiltration for primary research tasks.

### 2. Topological Grounding
We don't just "store text." We map code and facts into a **4D Topological Manifold**. This allows the agent to understand not just "what" a file is, but its neighborhood, its authority (PageRank), and its role in the system architecture.

### 3. Agentic Autonomy with Auditability
Subagents are granted high autonomy to plan and execute research, but every reasoning step, tool call, and state transition is persisted in `admin_ai_subagent_runs` for transparent auditing.

### 4. Efficient Inference for Limited Hardware
We leverage specialized techniques to run powerful agents on local GPUs:
*   **Disaggregated Prefill-Decode**: Preventing pipeline bubbles during long-context synthesis.
*   **Locality-Sensitive Caching**: Reusing KV caches for frequently searched codebase segments.
*   **Sparse MoE Awareness**: Optimizing routing for experts in legal and code domains.

## 🤝 Handoff Protocol
Deeds acts as the "Intelligence Layer" for developers and researchers. The output is a high-fidelity **Implementation Brief**, ready for handoff to execution-focused agents like Claude Code or local compilers.
