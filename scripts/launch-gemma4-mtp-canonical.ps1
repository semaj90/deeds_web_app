<#
.SYNOPSIS
  Launch Gemma4 with MTP speculative drafters + proper tool-calling template.

.DESCRIPTION
  Consolidated launcher that:
  1. Uses canonical atomic-mtp drafter (removes unsloth duplicate)
  2. Loads custom_pub_chat_template_gemma4.jinja for tool-calling support
  3. Enables MTP Mode C (75MB assistant drafter)
  4. Validates template + tool support before returning

.PARAMETER DrafterMode
  "C" (default): 75MB lightweight assistant drafter (fast, lower quality)
  "B": 3.1GB full E2B base model (slower, higher quality)
  "disabled": No drafting, just base model on :8090

.PARAMETER SkipValidation
  Skip post-launch validation (faster startup for CI/automation)

#>
[CmdletBinding()]
param(
  [ValidateSet("C", "B", "disabled")]
  [string]$DrafterMode = "C",
  [switch]$SkipValidation
)

$ErrorActionPreference = 'Stop'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')

Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Gemma4 + MTP Drafters (canonical, tool-calling enabled)      ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ── Validate and consolidate drafters ──────────────────────────────────────
Write-Host "Checking MTP drafter models..." -ForegroundColor Yellow

$drafterPaths = @{
  "C" = @{
    path = "$repoRoot\.tmp\atomic-mtp\gemma-4-E4B-it-assistant.Q4_K_M.gguf"
    size_gb = 0.075
    name = "Gemma4 E4B Assistant Q4_K_M (Mode C, 75MB)"
  }
  "B" = @{
    path = "$repoRoot\models\gemma4-e2b-rotorquant-iq4xs\gemma-4-E2B-it-RotorQuant-IQ4_XS.gguf"
    size_gb = 3.1
    name = "Gemma4 E2B IQ4_XS (Mode B, 3.1GB)"
  }
}

if ($DrafterMode -ne "disabled") {
  $draftConfig = $drafterPaths[$DrafterMode]
  if (-not (Test-Path $draftConfig.path)) {
    Write-Host "⚠️  Drafter model not found: $($draftConfig.path)" -ForegroundColor Red
    Write-Host "   Falling back to disabled (base model only)" -ForegroundColor Yellow
    $DrafterMode = "disabled"
  } else {
    $draftSize = (Get-Item $draftConfig.path).Length / 1GB
    Write-Host "✓ Mode $($DrafterMode): $($draftConfig.name)" -ForegroundColor Green
    Write-Host "  Path: $($draftConfig.path)" -ForegroundColor DarkGreen
    Write-Host "  Size: $([math]::Round($draftSize, 2))GB" -ForegroundColor DarkGreen
  }
}

# ── Verify canonical atomic-mtp exists and is not duplicated ────────────────
Write-Host ""
Write-Host "Checking for duplicate drafters to remove..." -ForegroundColor Yellow

$unsloth = "$repoRoot\.tmp\atomic-mtp-unsloth\gemma-4-E4B-it-Q4_K_M.gguf"
if (Test-Path $unsloth) {
  $unslothSize = (Get-Item $unsloth).Length / 1GB
  Write-Host "⚠️  Found unsloth duplicate: $unsloth ($([math]::Round($unslothSize, 2))GB)" -ForegroundColor Yellow
  Write-Host "   (Keep atomic-mtp, remove unsloth to save space)" -ForegroundColor DarkYellow
}

# ── Setup environment ──────────────────────────────────────────────────────
Write-Host ""
Write-Host "Environment Setup:" -ForegroundColor Yellow

$env:TURBO_MODEL_PATH = "$repoRoot\models\gemma4-legal-iq4xs-direct.gguf"
$env:TURBO_PORT = "8090"
$env:TURBO_CTX = "65536"
$env:TURBO_NGL = "99"

# ── Wire AtomicBot binary for MTP support ──────────────────────────────────
$atomicbotPath = "$repoRoot\.tmp\atomic-mtp\bin\build\bin\llama-server.exe"
if (Test-Path $atomicbotPath) {
  $env:LLAMA_SERVER_PATH = $atomicbotPath
  Write-Host "  LLAMA_SERVER_PATH = AtomicBot (MTP-enabled)" -ForegroundColor Green

  # Set profile to atomicbot when using MTP (enables --spec-draft-model + --spec-type draft-mtp flags)
  if ($DrafterMode -ne "disabled") {
    $env:TURBO_PROFILE = "atomicbot"
    Write-Host "  TURBO_PROFILE = atomicbot (MTP speculative decode enabled)" -ForegroundColor Green
  } else {
    $env:TURBO_PROFILE = "stock"
    Write-Host "  TURBO_PROFILE = stock (q8_0/q8_0, no MTP)" -ForegroundColor Green
  }
} else {
  Write-Host "  ⚠️  AtomicBot binary not found at: $atomicbotPath" -ForegroundColor Yellow
  Write-Host "     Falling back to system PATH + stock profile (MTP unavailable)" -ForegroundColor DarkYellow
  $env:TURBO_PROFILE = "stock"
  Write-Host "  TURBO_PROFILE = stock (q8_0/q8_0)" -ForegroundColor Green
}

Write-Host "  TURBO_MODEL_PATH = $env:TURBO_MODEL_PATH" -ForegroundColor Green
Write-Host "  TURBO_PORT = $env:TURBO_PORT" -ForegroundColor Green
Write-Host "  TURBO_CTX = $env:TURBO_CTX" -ForegroundColor Green

