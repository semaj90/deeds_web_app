# Startup Contract: llama-server Gemma4 + Ornith Recovery

**Root Cause:** `--skip-chat-parsing` flag forces reasoning/tool tags into ordinary content, breaking Cline/OpenCode tool-call parsing.

## Gemma4 Direct Profile (CORRECT)

```
model: gemma4-legal-iq4xs-direct.gguf
alias: gemma4
host: 127.0.0.1
port: 8090
ctx-size: 65536
batch-size: 512
ubatch-size: 128
parallel: 1
n-gpu-layers: all (main gpu 0)
flash-attn: on
jinja: on
chat-template-file: configs/templates/custom_pub_chat_template_gemma4.jinja
reasoning: off
reasoning-budget: 0
reasoning-format: deepseek
MUST NOT HAVE: --skip-chat-parsing
cache-prompt: on
cache-reuse: 256
cache-type-k: q8_0
cache-type-v: q8_0
spec-type: none (NOT draft/mtp)
metrics: on
slots: on
```

## Ornith 9B Profile (DO NOT CUSTOMIZE TEMPLATE YET)

```
model: ornithModelPath
alias: ornith-9b
host: 127.0.0.1
port: 8090
ctx-size: 65536
batch-size: 512
ubatch-size: 128
parallel: 1
n-gpu-layers: all
flash-attn: on
jinja: on
chat-template-file: NONE (use GGUF metadata only)
reasoning: off
reasoning-budget: 0
reasoning-format: deepseek
MUST NOT HAVE: --skip-chat-parsing
cache-prompt: on
cache-reuse: 256
cache-type-k: q8_0
cache-type-v: q8_0
spec-type: none
metrics: on
```

## REMOVE THESE FLAGS (break tool parsing)

```
❌ --skip-chat-parsing (THE CULPRIT)
❌ --reasoning auto
❌ --reasoning-format legacy (only deepseek-compatible)
❌ --spec-type draft (MTP experimental, Gemma4 CUDA issues)
❌ Custom template on Ornith (until compatibility proven)
```

## Search & Remove (3 sweeps)

```bash
# Sweep 1: Launchers
rg "skip.chat.parsing|reasoning.format|reasoning.budget|spec.type|LLAMA_ARG_" \
  scripts/ sveltekit-frontend/ --type sh --type ps1

# Sweep 2: Environment
rg "SKIP_CHAT_PARSING|REASONING_FORMAT|SPEC_TYPE" .env* docker-compose.yml

# Sweep 3: Config files
rg "skip-chat-parsing|reasoning.*legacy|draft.*mtp" .opencode/ vscode/
```

## 3-Point Startup Validation Contract

**Before Cline/OpenCode, llama-server MUST pass:**

### 1. Clean Streaming Content Test
```bash
curl -s http://127.0.0.1:8090/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gemma4-legal-iq4xs-direct.gguf","messages":[{"role":"user","content":"reply: OK"}],"stream":true}' \
  | grep -o "data: .*" | head -3
```
**MUST NOT contain:** `<|think|>`, `<|channel>`, `<thinking>`, reasoning tags as text
**Expected:** clean delta content only

### 2. Parsed Tool Call Test
```bash
curl -s http://127.0.0.1:8090/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model":"gemma4-legal-iq4xs-direct.gguf",
    "messages":[{"role":"user","content":"call tool echo_test with value hello"}],
    "tools":[{"type":"function","function":{"name":"echo_test","description":"Echo test","parameters":{"type":"object","properties":{"value":{"type":"string"}},"required":["value"]}}}],
    "stream":false
  }' | jq '.choices[0].message.tool_calls'
```
**MUST contain:** Array with `function_name: "echo_test"`, `arguments: {value: "hello"}`
**MUST NOT contain:** Textual tool-call imitation in `content` field

### 3. Model Template Identity Test
```bash
curl -s http://127.0.0.1:8090/v1/models | jq '.data[0] | {id, context_length, supports_system_role, supports_tool_calls}'
```
**MUST show:** 
- `id: "gemma4-legal-iq4xs-direct.gguf"`
- `context_length: 65536` (not null)
- `supports_system_role: true`
- `supports_tool_calls: true`

## Adapter Circuit Breaker (Non-Retryable)

```typescript
const CONTROL_TOKENS = /<\|think\|>|<\|channel>|<thinking>|<\/thinking>|<\|im_start\|>/gi;
const matches = rawOutput.match(CONTROL_TOKENS);

if (matches && matches.length > 0) {
  throw new NonRetryableModelProtocolError({
    code: 'MODEL_OUTPUT_PROTOCOL_CONTAMINATION',
    contaminationCount: matches.length,
    contaminatedTokens: matches.slice(0, 5),
    message: `Detected ${matches.length} control tokens in model output. Launcher contract violated (likely --skip-chat-parsing enabled).`
  });
}
```

**Do NOT strip and continue.** Fail closed — this reveals a launcher misconfiguration.

## Recovery Sequence (10 Steps)

1. Stop Cline/OpenCode (kill all instances)
2. Kill llama-server: `taskkill /F /IM llama-server.exe`
3. Verify only one process remains: `ps aux | grep llama`
4. Search & remove conflicting flags (3 sweeps above)
5. Clear environment: `$env:SKIP_CHAT_PARSING = ''; $env:REASONING_FORMAT = ''`
6. Start Gemma4 Direct profile explicitly: `npm run turbo:start`
7. Run clean streaming test (passes → OK)
8. Run parsed tool call test (passes → OK)
9. Run model template identity test (all true → OK)
10. Restart Cline/OpenCode, fresh conversation

## Startup Logging Requirement

Before `/v1/chat/completions`, launcher MUST print:

```
[llama-server] Contract Check:
  Model:          gemma4-legal-iq4xs-direct.gguf
  Template File:  configs/templates/custom_pub_chat_template_gemma4.jinja
  Template Hash:  <SHA256>
  Chat Parsing:   ENABLED (NOT SKIPPED) ✓
  Reasoning:      off, format=deepseek ✓
  Streaming:      true ✓
  System Role:    supported ✓
  Tool Calls:     supported ✓
  Spec Type:      none (no MTP) ✓
  Status:         READY_FOR_CLINE_OPENCODE
```

**If any line shows red/FAILED, do not start Cline.**

---

**Next Session:** Implement flag-removal sweep + add validation tests to launcher.
