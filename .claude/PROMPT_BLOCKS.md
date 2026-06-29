# PROMPT_BLOCKS.md

## Prompt Assembly Order
1. SYSTEM_RULES
2. FORBIDDEN_RULES
3. CURRENT_TASK
4. MEMORY_RULES
5. Top 5 semantic aliases
6. Top 3 graph neighbors
7. Top 2 telemetry/error aliases
8. Safe next command

MAX_PROMPT_BLOCKS = 12

## Alias Expansion
Prompt contains aliases + summaries.
Tools expand aliases into files.
Only patches use raw files.

Examples:
- @dir:rag_retrieval
- @feature:qdrant_vector_index
- @error:G20_cyclic
