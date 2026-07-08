# OpenCode Tool Calling — Readiness Checklist

**Date**: July 7, 2026 | **Status**: 🟡 Ready for Proof Test

---

## ✅ Infrastructure (READY)

- [x] llama-server :8090 running (PID 61180)
- [x] All llama-server flags verified:
  - [x] `--reasoning-format none`
  - [x] `--reasoning-budget 0`
  - [x] `--chat-template-file`
  - [x] `--jinja` (tool calling enabled)
  - [x] `--cache-prompt --cache-reuse 256`
- [x] Sanitizer :8091 running and healthy
- [x] TRACE MCP :8788 responding (129 tools)
- [x] No duplicate llama-server processes (cleaned up)

---

## ✅ Configuration (READY)

- [x] `.opencode/opencode.jsonc` valid JSON
- [x] Provider baseURL updated to `:8091` (sanitizer)
- [x] All 3 turboquant models configured
- [x] `"tools": true` on all models
- [x] `"reasoning": false` on all models
- [x] TRACE MCP registered and enabled
- [x] Permissions configured: `grep: allow`, `read: allow`, `edit: ask`
- [x] `/atlas-context` command defined
- [x] `atlas-context` agent configured

---

## ✅ Workaround (READY)

- [x] Sanitizer created and tested
- [x] Sanitizer strips `<start_of_turn>` markers ✓
- [x] Sanitizer strips `<end_of_turn>` markers ✓
- [x] Sanitizer handles JSON responses ✓
- [x] Sanitizer handles SSE streaming ✓
- [x] No sanitizer errors on test requests ✓

---

## ⏳ Proof Test (PENDING)

**Run This Exact Command Inside OpenCode:**

```
Use the grep tool to find "phase6-preflight" in the scripts directory. 
Then use the read tool to open the file.
```

**Checklist After Running:**

- [ ] OpenCode shows approval prompt for grep
- [ ] Grep returns actual matching files (check filesystem)
- [ ] OpenCode shows approval prompt for read
- [ ] File content displayed (actual file from disk)
- [ ] No XML tags or `<tool_call>` text visible
- [ ] File opens in VS Code editor
- [ ] Syntax highlighting active
- [ ] Result saved to OPENCODE-TOOL-CALLING-PROOF-TEST-RESULTS.md

---

## 🔧 If Proof Test PASSES ✅

- [ ] Update PROOF-TEST-RESULTS.md with "PASS" status
- [ ] Add sanitizer to `.vscode/tasks.json`:
  ```json
  {
    "label": "🧹 Startup: Gemma4 Tool-Call Sanitizer (:8091, detached)",
    "type": "shell",
    "command": "node scripts/opencode/gemma4-tool-call-sanitizer.mjs",
    "runOptions": { "runOn": "folderOpen" },
    "dependsOn": ["TurboQuant llama-server (VLM)"],
    "isBackground": true
  }
  ```
- [ ] Verify `/atlas-context` command works end-to-end
- [ ] Test additional OpenCode tools: read, bash, edit
- [ ] Mark tool calling as "VERIFIED FOR PRODUCTION"

---

## 🐛 If Proof Test FAILS ❌

### Scenario 1: Fake Tool Calls
(Gemma4 narrates but doesn't invoke)

- [ ] Note: "Gemma4 outputs text instead of real tool calls"
- [ ] Check Gemma4 model version compatibility with `--jinja`
- [ ] Try alternative model: Qwen, Claude, Hermes
- [ ] Try alternative llama-server: test1111/llama-cpp-turboquant-gemma4
- [ ] Document in PROOF-TEST-RESULTS.md as "Model limitation"

### Scenario 2: Permission Denied
(OpenCode sees tool but won't execute)

- [ ] Verify permission config: `grep: "allow"`, `read: "allow"`
- [ ] Check OpenCode logs for permission errors
- [ ] Try with `"grep": "allow"` instead of `allow`
- [ ] Document specific error message

### Scenario 3: No Response
(OpenCode hangs or times out)

- [ ] Check sanitizer still running: `curl http://127.0.0.1:8091/health`
- [ ] Check llama-server still running: `Get-Process llama-server`
- [ ] Check TRACE MCP still running: curl TRACE endpoint
- [ ] Check logs for errors in `/logs/turboquant/launch-*.err`
- [ ] Restart all services and retry

---

## Quick Health Check Commands

**Run these before proof test:**

```bash
# Check llama-server
Get-Process llama-server

# Check sanitizer
curl http://127.0.0.1:8091/health

# Check TRACE MCP
curl -X POST http://127.0.0.1:8788/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

# Verify sanitizer strips markers
curl -X POST http://127.0.0.1:8091/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gemma4-legal-iq4xs-direct.gguf","messages":[{"role":"user","content":"hello"}],"max_tokens":32}' \
  | jq '.choices[0].message.content'
# Should NOT contain <start_of_turn> or <end_of_turn>
```

---

## Document References

- **Audit Details**: `TOOL-CALLING-AUDIT-SESSION-124.md`
- **Proof Test Guide**: `OPENCODE-TOOL-CALLING-PROOF-TEST.md`
- **Session Summary**: `SESSION-124-OPENCODE-TOOL-CALLING-SUMMARY.md`
- **This Checklist**: `OPENCODE-READINESS-CHECKLIST.md`
- **Results**: `OPENCODE-TOOL-CALLING-PROOF-TEST-RESULTS.md` (create after test)

---

## Key Points to Remember

1. **Config valid ≠ tool calling proven**
   - Configuration can be perfect but still fake tool invocations
   - Only proof is real OpenCode tool execution

2. **Sanitizer removes markers only**
   - Doesn't make Gemma4 output real tool calls if it doesn't already
   - Just cleans up the responses

3. **All infrastructure running**
   - No more duplicate processes
   - Clean separation: llama-server → sanitizer → OpenCode

4. **Test is simple but definitive**
   - Ask for grep + read
   - Observe if OpenCode actually executes or just narrates

---

**Status**: Ready for proof test. Run the grep/read command in OpenCode and document results.
