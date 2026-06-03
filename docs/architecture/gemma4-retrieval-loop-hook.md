# Gemma4 Retrieval Loop Hook

This document describes a minimal, safe integration for recording retrieval-loop events produced by Gemma4 tool calls. The hook appends local JSONL rows to `.tmp/atlas-retrieval-loop.jsonl` by default and must not publish to Redis or Qdrant until operator approval.

## Flow Diagram

```mermaid
flowchart LR
  A[Gemma4 receives compact context] --> B[classify_intent tool]
  B --> C[build_agentic_rag_context]
  C --> D[recommend_next_action]
  D --> E[tool-call completes]
  E --> F[gemma4-retrieval-hook (local append)]
  F --> G[.tmp/atlas-retrieval-loop.jsonl]
  G --> H[token-card-weight-updater] --> I[ACE/TurboVec feedback loop]
```

## Local CLI example

Append a row from the command line (dry-run local append):

```bash
node scripts/opencode/gemma4-retrieval-hook.mjs \
  --query "fix tool schema description errors" \
  --selected '[".opencode/cards/000678ef52ca67b0.json"]' \
  --sourceRefs '["scripts/opencode/validate-tool-schema.mjs"]' \
  --rerankScore 0.43 \
  --tool classify_intent \
  --outcome dry_run
```

Or pipe JSON via stdin (preferred from orchestrator):

```bash
echo '{"query":"...","selectedCardIds":[".."],"sourceRefs":[".."],"rerankScore":0.5,"tool":"classify_intent","outcome":"dry_run"}' \
  | node scripts/opencode/gemma4-retrieval-hook.mjs
```

## HTTP wrapper option

A tiny HTTP wrapper can expose a safe endpoint that validates input and calls the hook locally.

```js
import express from 'express';
import { spawn } from 'child_process';

const app = express();
app.use(express.json());

app.post('/internal/gemma4/hook', (req, res) => {
  const payload = req.body;
  // Validate minimal shape
  if (!payload.query || !Array.isArray(payload.selectedCardIds)) return res.status(400).json({ error: 'invalid' });
  const child = spawn('node', ['scripts/opencode/gemma4-retrieval-hook.mjs'], { stdio: ['pipe','pipe','inherit'] });
  child.stdin.write(JSON.stringify(payload));
  child.stdin.end();
  child.on('exit', (code) => res.json({ ok: code === 0 }));
});

app.listen(9111);
```

## OpenCode/OpenAI-compatible gateway pseudocode

When using an OpenAI-compatible gateway (OpenCode-facing), call the hook after tool completion. Pseudocode:

```
// inside tool execution handler
const result = await runTool(toolName, params);
const row = {
  query: context.query,
  selectedCardIds: result.selectedCardIds || [],
  sourceRefs: context.sourceRefs || [],
  rerankScore: result.rerankScore || null,
  tool: toolName,
  outcome: result.outcome || 'dry_run'
};
// call local hook via HTTP
await fetch('http://127.0.0.1:9111/internal/gemma4/hook', { method: 'POST', body: JSON.stringify(row), headers: {'Content-Type':'application/json'} });
```

## Safety rules

- Default behavior: append a local JSONL row to `.tmp/atlas-retrieval-loop.jsonl`.
- `--publish` is explicitly disabled in production hooks until operator approval.
- Preserve `sourceRefs` from incoming context and tool outputs.
- Never write to Qdrant from this hook.
- The hook is intentionally lightweight and synchronous for auditability.

## Next steps

- Operator can implement a `--publish` flow that validates Redis/Qdrant connectivity and requires an explicit flag plus operator confirmation before writing to remote systems.
- Add monitoring that alerts when `.tmp/atlas-retrieval-loop.jsonl` grows unexpectedly or contains invalid rows.
