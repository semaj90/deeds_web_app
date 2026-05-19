# Merged Gemma4 GGUF / OpenCode Integration Validation Checklist
**Date**: 2026-05-18
**Purpose**: Compare the proven Ollama OpenCode path with the merged Gemma4 GGUF local runtime, and validate the merged GGUF path until it matches Ollama-level stability.

---

## 1. Known Working Baseline — Ollama

- [ ] Run `ollama launch opencode`
- [ ] Confirm OpenCode connects successfully without:
  - `assistant prefill incompatible with thinking`
  - request payload exceeding context
  - tool-call formatting errors
- [ ] Record the following baseline metrics:
  - model name
  - context window
  - tokens/sec
  - time to first token
  - max successful prompt size

### Ollama baseline expectations
- provider setup handled by Ollama
- OpenAI-compatible chat template works
- `thinking=false` and `assistant_prefill` conflicts absent
- tool-call JSON is valid and parseable

---

## 2. Merged GGUF Runtime Validation

- [ ] Start merged GGUF with `llama-server.exe`:

```powershell
C:\Users\james\Desktop\llama-server-cuda\llama-server.exe `
  -m C:\Users\james\Videos\deeds-web-app\vendor\models\gemma4-legal.gguf `
  --host 127.0.0.1 `
  --port 8090 `
  --ctx-size 16384 `
  --n-gpu-layers 99 `
  --cache-type-k q8_0 `
  --cache-type-v q8_0 `
  --flash-attn
```

- [ ] Verify OpenAI-compatible endpoint:

```powershell
curl http://127.0.0.1:8090/v1/models
```

- [ ] Confirm the returned model ID matches the OpenCode config exactly.
- [ ] Confirm the runtime is the merged GGUF path, not the Ollama path.

---

## 3. OpenCode Config Validation

- [ ] Use an OpenAI-compatible provider configuration for the merged GGUF path:

```json
{
  "provider": "openai-compatible",
  "baseURL": "http://127.0.0.1:8090/v1",
  "apiKey": "local",
  "model": "gemma4-legal",
  "context": 16384,
  "maxTokens": 2048,
  "temperature": 0.2,
  "thinking": false,
  "reasoning": false
}
```

- [ ] Search all external OpenCode config files and runtime scripts for these fields:
  - `thinking`
  - `reasoning`
  - `prefill`
  - `assistant_prefill`
  - `assistantPrefill`

- [ ] Disable or remove all thinking/prefill conflict fields in the OpenCode runtime configuration.

---

## 4. Request Payload Guard

- [ ] Add logging before every merged GGUF LLM request showing:

```json
{
  "stage": "llm_request_budget",
  "input_tokens": 0,
  "max_tokens": 2048,
  "ctx": 16384,
  "total_requested_tokens": 2048,
  "model_url": "http://127.0.0.1:8090/v1",
  "thinking": false,
  "prefill_present": false
}
```

- [ ] Hard fail before sending if:

```text
input_tokens + max_tokens > ctx
```

- [ ] If the hard fail occurs, apply one retry attempt with:
  - shrink ACE packet
  - reduce top_k / candidate size
  - summarize history
  - retry once

---

## 5. Chat Template / Tool Format Check

- [ ] Verify normal chat works on merged GGUF:

```powershell
curl -X POST http://127.0.0.1:8090/v1/chat/completions `
  -H "Content-Type: application/json" `
  -d '{"model":"gemma4-legal","messages":[{"role":"user","content":"Say ready."}],"max_tokens":32}'
```

- [ ] Verify tool-like JSON output is returned cleanly:

```text
{"status":"ready","tool_call_safe":true}
```

- [ ] Confirm the response contains no malformed XML, wrapper markup, or invalid tool-call serialization.

---

## 6. ACE / TRACE MCP Validation

- [ ] Start required dependencies:
  - `docker compose up -d postgres redis qdrant`
  - `npm run mcp:trace`

- [ ] Verify MCP is alive:

```powershell
curl -s -X POST http://localhost:8788/mcp `
  -H "Content-Type: application/json" `
  -H "Accept: application/json, text/event-stream" `
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

- [ ] Confirm ACE weights are injected into the prompt or trace logs:
  - `grep attention_weights`
  - `grep "ACE Context Weights"`

- [ ] Confirm the merged GGUF endpoint is used by the legal/code task path when ACE / TRACE is active.

---

## 7. Context Overflow Test

- [ ] Test with these parameters:
  - context = 16384
  - maxTokens = 2048
  - top_k = 3
  - ACE packet <= 3500 tokens
  - MCP result <= 800 tokens

- [ ] Run the same query 5 times and record:
  - cold latency
  - warm latency
  - Redis hit/miss
  - ACE packet token count
  - total requested token count

- [ ] Only raise to 32768 after the 16k path is stable and overflow-free.

---

## 8. TurboQuant Fork Check

- [ ] Confirm the llama-server binary supports TurboQuant / MTP flags:

```powershell
C:\Users\james\Desktop\llama-server-cuda\llama-server.exe --help | findstr /i "cache-prompt cache-reuse turbo quant mtp draft"
```

- [ ] If the flags are missing, document that this is a stock llama-server runtime, not a TurboQuant fork.
- [ ] Keep environment variables honest:
  - `TURBO_PROFILE=stock`
  - `TURBOQUANT_ENABLED=false`
  - `ROTORQUANT_KV_ENABLED=false`
  - `MTP_ENABLED=false`

---

## 9. Quality A/B Test

- [ ] Use the same prompt for Ollama and merged GGUF.
- [ ] Compare the output for:
  - correctness
  - evidence usage
  - chunk_id usage
  - latency
  - tokens/sec
  - context errors
  - tool-call compatibility

- [ ] Diagnose the specific `graphify-deep-imports` failure mode:
  - unresolved-imports.json cause
  - evidence from the log or trace
  - safest remediation command
  - rollback risk

---

## 10. Pass Criteria

Merged GGUF is considered smooth when all of these are true:

- [ ] OpenCode connects without format errors
- [ ] no thinking/prefill conflict exists
- [ ] no context overflow occurs at 16k
- [ ] TRACE MCP tools work through the merged GGUF path
- [ ] ACE packet weights appear in prompt/trace
- [ ] responses use chunk IDs / evidence references
- [ ] warm query latency is better than cold query latency
- [ ] tokens/sec is acceptable for the merged GGUF runtime

---

## Summary

- Ollama is the stability baseline.
- Merged GGUF is the high-quality target.
- The integration is successful only when the local GGUF path is as clean and predictable as the Ollama path.
- Root cause focus: endpoint ID, chat template, payload budget, thinking/prefill settings, and ACE compression.
