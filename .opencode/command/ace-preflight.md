# ACE Prompt Preflight

description: Build a compact token-mapped ACE/NES prompt packet before OpenAI-compatible Gemma4 generation.

## Mission

Do not call Gemma4 until context is pruned.

## Required Order

1. Redis exact lookup
2. LangExtract query entity extraction
3. Qdrant dense card search
4. Postgres sourceRef/JSONB validation
5. Hypergraph expansion
6. TurboVec rerank
7. Token-budget prune
8. ACE context pack write
9. OpenAI-compatible generation

## Forbidden

- Do not read full files.
- Do not put raw JSONL into prompt.
- Do not put full markdown docs into prompt.
- Do not cache hidden reasoning.
- Do not cache raw KV tensors.

## Output

Return:

status:
contextPackKey:
selectedCards:
sourceRefs:
chunkIds:
estimatedTokens:
selectedLane:
nextActions:

Run:

```txt
/ace-preflight prune prompt for "consolidate retrieval sidecars and recommend archive_to_deeds_lab"
```

## Bottom line

You need a tool call before generation:

`ace.prompt_preflight(query)`
→ compact ACE/NES packet
→ `/v1/chat/completions`

## Packet Contract

- version the ACE/NES packet so newer prompt cards do not break older caches
- keep the contract compact and deterministic:
  - `version`
  - `cartridgeId`
  - `intent`
  - `sourceRefs`
  - `chunkIds`
  - `featureLabels`
  - `selectedCards`
  - `graphPaths`
  - `pruneCandidates`
  - `archiveToDeedsLab`
  - `productionReady`
  - `nextActions`
  - `degraded`
