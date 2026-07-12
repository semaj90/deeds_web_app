# Learning Circuit: Three-Layer Gemma4 + LangGraph Orchestration

**Date:** July 11, 2026  
**Status:** ✅ Specification Complete, Ready for Implementation  
**Architecture:** LangGraph Control Plane + Three Specialized Gemma4 Workers + Outcome Learning Loop

---

## Overview

The Learning Circuit implements a durable, observable error-fixing workflow by combining:

1. **LangGraph State Machine** (Control Plane) — 10-state workflow with explicit transitions, durability, and interrupt support
2. **Three Specialized Gemma4 Workers** (Docker) — each with a distinct role and trained behavior
3. **Outcome Recording Loop** — captures execution results, updates success priors, enables continuous improvement

The system avoids:
- ❌ GitHub as the reasoning/memory layer (only delivery boundary)
- ❌ Unfounded ML/PPO training (learn from outcomes first)
- ❌ LangChain general chains (use specialized tools only)
- ❌ Firecrawl/web scraping (rely on local evidence first)

The system enables:
- ✅ Deterministic feedback loops (observe → classify → rank → execute → test → learn)
- ✅ Per-agent success metrics (which tools/approaches work best?)
- ✅ Durable workflow state (resume interrupted runs, time travel for debugging)
- ✅ Clear evidence trails (why was recommendation X selected?)

---

## Architecture: Three Layers of Gemma4

### Layer 1: Observation/Classification Engine (Port 8091)

**Role:** Parse raw error, extract intent, classify error type  
**Specialized Behavior:** Fast, low-latency classification with high confidence  
**Input:** TypeScript error message, target file names  
**Output:**
```json
{
  "errorType": "syntax | type | logic | runtime | test-failure",
  "intent": "fix-compilation | add-feature | refactor | debug",
  "confidence": 0.0-1.0,
  "targetSymbols": ["functionName", "className"],
  "suggestedApproaches": ["ast-walk", "schema-validation", "test-rerun"]
}
```

**Docker Service:**
```yaml
gemma4-observation:
  image: ollama/ollama:latest
  container_name: legal-ai-gemma4-observation
  environment:
    - OLLAMA_HOST=0.0.0.0:8091
  ports: ["8091:8091"]
  volumes: [gemma4_observation_cache:/root/.ollama]
```

**System Prompt:** "You are an error classifier. Analyze code errors and extract structured metadata. Respond only with JSON, no markdown."

---

### Layer 2: Evidence Research Worker (Port 8194 — remapped from 8092)

**Role:** Deep research on symbols, schemas, tests, graphs  
**Specialized Behavior:** Thorough investigation with confidence scoring  
**Input:** Classified error, target files  
**Output:** Array of evidence records
```json
[
  {
    "sourceRef": "src/lib/auth.ts",
    "symbols": [
      {
        "name": "getUserSession",
        "kind": "function",
        "astIdentity": "auth.getUserSession",
        "lineNumber": 42
      }
    ],
    "schemaEvidence": [
      {
        "schemaName": "SessionSchema",
        "validator": "zod",
        "valid": true
      }
    ],
    "retrievalScores": {
      "lexicalRank": 1,
      "bm25Score": 0.92,
      "denseRank": 2,
      "denseScore": 0.87,
      "astScore": 0.95
    }
  }
]
```

**Docker Service:**
```yaml
gemma4-evidence-research:
  image: ollama/ollama:latest
  container_name: legal-ai-gemma4-evidence-research
  environment:
    - OLLAMA_HOST=0.0.0.0:8194
  ports: ["8194:8194"]
  volumes: [gemma4_evidence_cache:/root/.ollama]
  resources:
    limits: {memory: 6G, cpus: '3.0'}
```

**System Prompt:** "You are a code investigation assistant. Gather structural evidence: symbols, schemas, tests, graphs. Respond with JSON arrays."

---

### Layer 3: Recommendation/Execution Engine (Port 8093)

**Role:** Score candidates via RRF, generate Kanban card, plan tests  
**Specialized Behavior:** High-confidence recommendations with rationale  
**Input:** Evidence bundle, candidate packet keys  
**Output:** Array of recommendations
```json
[
  {
    "packetKey": "packet:auth:001",
    "sourceRef": "src/lib/auth.ts",
    "approach": "ast-guided | schema-validation | test-driven | graph-expansion",
    "confidence": 0.89,
    "suggestedFiles": ["src/lib/auth.ts", "tests/auth.spec.ts"],
    "suggestedEdits": ["Add null check before property access"],
    "testPlan": ["npm run test --testNamePattern='getUserSession'"],
    "rationale": "AST analysis shows missing null guard; schema validation confirms type mismatch",
    "evidenceWeight": {
      "symbolMatch": 0.95,
      "schemaAlignment": 0.88,
      "retrievalScore": 0.87,
      "regressionRisk": 0.05
    }
  }
]
```

