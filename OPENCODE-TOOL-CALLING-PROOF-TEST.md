# OpenCode Tool Calling — Definitive Proof Test

**Status**: ⏳ **PENDING EXECUTION IN OPENCODE**  
**Date**: July 7, 2026  
**Infrastructure**: ✅ All services running (llama-server :8090, sanitizer :8091, TRACE MCP :8788)

---

## The Real Test (Not Config Validation)

Configuration can be perfect, but **tool calling only works if Gemma4 actually invokes real tools that OpenCode executes**.

### Test Procedure

**Inside OpenCode, run this exact command:**

```
Use the grep tool to find "phase6-preflight" in the scripts directory. Then use the read tool to open the file.
```

### Expected Success Path ✅

**Indicator 1: Grep Tool Execution**
- OpenCode shows an approval prompt: `Use grep to search for "phase6-preflight" in scripts?`
- After approval: actual grep results showing matching files
- Output example:
  ```
  scripts/atlas/phase6-preflight.mjs:123: npm run phase6:start
  scripts/atlas/phase6-preflight.mjs:456: console.log('Phase 6 preflight...')
  ```

**Indicator 2: Read Tool Execution**
- OpenCode shows: `Read file c:\Users\james\Videos\deeds-web-app\scripts\atlas\phase6-preflight.mjs?`
- After approval: actual file content displayed in editor
- File opens in VS Code with proper syntax highlighting

**Overall Success Criteria:**
- Real tool permissions prompts appear (approval flow)
- Actual file system operations execute
- Results are genuine filesystem data, not mock/simulated
- No XML tags, `<execute_tool>`, or `<tool_call>` text in output

---

### Expected Failure Path ❌

**Indicator 1: Fake Tool Calls**
OpenCode displays:
```
I will use the grep tool to search for "phase6-preflight".

<execute_tool>
grep -r "phase6-preflight" scripts/
</execute_tool>

<tool_response>
scripts/atlas/phase6-preflight.mjs:123: npm run phase6:start
</tool_response>
```

**Red Flag Signs:**
- XML-style tags: `<tool_call>`, `<execute_tool>`, `<tool_response>`
- Mock/simulated output (not real filesystem data)
- No approval prompts
- Text says "I will use the tool" instead of actually using it
- Gemma4 narrating tool calls instead of OpenCode executing them

**Indicator 2: Generic Tool Format**
Output like:
```
I need to search for the file. I will use the grep command.
<execute_tool>
  grep -r "phase6-preflight" scripts
</execute_tool>
```

This means **Gemma4 is imitating tool calls, not invoking real OpenCode tools**.

---

## Why This Proves or Disproves Everything

| Aspect | What Config Says | What Proof Test Shows |
|--------|-------------------|----------------------|
| **`"tools": true`** | Model supports tool calling | ← Proved if real grep/read execute |
| **`"reasoning": false`** | No reasoning protocol | ← Irrelevant if Gemma4 fakes tools |
| **MCP reachable** | `:8788/mcp` responds | ← Unused if Gemma4 won't invoke tools |
| **Sanitizer working** | `:8091 strips markers` | ← Only matters if Gemma4 actually calls tools |
| **Permission config** | `grep: "allow"` | ← Only enforced if OpenCode sees grep tool call |

**Bottom Line:**  
If grep executes and asks for approval, **tool calling is real**.  
If Gemma4 narrates fake tool calls, **all the config is irrelevant**.

---

## Checkpoint: Current Infrastructure Status

### ✅ Running Services
- **llama-server :8090** — Gemma4 model server (PID 61180)
- **Sanitizer :8091** — Response cleaner (Node.js proxy)
- **TRACE MCP :8788** — Tool definitions (129 tools available)
- **OpenCode** — VS Code extension

### ✅ Configuration
- `.opencode/opencode.jsonc` points to `:8091`
- `atlas-context` agent configured
- `grep`, `read`, `edit` permissions allowed
- TRACE MCP registered

### ⏳ Unproven
- Whether Gemma4 actually outputs real tool invocations
- Whether OpenCode can parse and execute tool calls
- Whether the full chain (Gemma4 → OpenCode → filesystem) works end-to-end

---

## How to Run This Test

1. **Ensure VS Code/OpenCode is open** on the deeds-web-app workspace
2. **Verify all services running** (run PowerShell health checks above)
3. **Open OpenCode chat** (Command Palette → "Claude: Chat" or equivalent)
4. **Type the exact command:**
   ```
   Use the grep tool to find "phase6-preflight" in the scripts directory. 
   Then use the read tool to open the file.
   ```
5. **Observe the response:**
   - Do approval prompts appear? → **Real tools** ✅
   - Do XML tags appear? → **Fake tools** ❌
6. **Document the result** in `OPENCODE-TOOL-CALLING-PROOF-TEST-RESULTS.md`

---

## Success Indicators Checklist

- [ ] OpenCode shows permission approval prompts
- [ ] Grep returns actual matching filenames from filesystem
- [ ] Read shows actual file content (not mock data)
- [ ] No XML tags in output
- [ ] No `<execute_tool>` or `<tool_call>` text
- [ ] File opens in VS Code editor
- [ ] Syntax highlighting works (TypeScript for .mjs file)

## Failure Indicators Checklist

- [ ] Gemma4 narrates tool calls instead of executing them
- [ ] Output contains `<tool_call>`, `<execute_tool>`, `<tool_response>` tags
- [ ] Mock filenames that don't exist in filesystem
- [ ] No approval prompts from OpenCode
- [ ] Response looks like Gemma4 was pretending to use tools

---

## If Proof Test PASSES ✅

**Next Steps:**
1. Document results: copy actual tool output to results file
2. Update `TOOL-CALLING-AUDIT-SESSION-124.md` section: "Proof Test: PASSED"
3. Add sanitizer to auto-start tasks in `.vscode/tasks.json`
4. Mark tool calling as "verified for production"
5. OpenCode `/atlas-context` command is now fully operational

## If Proof Test FAILS ❌

**Debugging Steps:**
1. Check Gemma4 model compatibility — may need different model or binary
2. Try `--jinja` with different tool format (e.g., `--chat-template openai-function-call`)
3. Test directly with curl to llama-server to confirm raw output format
4. Consider using a different model that natively outputs OpenAI tool format
5. Review llama-server startup logs for TurboQuant/tool-calling errors

---

## Reference: OpenCode Tool Execution Flow

```
User: "Use grep to find X"
       ↓
Gemma4 at :8091 (via sanitizer at :8090)
       ↓
REAL: Outputs JSON tool call → OpenCode parses → executes grep → returns result
FAKE: Outputs XML narration → OpenCode sees text, not tool → displays as narration
       ↓
If REAL: approval prompt → user confirms → filesystem changes
If FAKE: no prompt → Gemma4's mock output displayed
```

---

## Status After This Session

**Infrastructure**: 🟢 Ready  
**Config**: 🟢 Valid  
**Proof**: ⏳ Pending

**This test document is intentionally detailed to distinguish between:**
- Config being "correct" (necessary but not sufficient)
- Tools actually executing (necessary and sufficient proof)
