# Session 188C Handoff — Startup Contract Recovery

**Status:** go-retrieval READY_FULL ✅ | llama-server running gemma4 ✅ | dev:gpu ready to test

**Root Issue Found:** `--skip-chat-parsing` + unfiltered reasoning tags breaking tool-call parsing in Cline/OpenCode

**Artifact Created:** `docs/STARTUP-CONTRACT-LLAMA-RECOVERY.md` — full 10-step recovery spec + validation tests

## Immediate Next Steps

### 1. Manual Flag Check (3 files, 5 min)
Check these files for `--skip-chat-parsing` or `reasoning-format`:
- `scripts/launch-turboquant.ps1` (most likely)
- `scripts/launchers/llama_server/*` 
- `.opencode/opencode.jsonc` (model config)

### 2. If Found: Remove Flags
Delete any occurrence of:
- `--skip-chat-parsing`
- `--reasoning-format legacy`
- `--reasoning-format auto`
- `--reasoning-budget` (unless = 0)
- `--spec-type draft`

### 3. Validate 3-Point Contract
Run these after restart (from STARTUP-CONTRACT-LLAMA-RECOVERY.md):
```bash
# Test 1: Clean streaming (no leaked tokens)
# Test 2: Parsed tool calls (real tool_calls array)
# Test 3: Model identity (context_length not null)
```

### 4. Test dev:gpu
```bash
npm run dev:gpu
# Should boot Vite on :5173
```

### 5. Restart Cline/OpenCode
Fresh conversation, full agent loop safety active.

## Context Saved to Memory

File: `memory/SESSION-188C-LLAMA-STARTUP-CONTRACT.md` (auto-created next session)

## If Sweep Fails Again

Use PowerShell directly:
```powershell
# Find all PS1 files with the culprit flag
Get-ChildItem -Recurse -Filter "*.ps1" | 
  Select-String "skip.chat.parsing|reasoning.format" | 
  Select-Object Path, LineNumber, Line
```

Then edit each file and remove the flag.

---

**Session Note:** Agent loop safety rules working (sanitizer patched). The leak is infrastructure (launcher template/parsing mode), not model output corruption.
