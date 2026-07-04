[CmdletBinding()]
param(
    [int] $Port = 8091,
    [switch] $Detached
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$llama = Join-Path $env:USERPROFILE 'Desktop\llama-server-cuda\llama-server.exe'
$mainModel = if ($env:ROTORQUANT_MODEL_PATH) {
    $env:ROTORQUANT_MODEL_PATH
} else {
    Join-Path $repoRoot 'models\gemma4-legal-iq4xs-direct.gguf'
}
$draftModel = if ($env:MTP_DRAFT_MODEL) {
    $env:MTP_DRAFT_MODEL
} else {
    Join-Path $repoRoot '.tmp\google-gemma4-e4b-assistant\gemma-e4b-assistant-mtp-f16.gguf'
}
$mmproj = if ($env:TURBO_MMPROJ_PATH) {
    $env:TURBO_MMPROJ_PATH
} else {
    Join-Path $repoRoot 'models\mmproj-F16.gguf'
}
$chatTemplate = Join-Path $repoRoot 'configs\templates\gemma4-summary-clean.jinja'

foreach ($path in @($llama, $mainModel, $draftModel, $mmproj, $chatTemplate)) {
    if (-not (Test-Path $path)) {
        throw "Required path not found: $path"
    }
}

$args = @(
    '-m', $mainModel,
    '--mmproj', $mmproj,
    '--host', '127.0.0.1',
    '--port', "$Port",
    '-ngl', '99',
    '-fa', 'on',
    '-ctk', 'q8_0',
    '-ctv', 'q8_0',
    '-c', '16384',
    '-t', '16',
    '--parallel', '1',
    '--reasoning-format', 'none',
    '--reasoning-budget', '0',
    '--chat-template-file', $chatTemplate,
    '--jinja',
    '--cache-prompt',
    '--cache-reuse', '256',
    '--threads-batch', '16',
    '--model-draft', $draftModel,
    '--draft-max', '8',
    '--draft-min', '1',
    '--draft-p-min', '0.6',
    '--n-gpu-layers-draft', '99'
)

Write-Host "Gemma4 MTP benchmark launcher" -ForegroundColor Cyan
Write-Host "  Model:        $mainModel" -ForegroundColor Gray
Write-Host "  Draft model:  $draftModel" -ForegroundColor Gray
Write-Host "  Port:         $Port" -ForegroundColor Gray
Write-Host "  Llama server: $llama" -ForegroundColor Gray

if ($Detached) {
    Start-Process -FilePath $llama -ArgumentList $args -WindowStyle Hidden | Out-Null
    Write-Host "Started detached benchmark server on http://127.0.0.1:$Port" -ForegroundColor Green
} else {
    & $llama @args
}
