# Skill: Atlas Tricubic Search + Agentic Retrieval Contract

## Purpose

Implement Atlas retrieval safely and incrementally.

This skill defines:

1. Discovery-first development.
2. Validated Atlas retrieval contract.
3. Tricubic Search scoring.
4. Graph + telemetry traversal.
5. LangExtract enrichment.
6. Gemma4 summarization.
7. Feature labeling.
8. Provenance enforcement.
9. Integration tests.
10. Agentic error-fixing loops.

---

# Rule 0

**Never invent service names.**

Before writing code:

* Search repo.
* Find existing retrieval service.
* Find auth/session pattern.
* Find schema style.
* Find test style.
* Then patch.

---

# Step 1: Discovery Pass

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

# Structural Search

Use ast-grep:

```bash
ast-grep --pattern 'export const POST = $$$' src/routes

ast-grep --pattern 'export const GET = $$$' src/routes

ast-grep --pattern 'export async function $NAME($$$) { $$$ }' src/lib/server packages

ast-grep --pattern 'fetch($URL, $$$)' src

ast-grep --pattern 'z.object({ $$$ })' src packages tests
```

---

# AWK Summaries

```bash
rg -n "retrieval|vector|embedding|qdrant|redis|valkey|cache|provenance" src packages scripts tests \
| awk -F: '{count[$1]++} END {for (f in count) print count[f], f}' \
| sort -nr \
| head -40
```

---

# Discovery Report

Before editing:

```text
Validated retrieval entrypoint:
file:line

Auth/session route:
file:line

Schema style:
file:line

Integration tests:
file:line

Safe files:
- ...
```

---

# Step 2: Atlas Contract

Create:

```text
src/lib/server/atlas/atlas-search-contract.ts
```

Request:

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

mode:

| "semantic"
| "graph"
| "telemetry"
| "tricubic";

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

---

# Step 3: Tricubic Search

Three search dimensions:

```text
semantic axis

↓

embeddings
cosine similarity

graph axis

↓

topology
pagerank
multi-hop

runtime axis

↓

telemetry
errors
commands
cache hits
```

Intersection:

```text
tricubic_search

=

semantic_top_k

∩

graph_neighbors

∩

telemetry_matches
```

---

# Scoring

```text
final_score =

0.35 * vector

+

0.25 * graph

+

0.20 * telemetry

+

0.10 * recency

+

0.10 * validation
```

---

# Step 4: Search Result

```ts
export type AtlasFeatureLabel = {

label: string;

confidence: number;

source:

| "langextract"

| "gemma4"

| "heuristic"

| "existing";

};
```

---

```ts
export type AtlasExtraction = {

entities:

Array<{

text: string;

type: string;

confidence?: number;

}>;

relations:

Array<{

source: string;

predicate: string;

target: string;

confidence?: number;

}>;

schema?:

Record<string, unknown>;

};
```

---

```ts
export type AtlasSummary = {

text: string;

model:

| "gemma4-legal"

| "gemma4"

| "fallback";

tokens?: number;

provenance:

Record<string, unknown>;

};
```

---

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

featureLabels:

AtlasFeatureLabel[];

extraction?:

AtlasExtraction;

summary?:

AtlasSummary;

provenance:

Record<string, unknown>;

};
```

---

# Step 5: Service Wrapper

Create:

```text
src/lib/server/atlas/atlas-search-service.ts
```

Rules:

* Call validated Atlas retrieval only.
* Never raw SQL from route.
* Normalize scores.
* Attach provenance.
* Attach rank reason.
* Clamp topK.
* Clamp traversalDepth.

---

# Step 6: LangExtract Pass

Create:

```text
src/lib/server/atlas/atlas-langextract-service.ts
```

Extract:

* entities
* relations
* schema

Attach:

```text
extractor
sourceRef
timestamp
schemaVersion
```

Rules:

* structured JSON only
* preserve original text
* enrichment only

---

# Step 7: Feature Labeling

Create:

```text
src/lib/server/atlas/atlas-feature-label-service.ts
```

Inputs:

* title
* snippet
* extraction
* telemetry
* traversal
* sourceRef

Outputs:

```text
AtlasFeatureLabel[]
```

Example:

```text
retrieval_contract

auth_boundary

telemetry_signal

cache_hit_path

graph_traversal

gemma4_summary

langextract_entity_pass

error_fix_candidate

todo_candidate
```

---

# Step 8: Gemma4 Summary Pass

Create:

```text
src/lib/server/atlas/atlas-gemma4-summary-service.ts
```

Rules:

* summarize 1-3 sentences
* explain relevance
* grounded only
* preserve provenance

Attach:

```text
model

