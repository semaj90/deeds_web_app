## ADDED Requirements

### Requirement: HelperCardV1 registry contract
The system SHALL define a `HelperCardV1` Zod contract carrying `helperId` (string), `capabilities`
(string, free-text description used for embedding), `supportedTaskFamilies` (string array),
`invocationCostClass` (enum `CHEAP` | `MEDIUM` | `EXPENSIVE`), `evidenceRequirements` (string array),
`semantic768Ref` (string, pointer to a precomputed EmbeddingGemma vector — never an inline vector),
and `revision` (string), enforced via `.strict()`.

#### Scenario: Valid helper card passes validation
- **WHEN** a helper card object supplies all required fields within their declared types
- **THEN** `HelperCardV1Schema.parse(...)` succeeds

#### Scenario: Helper card never embeds a raw vector inline
- **WHEN** a helper card object includes a `semantic768` field containing a raw 768-element array instead of `semantic768Ref`
- **THEN** `HelperCardV1Schema.parse(...)` throws a Zod validation error, because the schema is `.strict()` and does not declare that field

### Requirement: Helper routing never introduces a second embedding model
The system SHALL route queries to `HelperCardV1` entries using only EmbeddingGemma-produced vectors
(via its existing task-conditioned prompt modes), computed once per card at registration time and
cached by `semantic768Ref`. No new embedding model SHALL be introduced for helper routing.

#### Scenario: Helper card similarity uses EmbeddingGemma
- **WHEN** a query is routed to candidate helper cards
- **THEN** the similarity computation uses the same EmbeddingGemma model and dimension (768d) as this repo's canonical `semantic_768` retrieval lane, not a separately trained or loaded model

### Requirement: Helper routing precedes any LLM invocation
The system SHALL perform helper-card routing (a cheap embedding-similarity lookup) before invoking
any generative LLM (Ornith or otherwise) for a given query, so the router can determine which
non-LLM capability, if any, can satisfy the query without a synthesis call.

#### Scenario: A query resolvable by an existing helper skips LLM invocation
- **WHEN** a query's top-ranked helper card exceeds a documented confidence threshold and that helper alone can answer the query
- **THEN** the system dispatches to that helper directly, without a preceding or concurrent LLM call solely for the purpose of deciding whether to do so