**Docker Service:**
```yaml
gemma4-recommendation:
  image: ollama/ollama:latest
  container_name: legal-ai-gemma4-recommendation
  environment:
    - OLLAMA_HOST=0.0.0.0:8093
  ports: ["8093:8093"]
  volumes: [gemma4_recommendation_cache:/root/.ollama]
```

**System Prompt:** "You are a recommendation engine. Generate structured fix recommendations based on evidence. Respond with JSON array."

---

## LangGraph State Machine: 10-State Workflow

```
START
  ↓
[OBSERVE] Parse error, initialize state
  ↓
[CLASSIFY] Layer 1 → classified error type + intent
  ↓
[RETRIEVE] Fetch candidates from local sources (go-retrieval, AST, packet registry, graph)
  ↓
[VALIDATE_EVIDENCE] Layer 2 → evidence bundle
  ↓
[RECOMMEND] Layer 3 → recommendations + RRF scoring
  ↓
[AUTHORIZE] Permission gate (read-only → dry-run → approved → blocked)
  ├─ read-only → complete with no-op
  ├─ dry-run → execute with capture-only
  ├─ approved → execute with side effects
  └─ blocked → end with error
  ↓
[EXECUTE] Run suggested edits (dry-run or live)
  ↓
[TEST] Run test suite, capture results
  ├─ all pass → COMPLETE
  └─ any fail → DIAGNOSE
  ↓
[DIAGNOSE] Analyze failures, decide retry or block
  ├─ retry_count < max_retries → RETRIEVE (loop back)
  └─ retry_count ≥ max_retries → COMPLETE (with failure marker)
  ↓
[COMPLETE] Record outcome, update success priors
  ↓
END
```

**Transition Logic:**
- Nodes connected by explicit `addEdge()` calls (deterministic)
- Conditional edges via `addConditionalEdges()` (test pass/fail, retry decision)
- No "freely chosen" LLM transitions (model output feeds into deterministic gate logic)

---

## State Contract

```typescript
interface ErrorFixingGraphState {
  runId: string;                          // Unique workflow run ID
  queryId: string;                        // Query ID for tracing
  traceId: string;                        // Trace ID for correlation

  hmmState: 'OBSERVE' | 'CLASSIFY' | ... // Current workflow state
  errorText?: string;                     // Raw error message
  targetFiles: string[];                  // Files to focus on

  classifiedError?: ClassifiedError;      // Output from Layer 1
  candidatePacketKeys: string[];          // Candidates from retrieval
  evidence: EvidenceRecord[];             // Output from Layer 2
  recommendations: Recommendation[];      // Output from Layer 3

  rerankResults?: RerankResult[];         // RRF-scored candidates
  selectedRecommendationId?: string;      // User-selected recommendation
  permission?: PermissionLevel;           // Authorization level

  executionResult?: ExecutionResult;      // Edits applied + output
  validationResults: ValidationResult[];  // Test results

  retryCount: number;                     // Current retry attempt
  maxRetries: number;                     // Max retries before block
}
```

---

## Outcome Learning Loop

After workflow completes, record the outcome:

```typescript
interface AgentOutcome {
  runId: string;
  recommendationType: string;             // 'ast-guided' | 'schema-validation' | ...
  selectedTool: string;                   // Which approach was chosen?
  selectedAgent: string;                  // Which reasoning layer? ('learning-circuit-v1')

  evidenceTypes: string[];                // ['AST', 'schema', 'retrieval']
  sourceRefValidity: number;              // 0-1 score

  executionSucceeded: boolean;
  testsPassed: boolean;
  regressionDetected: boolean;
  humanAccepted?: boolean;                // Operator approval

  latencyMs: number;
  tokenCost?: number;
  timestamp: Date;
}
```

**Update Success Prior:**
```typescript
function updateSuccessPrior(
  previous: number,
  outcome: AgentOutcome,
  alpha = 0.1
): number {
  const reward = outcome.testsPassed && outcome.executionSucceeded && !outcome.regressionDetected
    ? 1
    : 0;
  return previous * (1 - alpha) + reward * alpha;
}
```

Example: recommendation `ast-guided` has success prior 0.62 → outcome passes all gates (reward=1) → new prior = 0.62 * 0.9 + 1 * 0.1 = 0.658

---

## Usage

### Start the Learning Circuit

```bash
# Start all three Docker Gemma4 instances
npm run learning-circuit:start

# Or pull latest images first
npm run learning-circuit:start:pull

# Check health
npm run learning-circuit:health
```

### Invoke the Workflow

