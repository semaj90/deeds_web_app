# Agentic Workflow Blueprint: test1

This blueprint details a comprehensive, offline, multi-pass agentic workflow designed to process complex user requests into actionable, validated code patches. It operates under a strict sequence of discovery, refinement, and validation to minimize context pollution and ensure source-of-truth grounding.

## Workflow Goal
To transform a high-level, vague user intent into a concrete, validated patch plan ready for deployment, all while respecting local codebase context and failing gracefully if live external documentation is unavailable.

## Operational Phases
### 1. Offline Multi-Pass Loop Execution
This sequence must run sequentially, treating the output of each pass as the primary input for the next.

**Pass 1: `1_prompt_decompose`**
*   **Goal:** Decompose the user's raw request into its core components.
*   **Action:** Analyze the prompt for intent, entities, task type, and constraints.
*   **Output:** A JSON object containing: `intent`, `topic_tags`, `required_capabilities`, and `unknowns`.

**Pass 2: `2_local_topic_lookup`**
*   **Goal:** Determine if the decomposed intent already exists in the local knowledge base.
*   **Search:** Query local knowledge stores (cards, sourceRefs, embeddings) for matches against: `topics`, `cards`, `source_refs`, `prior_agent_runs`, and `embeddings`.
*   **Output:** A JSON object detailing: `existing_topic_match`, `duplicate_risk`, and `reusable_examples`.

**Pass 3: `3_intent_rebuild`**
*   **Goal:** Refine the vague prompt into a precise, machine-readable internal task prompt.
*   **Example:** User: "code this" $\to$ Rebuilt: "Create or update a SvelteKit canvas prototype using existing NES/platformer cards."
*   **Output:** `normalized_task_prompt`.

**Pass 4: `4_context_reduce`**
*   **Goal:** Condense all retrieved context (cards/files) into the smallest possible, actionable packet for the generation phase.
*   **Output:** `ace_context_packet` (a highly compressed context payload) and a `patch_card_seed`.

**Pass 5: `5_codebase_validate`**
*   **Goal:** Validate the derived patch targets against the actual repository structure *before* generating code.
*   **Checks:** Validate against: `package.json` scripts, existing routes, critical imports, component patterns, and test setup.
*   **Output:** `valid_patch_targets`, `risks` (e.g., dependency cycles), and `missing_files`.

**Pass 6: `6_generate_patch`**
*   **Goal:** Produce the actual code changes or detailed instructions.
*   **Output:** `patch_card` (the proposed changes) and `file_changes` (a map of path $\to$ line-level edits) and `tests_to_run`.

**Pass 7: `7_test_validate`**
*   **Goal:** Run automated smoke tests against the proposed patch.
*   **Validations:** Execute `npm run check`, `npm run test`, `npm run lint`, route smoke tests, and import resolution checks.
*   **Output:** `pass_fail` status, `errors`, and a `retry_plan` if failures occur.

**Pass 8: `8_memory_writeback`**
*   **Goal:** Persist the entire successful cycle for future learning.
*   **Output:** `new_cards`, `new_relations`, `updated_topic`, and `example_training_record`.

## Web Search Replacement Contract
When the system cannot access live documentation (e.g., external web search):
Use the following placeholder contract structure to guide the agent, indicating that local context is the primary source of truth.

```json
{
  "tool": "web_search",
  "mode": "offline_stub",
  "query": "SvelteKit canvas game route examples",
  "replacement": "local_docs_search",
  "sources": [
    "docs/",
    "README.md",
    "package.json",
    "existing source_refs",
    "atlas_cards",
    "library_cards"
  ],
  "status": "deferred_until_online"
}
```
This structure forces the agent to acknowledge the missing external context and prioritize internal, local knowledge retrieval.