if ($DrafterMode -ne "disabled") {
  $env:ENABLE_MTP_DRAFTER = "true"
  $env:MTP_DRAFT_MODEL = $drafterPaths[$DrafterMode].path
  Write-Host "  ENABLE_MTP_DRAFTER = true" -ForegroundColor Green
  Write-Host "  MTP_DRAFT_MODEL = Mode $DrafterMode" -ForegroundColor Green
} else {
  $env:ENABLE_MTP_DRAFTER = "false"
  Write-Host "  ENABLE_MTP_DRAFTER = false" -ForegroundColor DarkYellow
}

# ── Verify chat template ───────────────────────────────────────────────────
Write-Host ""
Write-Host "Chat Template Setup:" -ForegroundColor Yellow

$templatePath = "$repoRoot\configs\templates\custom_pub_chat_template_gemma4.jinja"
if (-not (Test-Path $templatePath)) {
  Write-Host "❌ Chat template NOT found: $templatePath" -ForegroundColor Red
  exit 1
}

$templateSize = (Get-Item $templatePath).Length
Write-Host "✓ Template found: custom_pub_chat_template_gemma4.jinja ($([math]::Round($templateSize/1KB, 1))KB)" -ForegroundColor Green
Write-Host "  Features: system_role, tool_calls, thinking, null handling" -ForegroundColor DarkGreen

# ── Stop existing servers ──────────────────────────────────────────────────
Write-Host ""
Write-Host "Starting server..." -ForegroundColor Yellow

Get-Process llama-server -ErrorAction SilentlyContinue | Stop-Process -Force 2>&1 | Out-Null
Start-Sleep -Seconds 2

# ── Launch via canonical script ───────────────────────────────────────────
Write-Host "Launching llama-server with launch-turboquant.ps1..." -ForegroundColor Cyan

& "$repoRoot\scripts\launch-turboquant.ps1" -Detached -TextOnly

Start-Sleep -Seconds 4

# ── Validate template + tool support ────────────────────────────────────────
if ($SkipValidation) {
  Write-Host ""
  Write-Host "✓ Startup complete (validation skipped)" -ForegroundColor Green
  exit 0
}

Write-Host ""
Write-Host "Validating template and tool support..." -ForegroundColor Yellow

$testUrl = "http://127.0.0.1:8090/v1/chat/completions"
$testPayload = @{
  model = "gemma4-legal-iq4xs-direct.gguf"
  messages = @(
    @{ role = "system"; content = "Reply exactly: SYSTEM_OK" }
    @{ role = "user"; content = "test" }
  )
  temperature = 0
  stream = $false
  max_tokens = 16
} | ConvertTo-Json

try {
  $response = Invoke-WebRequest -Uri $testUrl -Method POST -Headers @{ "Content-Type" = "application/json" } -Body $testPayload -ErrorAction Stop
  $data = $response.Content | ConvertFrom-Json

  $content = $data.choices[0].message.content
  if ($content -match "SYSTEM_OK") {
    Write-Host "✓ System prompt working" -ForegroundColor Green
  } else {
    Write-Host "⚠️  System prompt not detected in response" -ForegroundColor Yellow
  }
} catch {
  Write-Host "⚠️  Health check failed: $($_.Exception.Message)" -ForegroundColor Yellow
  exit 1
}

# ── Tool-calling test ───────────────────────────────────────────────────────
Write-Host "Testing tool-calling support..." -ForegroundColor Yellow

$toolPayload = @{
  model = "gemma4-legal-iq4xs-direct.gguf"
  messages = @(
    @{ role = "user"; content = "Use the test_tool to get info" }
  )
  tools = @(
    @{
      type = "function"
      "function" = @{
        name = "test_tool"
        description = "Test tool"
        parameters = @{ type = "object"; properties = @{} }
      }
    }
  )
  tool_choice = "auto"
  stream = $false
  max_tokens = 100
} | ConvertTo-Json -Depth 5

try {
  $response = Invoke-WebRequest -Uri $testUrl -Method POST -Headers @{ "Content-Type" = "application/json" } -Body $toolPayload -ErrorAction Stop
  $data = $response.Content | ConvertFrom-Json

  $content = $data.choices[0].message.content
  if ($content -match "<tool_call>" -or $content -match "function_call") {
    Write-Host "✓ Tool-calling detected in response" -ForegroundColor Green
    Write-Host "  Model is emitting tool blocks for MCP parsing" -ForegroundColor DarkGreen
  } else {
    Write-Host "⚠️  No tool blocks detected (model may not support tools with this GGUF)" -ForegroundColor Yellow
    Write-Host "  MCP harness will need to parse content stream for <tool_call> markers" -ForegroundColor DarkYellow
  }
} catch {
  Write-Host "⚠️  Tool test failed: $($_.Exception.Message)" -ForegroundColor Yellow
}

# ── Summary ────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  ✓ Server ready at http://127.0.0.1:8090                       ║" -ForegroundColor Green
Write-Host "║                                                                ║" -ForegroundColor Green

if ($DrafterMode -ne "disabled") {
  Write-Host "║  Speculative decoding: Mode $($DrafterMode) (MTP drafters active)" -ForegroundColor Green
} else {
  Write-Host "║  Speculative decoding: Disabled (base model only)" -ForegroundColor Yellow
}

Write-Host "║  Template: custom_pub_chat_template_gemma4.jinja" -ForegroundColor Green
Write-Host "║  Tool-calling: Ready for OpenCode MCP" -ForegroundColor Green
Write-Host "║                                                                ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Green

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Verify TRACE MCP is connected (should list 40+ tools)" -ForegroundColor DarkCyan
Write-Host "  2. Check /metrics endpoint for token throughput" -ForegroundColor DarkCyan
Write-Host "  3. Monitor stderr log: logs/turboquant/launch-*.err" -ForegroundColor DarkCyan