```bash
# Directly via API
curl -X POST http://localhost:5173/api/agent-control/error-fixing-graph \
  -H "Content-Type: application/json" \
  -d '{
    "errorText": "TypeError: Cannot read property \"getSession\" of undefined",
    "targetFiles": ["src/lib/auth.ts", "src/lib/session.ts"]
  }'

# Or via npm script (once TypeScript endpoint is ready)
npm run learning-circuit:invoke
```

### Expected Response

```json
{
  "runId": "550e8400-e29b-41d4-a716-446655440000",
  "traceId": "660e8400-f29b-41d4-a716-446655440000",
  "hmmState": "COMPLETE",
  "classifiedError": {
    "errorType": "type",
    "intent": "fix-compilation",
    "confidence": 0.92,
    "targetSymbols": ["getSession"],
    "suggestedApproaches": ["ast-walk", "schema-validation"]
  },
  "evidence": [
    {
      "sourceRef": "src/lib/auth.ts",
      "symbols": [...],
      "schemaEvidence": [...],
      "retrievalScores": {...}
    }
  ],
  "recommendations": [
    {
      "packetKey": "packet:auth:001",
      "approach": "ast-guided",
      "confidence": 0.87,
      "suggestedFiles": ["src/lib/auth.ts"],
      "suggestedEdits": ["Add null check"],
      "testPlan": ["npm run test"],
      "rationale": "..."
    }
  ],
  "validationResults": [
    {"testName": "unit-tests", "passed": true, "duration": 250},
    {"testName": "integration-tests", "passed": true, "duration": 450}
  ],
  "executionResult": {
    "success": true,
    "filesChanged": ["src/lib/auth.ts"],
    "stdout": "Edits applied successfully"
  }
}
```

---

## Verification Checklist

- [ ] Three Docker services start without errors: `docker compose --profile learning-circuit ps`
- [ ] Health check passes: `npm run learning-circuit:health`
- [ ] Observation layer responds: `curl http://127.0.0.1:8091/api/tags`
- [ ] Evidence layer responds: `curl http://127.0.0.1:8194/api/tags` (remapped from 8092 due to port conflict)
- [ ] Recommendation layer responds: `curl http://127.0.0.1:8093/api/tags`
- [ ] LangGraph builds without errors: `npm run build` passes TypeScript check
- [ ] API endpoint runs: `curl -X POST http://localhost:5173/api/agent-control/error-fixing-graph ...`
- [ ] Test suite passes: `npm run learning-circuit:test`

---

## Next Steps

### Immediate (This Sprint)

1. ✅ **Specification Complete** — Three-layer architecture, state machine, outcome learning
2. ⏳ **Model Tuning** — Fine-tune each Gemma4 instance with few-shot examples:
   - Layer 1: 5-10 error classification examples
   - Layer 2: 5-10 evidence-gathering examples
   - Layer 3: 5-10 recommendation examples
3. ⏳ **Test Suite** — Write integration tests for each LangGraph state
4. ⏳ **Outcome Storage** — Create `agent_outcomes` table schema + recording functions

### Phase 2 (After Learning Circuit Stabilizes)

5. ⏳ **HMM Training** — Aggregate outcomes, train Hidden Markov Model for state transitions
6. ⏳ **Tool Selection Priors** — Which tools (AST, schema, retrieval) correlate with success?
7. ⏳ **Kanban Integration** — Wire recommendations → GitHub issues → PR lifecycle
8. ⏳ **CI Integration** — Deep research worker reads CI logs, tests, and PR reviews

### Phase 3 (Production Deployment)

9. ⏳ **Postgres Persistence** — Checkpoints at each LangGraph state, enable resume-on-failure
10. ⏳ **Observable Traces** — Langfuse integration for every node, every decision
11. ⏳ **Human Approval Gate** — Interrupt before execution for operator review (dry-run mode)
12. ⏳ **Continuous Learning** — Update success priors every hour from outcomes table

---

## Design Principles

1. **Postgres is Truth** — All state, evidence, recommendations, outcomes stored in Postgres
2. **LangGraph Controls Flow** — No "LLM chooses next state" (model can't be trusted for control decisions)
3. **Deterministic Reasoning** — Layer 1/2/3 model outputs are input to deterministic gates
4. **Outcome Driven** — Learn from what actually works, not from prompts or papers
5. **Bounded Research** — Deep Agent (Layer 2) has read-only filesystem, no execution
6. **GitHub is Boundary** — Approved recommendations → PR → CI → merge, not autonomous
7. **Durable Execution** — Resume interrupted workflows, time travel for debugging

---

## References

- **Architecture Decision Record:** `docs/UNIFIED-RETRIEVAL-PIPELINE.md` (section on learning circuit)
- **LangGraph Docs:** https://langchain-ai.github.io/langgraph/
- **Parent Atlas Identity Contract:** `memory/parent-atlas-frozen-identity-contract.md`
- **OpenSpec Phase 2F.1 Specification:** `openspec/changes/phase-2f1-real-evaluation-corpus/`
