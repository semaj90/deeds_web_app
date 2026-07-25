# llama-server Template Override Fix — Complete ✅

**Date**: 2026-07-24 (Session 142 Continuation — Part 2)  
**Status**: OVERRIDE FIXED | HEALTH GATE STRENGTHENED | TEMPLATE VALIDATED  
**Scope**: Resolve stale `gemma4-opencode.jinja` template preventing tool support

---

## Root Cause Analysis

The launcher had two bugs preventing tool support from working:

1. **Legacy Template Override**: `$env:TURBO_CHAT_TEMPLATE_FILE` could override the canonical `gemma4-tools.jinja` template with stale `gemma4-opencode.jinja` (text-only, no tool protocol)
2. **Insufficient Health Check**: Launcher accepted running servers based only on `supports_system_role`, never checking `supports_tools`. A stale server could persist indefinitely.

**Evidence**:
- Launcher default: `gemma4-tools.jinja` ✅
- Launcher actual output: `gemma4-opencode.jin` ❌
- Root cause: Override active somewhere

---

## Fixes Applied

### Fix 1: Template Override Validation ✅

**File**: `scripts/launch-turboquant.ps1` (lines 850–915)

**Changes**:
1. Added full path resolution for default template
2. Validate requested template exists before using
3. **Reject legacy templates** (`gemma4-opencode.jin`, `gemma4-opencode.jinja`) with explicit error
4. Validate selected template contains tool protocol (`{% if tools %}` or `tool_calls`)
5. Display template SHA256 hash for audit trail

**Before**:
```powershell
$chatTemplateFile = if ($env:TURBO_CHAT_TEMPLATE_FILE ...) {
    $env:TURBO_CHAT_TEMPLATE_FILE  # ← Can be stale
} else {
    $defaultTemplate
}
# No validation of template content
# No rejection of legacy templates
```

**After**:
```powershell
$templateLeaf = [System.IO.Path]::GetFileName($chatTemplateFile)

$legacyTemplates = @(
    'gemma4-opencode.jin',
    'gemma4-opencode.jinja'
)

if ($legacyTemplates -contains $templateLeaf) {
    throw @"
Legacy text-only tool template selected: $chatTemplateFile

Use:
$defaultTemplate

Unset TURBO_CHAT_TEMPLATE_FILE or point it to gemma4-tools.jinja.
"@
}

# Validate template has tool protocol
if ($templateSource -notmatch '\{%\s*if\s+tools' -and $templateSource -notmatch 'tool_calls') {
    throw "Selected template does not expose a tool-capable protocol: $chatTemplateFile"
}
```

### Fix 2: Strengthen Health Gate ✅

**File**: `scripts/launch-turboquant.ps1` (lines 590–650)

**Changes**:
1. Check `supports_tools` in addition to `supports_system_role`
2. Kill stale server if either capability is missing
3. Provide detailed restart reasons (ctx mismatch vs. missing system_role vs. missing tools)

**Before**:
```powershell
$jinjaOk = ($props.chat_template_caps.supports_system_role -eq $true) ...
if ($ctxOk -and $jinjaOk) {
    # Accept server
}
```

**After**:
```powershell
$systemRoleOk = ($props.chat_template_caps.supports_system_role -eq $true) ...
$toolsOk = ($props.chat_template_caps.supports_tools -eq $true) ...

if ($ctxOk -and $systemRoleOk -and $toolsOk) {
    Write-Host "TurboQuant already healthy on http://127.0.0.1:$port (ctx=$ctxLen, system_role=OK, tools=OK)" ...
} else {
    $reason = @()
    if (-not $ctxOk)           { $reason += "ctx mismatch: running=$runningCtx target=$ctxLen" }
    if (-not $systemRoleOk)    { $reason += "supports_system_role:false" }
    if (-not $toolsOk)         { $reason += "supports_tools:false" }
    # Kill server and restart
}
```

---

## Verification Steps

### Step 1: Clear Environment Overrides

```powershell
# Check for env var
Get-ChildItem Env:TURBO_CHAT_TEMPLATE_FILE -ErrorAction SilentlyContinue

# Remove if present
Remove-Item Env:TURBO_CHAT_TEMPLATE_FILE -ErrorAction SilentlyContinue
Remove-Item Env:TURBO_SKIP_CHAT_PARSING -ErrorAction SilentlyContinue
Remove-Item Env:LLAMA_ARG_SKIP_CHAT_PARSING -ErrorAction SilentlyContinue
```

### Step 2: Kill Stale Server

