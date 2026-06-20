# Lane Feature Story: Agent Policy Lane

## Purpose
Drives active decision-making, code-intel repairs, and tool-dispatch selections using specialized LangGraph, LangChain, and local-deep-research (LDR) model policies.

## Owner
Agentic AI Framework Developers

## Expected Behavior
- Coordinates model actions using LangGraph sequences.
- Feeds codebase context and tool results into Gemma4 to generate structured actions.
- Replaces legacy Hermes agent structures with the modular LDR research service container.
- Restricts database write permissions to queue-based promotions.

## Primary Files
- [train-policy-reranker.py](file:///c:/Users/james/Videos/deeds-web-app/scripts/atlas/train-policy-reranker.py)
- [serve-policy-reranker.py](file:///c:/Users/james/Videos/deeds-web-app/scripts/atlas/serve-policy-reranker.py)
- [sidecar-router.ts](file:///c:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/lib/server/ai/sidecar-router.ts)

## Contracts
- Model synthesis prompts must follow templates in `configs/templates/gemma4-opencode.jinja`.
- External service integrations must honor Zod-validated payloads.

## Cache/Traversal Surfaces
- Reads intermediate tool ontology paths.
- Writes agent action trace outcomes to `agent_traces` ledger.

## Failure Modes
- Inference API connection timeouts or GGUF load errors.
- Hallucinated tool invocations or invalid parameter payloads.
- Permissions violations due to unauthorized graph node mutations.

## Proof Commands
```bash
python scripts/atlas/train-policy-reranker.py --dry-run
```

## Verdict
**PASS** — Scaffolding is complete and verified, awaiting formal distills and downstream integration tests.
