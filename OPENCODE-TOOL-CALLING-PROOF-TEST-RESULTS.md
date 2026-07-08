# OpenCode Tool Calling — Proof Test Results

**Date**: July 8, 2026
**Session**: 124/125
**Status**: ❌ **FAIL — MODEL LIMITATION CONFIRMED**

---

## Test Command

```
Use the grep tool to find "phase6-preflight" in the scripts directory. 
Then use the read tool to open the file.
```

---

## Pre-Test Verification ✅

- [x] llama-server :8090 running
- [x] Sanitizer :8091 running (restarted — had crashed)
- [x] TRACE MCP :8788 responding
- [x] OpenCode config pointing to :8091

---

## Results

### Overall Outcome

- [x] ❌ **FAIL** — Tool calling not working (model limitation)

---

## Root Cause (Confirmed via curl test)

**Gemma4 IQ4_XS does not output OpenAI-format tool call JSON.**

When sent a request with `tools` array and `tool_choice: "auto"`, the model returns:

```json
{
  "finish_reason": "stop",
  "message": {
    "role": "assistant",
    "content": "I will use the grep tool...\n\n<execute_tool>\ngrep ...\n</execute_tool>"
  }
}
```

**Expected (OpenAI tool call format):**
```json
{
  "finish_reason": "tool_calls",
  "message": {
    "role": "assistant",
    "tool_calls": [{"function": {"name": "grep", "arguments": "{\"pattern\": \"phase6-preflight\"}"}}]
  }
}
```

**Two confirmed failure modes:**
1. `finish_reason: "stop"` instead of `"tool_calls"` — OpenCode sees text response, never triggers tool execution
2. `<execute_tool>` XML narration in content — model was fine-tuned to describe tool calls, not emit JSON

**Sanitizer finding:** Sanitizer was also down (crashed), causing visible `<start_of_turn>`/`<end_of_turn>` markers in UI. Restarted. But sanitizer cannot fix the underlying tool call format issue.

---

## Failure Indicators Observed

- [x] No approval prompts from OpenCode
- [x] Gemma4 narrates tool calls instead of invoking them
- [x] XML-style tags visible (`<execute_tool>`) in raw output
- [x] `finish_reason: "stop"` instead of `"tool_calls"` (confirmed via curl)
- [x] Response looping (same text repeated 3 times — generation instability)
- [x] Turn markers (`<start_of_turn>`, `<end_of_turn>`) visible in UI (sanitizer was down)

**Total Failure Indicators**: 6 / 8

---

## Options Forward

### Option A: Extend Sanitizer to Execute `<execute_tool>` Blocks
Parse `<execute_tool>` content in the sanitizer proxy, execute the command server-side, inject result as a synthesized tool response. Keeps Gemma4.

- Complexity: High
- Risk: Security (executing arbitrary commands from model output)
- Benefit: No model change needed

### Option B: Switch to a Model with Native Tool Call Support
Qwen2.5-7B-Instruct, Hermes-3, or Llama-3.1 natively output `tool_calls` JSON.

- Complexity: Low (config change only)
- Risk: Model quality difference for legal reasoning
- Benefit: Real tool calling works immediately
- **Blocker: No Qwen/Hermes model available locally**

### Option C: Accept Limitation — Use Gemma4 for Reasoning Only
Keep Gemma4 for summarization/synthesis tasks. Use Claude Code (this tool) for file operations and code navigation. OpenCode with Gemma4 = conversational assistant, not agentic tool executor.

- Complexity: Zero
- Risk: Low
- Benefit: Pragmatic — don't block Phase 6-7 on tool calling

---

## Recommended Path: Option C (immediate) + Option B (when model available)

**Option C now**: Accept that OpenCode + Gemma4 IQ4_XS does not do real tool calling. Use it for what it does well — legal reasoning, summarization, context synthesis. Use Claude Code for file navigation.

**Option B later**: When a Qwen2.5-7B-Instruct or Hermes-3 GGUF is downloaded, wire it as an alternate model in `.opencode/opencode.jsonc` with `"tools": true`. Then re-run this proof test.

---

## Next Steps

- [ ] Document model limitation in `.opencode/system.md` so future sessions know
- [ ] Add Qwen2.5-7B-Instruct GGUF download to backlog
- [ ] Keep sanitizer auto-starting (still needed for marker cleanup in chat responses)
- [ ] Add sanitizer to `.vscode/tasks.json` auto-start so it doesn't crash silently again
- [ ] Wire sanitizer auto-restart on crash (or add health check to launcher)

---

**Verdict**: Gemma4 IQ4_XS is not capable of OpenAI-format tool calling. Configuration was correct; the model itself is the blocker. Tool calling requires a different model.