promptVersion

sourceRef

timestamp
```

Never:

* change score
* change provenance
* hallucinate facts

---

# Pipeline

```text
validated retrieval

↓

score normalization

↓

telemetry

↓

graph traversal

↓

LangExtract

↓

feature labeling

↓

Gemma4 summary

↓

provenance finalize

↓

API response
```

---

# Step 9: API Endpoint

Create:

```text
src/routes/api/atlas/search/+server.ts
```

Correct SvelteKit:

```ts
import {

json,

error

}

from

"@sveltejs/kit";

import type {

RequestHandler

}

from

"./$types";

export const POST:

RequestHandler

=

async ({

request,

locals

}) => {

if (

!locals.user

&&

!locals.session

) {

throw error(

401,

"Authentication required"

);

}

const body

=

await request.json();

return json(

response

);

};
```

Rules:

* auth required
* validate schema
* call service wrapper
* no raw SQL
* no extraction in route

---

# Step 10: Integration Test

Create:

```text
tests/integration/atlas-search.integration.test.ts
```

Workflow:

```text
user query

↓

api endpoint

↓

service wrapper

↓

validated retrieval

↓

LangExtract

↓

feature labels

↓

Gemma4

↓

response
```

Assertions:

```ts
expect(

result.sourceRef

).toBeDefined();

expect(

result.score

).toBeDefined();

expect(

result.provenance

).toBeDefined();

expect(

result.featureLabels

).toBeDefined();
```

Optional:

```ts
expect(

result.extraction?.entities

??

[]

)

.toBeInstanceOf(

Array

);

expect(

result.summary?.text

??

""

)

.toBeTypeOf(

"string"

);
```

---

# Agentic Error-Fixing Loop

```text
agent request

↓

intent packet

↓

validated retrieval

↓

telemetry search

↓

graph traversal

↓

error clusters

↓

LangExtract

↓

Gemma4 explanation

↓

recommended fix

↓

test

↓

replay

↓

provenance report
```

---

# Completion Criteria

Complete when:

* contract exists
* service wrapper exists
* API endpoint exists
* client wrapper exists
* LangExtract exists
* Gemma4 exists
* feature labels exist
* provenance exists
* integration tests pass
* AGENTS.md updated
* LLMS.md updated

---

# Failure Conditions

Stop if:

* validated Atlas retrieval missing
* auth/session unknown
* test framework unknown
* provenance unavailable
* route conventions conflict

Never silently invent infrastructure.
## Failure Handling Rules (Canonical)

### Storage Failures

If a write operation returns:

* `EEXIST`
* `too_big`
* `json.exception.parse_error`
* `Could not find oldString`
* MCP tool schema validation failure

then:

1. STOP retrying the identical operation.
2. DO NOT claim success.
3. DO NOT claim Redis caching succeeded unless verified.
4. Emit a failure output contract.
5. Switch strategy.

### Strategy Escalation

Attempt order:

1. `anchor_insert`
2. `append_eof`
3. `patch_file`
4. `full_rewrite`

Never:

* retry the same giant `oldString`
* retry the same payload after `parse_error`
* rewrite AGENTS.md wholesale
* rewrite LLMS.md wholesale

### Large Documentation Files

Files:

* AGENTS.md
* LLMS.md
* SUB-MASTER-FEATURE-TODO-*
* architecture docs

Rules:

* Search headings first.
* Insert after heading.
* Append EOF if heading missing.
* Generate `.patch` file for large changes.
* Maximum edit payload should stay small and focused.

### Redis Claims

Forbidden:

* "Successfully cached in Redis"
* "Knowledge is now stored"
* "Task Complete"

unless verified by:

```bash
redis-cli EXISTS <key>
redis-cli GET <key>
```

If verification is unavailable:

```text
Redis cache status: UNKNOWN
```

### MCP / Parent Atlas

Never fabricate:

* replay proof
* provenance
* qdrant hits
* graph traversals
* MCP tool responses
* ranking reports

Missing data must be reported as:

```text
degraded_mode=true
```

### JSON Parse Failures

If:

```text
json.exception.parse_error.101
```

then:

* reduce payload size
* remove giant markdown blocks
* remove multiline TS/JSON from tool args
* write temp `.patch`
* apply patch separately

Never retry the same payload.

### Output Contract

likely_cause: <one sentence>

evidence:
<file:line | tool error | redis key>

patch_targets: <exact file paths>

edit_strategy:
<anchor_insert | append_eof | patch_file | full_rewrite>

safe_next_command: <single command>

fallback_if_edit_fails: <next strategy>

degraded_mode:
<true|false>

verified:
<true|false>

do_not_do: <actions that make it worse>