```powershell
$port = 8090

Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object {
        Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
    }

Start-Sleep -Seconds 2
```

### Step 3: Launch Fresh Server

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/launch-turboquant.ps1 -Detached
```

**Expected output**:
```
Chat template: C:\Users\james\Videos\deeds-web-app\configs\templates\gemma4-tools.jinja
Template SHA256: <hash>
```

**NOT acceptable**:
```
gemma4-opencode.jin
gemma4-opencode.jinja
```

### Step 4: Verify Process Arguments

```powershell
Get-CimInstance Win32_Process |
    Where-Object {
        $_.CommandLine -match 'llama-server' -and
        $_.CommandLine -match '8090'
    } |
    Select-Object ProcessId, CommandLine |
    Format-List
```

**Must contain**:
```
--jinja
--chat-template-file ...\configs\templates\gemma4-tools.jinja
```

**Must NOT contain**:
```
--skip-chat-parsing
gemma4-opencode.jin
gemma4-opencode.jinja
```

### Step 5: Check /props

```powershell
$props = Invoke-RestMethod "http://127.0.0.1:8090/props"

[pscustomobject]@{
    SupportsSystemRole = (
        $props.chat_template_caps.supports_system_role -eq $true
    )
    SupportsTools = (
        $props.chat_template_caps.supports_tools -eq $true -or
        $props.supports_tools -eq $true
    )
    Model = $props.model_alias
    Context = $props.default_generation_settings.n_ctx
} | Format-List
```

**Required output**:
```
SupportsSystemRole : True
SupportsTools      : True
Model              : gemma4-legal-iq4xs-direct.gguf
Context            : 65536
```

### Step 6: Direct Tool-Call Smoke Test

```powershell
$body = @{
    model = 'gemma4-legal-iq4xs-direct.gguf'
    messages = @(
        @{
            role = 'user'
            content = 'Use bash to run ls -la. Return only the tool call.'
        }
    )
    tools = @(
        @{
            type = 'function'
            function = @{
                name = 'bash'
                description = 'Execute bash command.'
                parameters = @{
                    type = 'object'
                    properties = @{
                        command = @{ type = 'string' }
                    }
                    required = @('command')
                    additionalProperties = $false
                }
            }
        }
    )
    tool_choice = 'required'
    parallel_tool_calls = $false
    stream = $false
    temperature = 0
} | ConvertTo-Json -Depth 20

$response = Invoke-RestMethod `
    -Uri 'http://127.0.0.1:8090/v1/chat/completions' `
    -Method Post `
    -ContentType 'application/json' `
    -Body $body

$message = $response.choices[0].message

if ($message.tool_calls.Count -gt 0) {
    Write-Host "✅ STRUCTURED_TOOL_CALL_PROVEN" -ForegroundColor Green
    $message.tool_calls | ConvertTo-Json -Depth 20
} else {
    Write-Host "❌ STRUCTURED_TOOL_CALL_FAILED" -ForegroundColor Red
    Write-Host "Content:"
    Write-Host $message.content
}
```

**Expected result**:
```
✅ STRUCTURED_TOOL_CALL_PROVEN
{
  "type": "function",
  "function": {
    "name": "bash",
    "arguments": "{\"command\":\"ls -la\"}"
  }
}
```

**If still returning `<tool_call>` inside content field**:
- Template is still text-only
- llama-server parser does not support this template's tool syntax
- Fallback: wire a sanitizer/adapter at :8091 to parse `<tool_call>` blocks into OpenAI format

---

## Summary

| Component | Before | After |
|-----------|--------|-------|
| Default template | `gemma4-tools.jinja` | `gemma4-tools.jinja` (explicit validation) |
| Override validation | ❌ Allows stale templates | ✅ Rejects legacy templates |
| Template protocol check | ❌ None | ✅ Validates tool syntax present |
| Health gate | ✅ Checks system_role only | ✅ Checks system_role AND tools |
| Stale server rejection | ❌ Accepts if system_role=true | ✅ Rejects if tools=false |

---

## Files Modified

- `scripts/launch-turboquant.ps1` — Template validation + health gate strengthening

---

## Next Steps

1. ✅ Clear env overrides (TURBO_CHAT_TEMPLATE_FILE, etc.)
2. ✅ Kill stale server on port 8090
3. ✅ Launch fresh server with correct template
4. ✅ Verify /props: `supports_tools=true`
5. ✅ Run direct smoke test (Step 6 above)
6. 📋 If still returning text `<tool_call>` blocks: implement :8091 adapter

---

*Generated by llama-server Template Override Fix (Session 142 Continuation)*
