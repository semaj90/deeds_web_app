# Skill: Atlas Contract Discovery & Agentic Loop Step 1

## Purpose

Use this skill when implementing or validating an Atlas retrieval contract, agentic search loop, telemetry traversal, or production endpoint.

The goal is to **discover existing contracts before editing**, prevent invented service names, and create a safe first implementation step.

---

## Trigger Conditions

Use this skill when the task mentions:

* Atlas retrieval
* HyperRAG
* Tricubic Search
* agentic error fixing
* provenance
* telemetry
* graph traversal
* embeddings
* vector search
* indexed cache
* validated service layer
* API contract
* endpoint integration
* AGENTS.md or LLMS.md update

---

## Rule 0: Do Not Guess

Before writing code:

1. Search the repo.
2. Identify existing service names.
3. Identify existing auth/session patterns.
4. Identify existing schema style.
5. Identify existing test style.
6. Only then patch.

Never invent a service name if one already exists.

---

## Step 1: Discovery Pass

Run:

```bash
rg -n "Atlas|atlas|HyperRAG|hyperrag|retrieval|retrieve|semantic|vector|embedding|pgvector|qdrant|cache|redis|valkey|provenance|sourceRef|source_ref" src packages scripts tests docs AGENTS.md LLMS.md
```

Then:

```bash
rg -n "export const POST|export const GET|json\\(|locals\\.user|locals\\.session|auth|redirect|error\\(" src/routes/api src/lib/server
```

Then:

```bash
rg -n "service|Service|search|Search|query|Query|validated|validation|replay|provenance" src/lib/server packages/atlas scripts/atlas
```

Then:

```bash
rg -n "z\\.object|type .*Request|interface .*Request|type .*Response|interface .*Response|zod|superstruct|valibot" src packages tests
```

Then:

```bash
rg -n "describe\\(|it\\(|test\\(|expect\\(|vitest|playwright|supertest|fetch\\(" tests src packages
```

---

## Step 2: Structural Search

Use `ast-grep`:

```bash
ast-grep --pattern 'export const POST = $$$' src/routes
ast-grep --pattern 'export const GET = $$$' src/routes
ast-grep --pattern 'export async function $NAME($$$) { $$$ }' src/lib/server packages
ast-grep --pattern 'fetch($URL, $$$)' src
ast-grep --pattern 'z.object({ $$$ })' src packages tests
```

---

## Step 3: Summarize Evidence

Before editing, produce:

```text
Existing validated retrieval entrypoint:
- file:line

Existing auth/session route pattern:
- file:line

Existing schema style:
- file:line

Existing integration test style:
- file:line

Safe files to add or update:
- ...
```

If any of these are missing, say so clearly.

---

## Step 4: Contract Definition

Create or update:

```text
src/lib/server/atlas/atlas-search-contract.ts
```

Required request shape:

```ts
export type AtlasSearchRequest = {
  query: string;
  intent:
    | "fix_error"
    | "diagnose"
    | "find_todo"
    | "trace_telemetry"
    | "retrieve_memory"
    | "hybrid_search";
  mode: "semantic" | "graph" | "telemetry" | "tricubic";
  scope?: string[];
  signals?: string[];
  topK?: number;
  traversalDepth?: number;
  filters?: {
    caseId?: string;
    sourceType?: string;
    tags?: string[];
  };
};
```

Required result shape:

```ts
export type AtlasSearchResult = {
  id: string;
  title: string;
  snippet: string;
  sourceRef: string;
  score: number;
  scores: {
    vector: number;
    graph: number;
    telemetry: number;
    recency: number;
    validation: number;
  };
  rankReason: string;
  traversalPath: string[];
  telemetrySignals: string[];
  provenance: Record<string, unknown>;
};
```

Required response shape:

```ts
export type AtlasSearchResponse = {
  query: string;
  intent: AtlasSearchRequest["intent"];
  mode: AtlasSearchRequest["mode"];
  results: AtlasSearchResult[];
  meta: {
    topK: number;
    traversalDepth: number;
    elapsedMs: number;
    service: "validated-atlas";
  };
};
```

---

## Step 5: Service Wrapper

Create or update:

```text
src/lib/server/atlas/atlas-search-service.ts
```

Rules:

* Call the validated Atlas retrieval layer.
* Do not query raw DB tables from the route.
* Normalize scores.
* Attach provenance.
* Attach rank reason.
* Clamp `topK`.
* Clamp `traversalDepth`.

Scoring formula:

```text
final_score =
  0.35 * vector
+ 0.25 * graph
+ 0.20 * telemetry
+ 0.10 * recency
+ 0.10 * validation
```

---

## Step 6: API Endpoint

Create or update:

```text
src/routes/api/atlas/search/+server.ts
```

Rules:

* Use `POST`.
* Enforce auth/session.
* Validate request body.
* Call service wrapper.
* Return JSON response.
* Do not bypass validated service layer.
* Do not perform raw SQL here.

---

## Step 7: Client Wrapper

Create:

```text
src/lib/client/atlas-search.ts
```

Expose:

```ts
export async function searchAtlas(request: AtlasSearchRequest): Promise<AtlasSearchResponse>
```

Rules:

* POST to `/api/atlas/search`.
* Handle non-2xx responses.
* Return typed response.

---

## Step 8: Integration Test

Create:

```text
tests/integration/atlas-search.integration.test.ts
```

Test workflow:

```text
user query
→ API endpoint
→ service wrapper
→ validated Atlas service
→ ranked results
→ provenance assertion
```

Assertions:

* response has results array
* every result has `sourceRef`
* every result has `score`
* every result has `provenance`
* meta.service equals `"validated-atlas"`

---

## Step 9: Documentation Update

Update:

```text
AGENTS.md
LLMS.md
packages/atlas/LLMS.md if present
```

Add production rule:

```text
Agents must use /api/atlas/search or the Atlas search service wrapper for retrieval.
Do not call raw vector, Redis, Qdrant, or SQL retrieval paths directly unless explicitly working on the retrieval internals.
Every agent-facing retrieval result must include provenance.
```

---

## Step 10: Validation Commands

Run available commands in this order:

```bash
npm run check
npm run test
```

If those do not exist, discover commands:

```bash
cat package.json
rg -n "\"check\"|\"test\"|\"vitest\"|\"playwright\"|\"svelte-check\"" package.json packages/*/package.json
```

---

## Completion Criteria

This skill is complete when:

* Contract exists.
* API endpoint exists.
* Service wrapper exists.
* Client wrapper exists.
* Integration test exists.
* Docs updated.
* Validation commands executed or missing commands reported.
* No raw DB bypass in the API route.
* All results include provenance.

---

## Failure Conditions

Stop and report if:

* No validated Atlas service layer can be found.
* Auth/session pattern is unclear.
* Test framework cannot be identified.
* Existing route conventions conflict with the proposed endpoint.
* Provenance cannot be attached.

Do not silently invent missing infrastructure.
