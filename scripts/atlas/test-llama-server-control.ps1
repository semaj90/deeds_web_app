$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'llama-server-control.ps1'
$parseErrors = $null
$tokens = $null
$syntax = [System.Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -gt 0) { throw ($parseErrors | Out-String) }
$functions = $syntax.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true)
foreach ($definition in $functions) { . ([scriptblock]::Create($definition.Extent.Text)) }
$passed = 0
function Expect-Rejection($Operation, $Expected) {
    try { & $Operation } catch { if ($_.Exception.Message -eq $Expected) { return }; throw }
    throw "Expected rejection: $Expected"
}
Assert-ScopedOwnership ([pscustomobject]@{ listenerPids = @(42); processIds = @(42) })
$passed++
Expect-Rejection { Assert-ScopedOwnership ([pscustomobject]@{ listenerPids = @(43); processIds = @(42) }) } 'PORT_8090_OWNED_BY_UNEXPECTED_PROCESS'
$passed++
Expect-Rejection { Assert-ScopedOwnership ([pscustomobject]@{ listenerPids = @(); processIds = @(42, 43) }) } 'AMBIGUOUS_LLAMA_PROCESS_8090'
$passed++
Assert-IdleSlots ([pscustomobject]@{ slots = @([pscustomobject]@{ is_processing = $false }) })
$passed++
foreach ($slots in @(@([pscustomobject]@{ is_processing = $true }), @([pscustomobject]@{ is_processing = 'false' }), @([pscustomobject]@{ id = 0 }))) {
    Expect-Rejection { Assert-IdleSlots ([pscustomobject]@{ slots = $slots }) } 'SLOT_BUSY_OR_UNKNOWN_REFUSING_STOP'
    $passed++
}
foreach ($slots in @($null, @())) {
    Expect-Rejection { Assert-IdleSlots ([pscustomobject]@{ slots = $slots }) } 'SLOTS_UNAVAILABLE_REFUSING_STOP'
    $passed++
}
$global:atlasLlamaFixture = @{ running = $false; busy = $false; foreignOwner = $false; stopCalls = 0; launchCalls = 0; model = 'gemma4-legal-iq4xs-direct.gguf'; vision = $false; launched = $null; launchedProfile = $null }
$statePath = Join-Path ([IO.Path]::GetTempPath()) "llama-restore-test-$PID.json"
if (Test-Path -LiteralPath $statePath) { throw 'TEST_STATE_FILE_ALREADY_EXISTS' }
function Get-NetTCPConnection { if ($global:atlasLlamaFixture.running) { [pscustomobject]@{ OwningProcess = $(if ($global:atlasLlamaFixture.foreignOwner) { 99 } else { 42 }) } } }
function Get-CimInstance { if ($global:atlasLlamaFixture.running -and -not $global:atlasLlamaFixture.foreignOwner) { [pscustomobject]@{ ProcessId = 42; CommandLine = 'llama-server.exe --port 8090' } } }
function Invoke-RestMethod {
    param($Uri)
    if ($Uri.EndsWith('/slots')) { return @([pscustomobject]@{ is_processing = $global:atlasLlamaFixture.busy }) }
    if ($Uri.EndsWith('/health')) { return @{ status = 'ok' } }
    if ($Uri.EndsWith('/props')) { return @{ modalities = @{ vision = $global:atlasLlamaFixture.vision } } }
    return @{ data = @(@{ id = $global:atlasLlamaFixture.model }) }
}
function nvidia-smi {
    $global:LASTEXITCODE = 0
    if ($global:atlasLlamaFixture.running) { 'GPU-fixture, 8192, 7000, 1192' } else { 'GPU-fixture, 8192, 1000, 7192' }
}
function Stop-Process {
    param($Id)
    if ($Id -ne 42) { throw 'UNSAFE_PID_IN_TEST' }
    $global:atlasLlamaFixture.stopCalls++
    $global:atlasLlamaFixture.running = $false
}
function pwsh {
    if ('-NoEvict' -notin $args -or '-Detached' -notin $args) { throw 'UNSAFE_LAUNCH_ARGUMENTS' }
    $global:atlasLlamaFixture.launchCalls++
    $global:atlasLlamaFixture.launchedProfile = $args[[Array]::IndexOf($args, '-StartupProfile') + 1]
    if ($global:atlasLlamaFixture.launched) { $global:atlasLlamaFixture.model = $global:atlasLlamaFixture.launched }
    $global:atlasLlamaFixture.running = $true
    $global:LASTEXITCODE = 0
}
function Run-Fixture($Action, [switch]$Confirm, $Profile) {
    $extra = @{ StatePath = $statePath }
    if ($Profile) { $extra.Profile = $Profile }
    $json = & $scriptPath -Action $Action -ConfirmControl:$Confirm @extra
    return $json | ConvertFrom-Json
}
$result = Run-Fixture 'unload'
if ($result.error -ne 'EXPLICIT_CONFIRMATION_REQUIRED' -or $global:atlasLlamaFixture.stopCalls -ne 0) { throw 'CONFIRMATION_GUARD_FAILED' }
$passed++
$result = Run-Fixture 'unload' -Confirm
if ($result.status -ne 'STOPPED' -or $null -ne $result.memoryReleaseObserved) { throw 'IDEMPOTENT_UNLOAD_FAILED' }
$passed++
$global:atlasLlamaFixture.running = $true
$global:atlasLlamaFixture.busy = $true
$result = Run-Fixture 'unload' -Confirm
if ($result.error -ne 'SLOT_BUSY_OR_UNKNOWN_REFUSING_STOP' -or $global:atlasLlamaFixture.stopCalls -ne 0) { throw ('BUSY_GUARD_FAILED: ' + ($result | ConvertTo-Json -Depth 8 -Compress)) }
$passed++
$global:atlasLlamaFixture.busy = $false
$global:atlasLlamaFixture.foreignOwner = $true
$result = Run-Fixture 'unload' -Confirm
if ($result.error -ne 'PORT_8090_OWNED_BY_UNEXPECTED_PROCESS' -or $global:atlasLlamaFixture.stopCalls -ne 0) { throw 'OWNERSHIP_GUARD_FAILED' }
$passed++
$global:atlasLlamaFixture.foreignOwner = $false
$result = Run-Fixture 'unload' -Confirm
if ($result.status -ne 'STOPPED' -or -not $result.memoryReleaseObserved -or $global:atlasLlamaFixture.stopCalls -ne 1 -or $result.memoryDeltas[0].freeMiBChange -ne 6000) { throw ('STOP_READBACK_FAILED: ' + ($result | ConvertTo-Json -Depth 8 -Compress)) }
$passed++
$result = Run-Fixture 'start' -Confirm
if ($result.status -ne 'RUNNING' -or $global:atlasLlamaFixture.launchCalls -ne 1) { throw ('START_READBACK_FAILED: ' + ($result | ConvertTo-Json -Depth 8 -Compress)) }
$passed++
$result = Run-Fixture 'start' -Confirm
if ($result.status -ne 'ALREADY_RUNNING' -or $global:atlasLlamaFixture.launchCalls -ne 1) { throw 'START_IDEMPOTENCY_FAILED' }
$passed++
# Restore follows what was running, never a hardcoded model.
if ($global:atlasLlamaFixture.launchedProfile -ne 'gemma4-legal-iq4xs') { throw 'GEMMA_RESTORE_PROFILE_FAILED' }
$passed++
$global:atlasLlamaFixture.model = 'ornith-1.5-9b'; $global:atlasLlamaFixture.vision = $true
$result = Run-Fixture 'unload' -Confirm
if ($result.restoreProfile -ne 'ornith-1.5-vlm') { throw 'ORNITH_VLM_IDENTIFY_FAILED' }
$result = Run-Fixture 'start' -Confirm
if ($result.status -ne 'RUNNING' -or $global:atlasLlamaFixture.launchedProfile -ne 'ornith-1.5-vlm' -or $result.profileSource -ne 'saved-by-unload') { throw ('SAVED_RESTORE_FAILED: ' + ($result | ConvertTo-Json -Depth 8 -Compress)) }
$passed++
# An unrecognised model is never stopped.
$global:atlasLlamaFixture.model = 'mystery-model.gguf'
$stopsBefore = $global:atlasLlamaFixture.stopCalls
$result = Run-Fixture 'unload' -Confirm
if ($result.error -ne 'RESTORE_PROFILE_UNIDENTIFIED_REFUSING_STOP' -or $global:atlasLlamaFixture.stopCalls -ne $stopsBefore) { throw 'UNIDENTIFIED_GUARD_FAILED' }
$passed++
# A running server that is not the requested profile is a failure, not a success or a restart.
$launchesBefore = $global:atlasLlamaFixture.launchCalls
$result = Run-Fixture 'start' -Confirm -Profile 'gemma4-legal-iq4xs'
if ($result.error -ne 'START_READBACK_NOT_VERIFIED' -or $global:atlasLlamaFixture.launchCalls -ne $launchesBefore) { throw 'MISMATCH_GUARD_FAILED' }
$passed++
# A launcher that brings up the wrong model fails readback.
$global:atlasLlamaFixture.running = $false; $global:atlasLlamaFixture.vision = $false; $global:atlasLlamaFixture.launched = 'ornith-1.5-9b'
$result = Run-Fixture 'start' -Confirm -Profile 'gemma4-legal-iq4xs'
if ($result.error -ne 'START_READBACK_NOT_VERIFIED') { throw 'WRONG_MODEL_LOADED_GUARD_FAILED' }
$passed++
Remove-Item -LiteralPath $statePath -Confirm:$false
# With nothing saved, the default is Gemma text.
$global:atlasLlamaFixture.running = $false; $global:atlasLlamaFixture.launched = 'gemma4-legal-iq4xs-direct.gguf'
$result = Run-Fixture 'start' -Confirm
if ($result.status -ne 'RUNNING' -or $result.profileSource -ne 'default' -or $global:atlasLlamaFixture.launchedProfile -ne 'gemma4-legal-iq4xs') { throw 'DEFAULT_PROFILE_FAILED' }
$passed++
# The load percentage is only an estimate: unknown without a reference, and never 100.
. ([scriptblock]::Create(($functions | Where-Object { $_.Name -eq 'Get-LoadPercentEstimate' }).Extent.Text))
if ((Get-LoadPercentEstimate 3000 1000 $null) -ne -1) { throw 'UNKNOWN_ESTIMATE_FAILED' }
if ((Get-LoadPercentEstimate 9000 1000 6000) -ne 95) { throw 'ESTIMATE_CAP_FAILED' }
if ((Get-LoadPercentEstimate 3500 1000 6000) -ne 50) { throw 'ESTIMATE_MIDPOINT_FAILED' }
if ((Format-ProgressLine 'X' 50 'd') -notmatch '\[#####-----\]') { throw 'BAR_FAILED' }
$passed++
# The progress path launches in the background, polls until the launcher exits, then reads back.
$global:atlasLlamaFixture.running = $false; $global:atlasLlamaFixture.polls = 0
function Start-Process {
    param([Parameter(Position = 0)]$FilePath, [switch]$PassThru, $WindowStyle, $RedirectStandardOutput, $RedirectStandardError, $ArgumentList)
    if ('-NoEvict' -notin $ArgumentList -or '-Detached' -notin $ArgumentList) { throw 'UNSAFE_LAUNCH_ARGUMENTS' }
    $process = [pscustomobject]@{ Handle = 1; ExitCode = $global:atlasLlamaFixture.exitCode }
    $process | Add-Member -MemberType ScriptProperty -Name HasExited -Value {
        $global:atlasLlamaFixture.polls++
        if ($global:atlasLlamaFixture.polls -lt 3) { return $false }
        if ($this.ExitCode -eq 0) { $global:atlasLlamaFixture.running = $true }
        return $true
    }
    return $process
}
function Start-Sleep { }
$global:atlasLlamaFixture.exitCode = 0
$result = (& $scriptPath -Action start -ConfirmControl -ShowProgress -StatePath $statePath) | ConvertFrom-Json
if ($result.status -ne 'RUNNING' -or $global:atlasLlamaFixture.polls -lt 3) { throw ('PROGRESS_START_FAILED: ' + ($result | ConvertTo-Json -Depth 8 -Compress)) }
$passed++
$global:atlasLlamaFixture.running = $false; $global:atlasLlamaFixture.polls = 0; $global:atlasLlamaFixture.exitCode = 1
$result = (& $scriptPath -Action start -ConfirmControl -ShowProgress -StatePath $statePath) | ConvertFrom-Json
if ($result.status -ne 'ERROR' -or $result.error -notlike 'LAUNCHER_FAILED_SEE_*') { throw 'PROGRESS_FAILURE_NOT_REPORTED' }
$passed++
# switch: fake model files in a temp root; the fake launcher serves what the chosen profile should serve.
$modelRoot = Join-Path ([IO.Path]::GetTempPath()) "llama-models-test-$PID"
foreach ($relative in 'gemma4-legal-iq4xs-direct.gguf', 'ornith-1_5-9b-ad-q5_k-q4_k/hforf.gguf') {
    New-Item -ItemType File -Force -Path (Join-Path $modelRoot $relative) | Out-Null
}
$global:atlasLlamaFixture.failProfile = $null
function pwsh {
    if ('-NoEvict' -notin $args -or '-Detached' -notin $args) { throw 'UNSAFE_LAUNCH_ARGUMENTS' }
    $chosen = $args[[Array]::IndexOf($args, '-StartupProfile') + 1]
    $global:atlasLlamaFixture.launchCalls++
    $global:atlasLlamaFixture.launchedProfile = $chosen
    if ($chosen -eq $global:atlasLlamaFixture.failProfile) { $global:LASTEXITCODE = 1; return }
    $global:atlasLlamaFixture.model = if ($chosen -like 'ornith*') { 'ornith-1.5-9b' } else { 'gemma4-legal-iq4xs-direct.gguf' }
    $global:atlasLlamaFixture.running = $true
    $global:LASTEXITCODE = 0
}
function Run-Switch($Target) {
    $extra = @{ StatePath = $statePath; ModelRoot = $modelRoot }
    if ($Target) { $extra.Profile = $Target }
    return (& $scriptPath -Action switch -ConfirmControl @extra) | ConvertFrom-Json
}
function Reset-ToGemma {
    $global:atlasLlamaFixture.running = $true; $global:atlasLlamaFixture.busy = $false; $global:atlasLlamaFixture.vision = $false
    $global:atlasLlamaFixture.model = 'gemma4-legal-iq4xs-direct.gguf'; $global:atlasLlamaFixture.failProfile = $null
    $global:atlasLlamaFixture.stopCalls = 0; $global:atlasLlamaFixture.launchCalls = 0
}
Reset-ToGemma
$result = Run-Switch $null
if ($result.error -ne 'SWITCH_REQUIRES_EXPLICIT_PROFILE' -or $global:atlasLlamaFixture.stopCalls -ne 0) { throw 'SWITCH_PROFILE_REQUIRED_FAILED' }
$passed++
$result = Run-Switch 'ornith-1.5-vlm'
if ($result.error -notlike 'TARGET_MODEL_MISSING_REFUSING_STOP*' -or $global:atlasLlamaFixture.stopCalls -ne 0) { throw 'MISSING_TARGET_GUARD_FAILED' }
$passed++
$result = Run-Switch 'gemma4-legal-iq4xs'
if ($result.status -ne 'ALREADY_RUNNING' -or $global:atlasLlamaFixture.stopCalls -ne 0 -or $global:atlasLlamaFixture.launchCalls -ne 0) { throw 'SWITCH_NOOP_FAILED' }
$passed++
$global:atlasLlamaFixture.busy = $true
$result = Run-Switch 'ornith-1.5'
if ($result.error -ne 'SLOT_BUSY_OR_UNKNOWN_REFUSING_STOP' -or $global:atlasLlamaFixture.stopCalls -ne 0) { throw 'SWITCH_BUSY_GUARD_FAILED' }
$passed++
Reset-ToGemma
$result = Run-Switch 'ornith-1.5'
$savedState = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
if ($result.status -ne 'RUNNING' -or $result.previousProfile -ne 'gemma4-legal-iq4xs' -or $result.after.modelId -ne 'ornith-1.5-9b' -or $global:atlasLlamaFixture.stopCalls -ne 1 -or $savedState.restoreProfile -ne 'ornith-1.5') { throw ('SWITCH_SUCCESS_FAILED: ' + ($result | ConvertTo-Json -Depth 8 -Compress)) }
$passed++
Reset-ToGemma
$global:atlasLlamaFixture.failProfile = 'ornith-1.5'
$result = Run-Switch 'ornith-1.5'
if ($result.status -ne 'ERROR' -or $result.rolledBack -ne $true -or $result.after.modelId -ne 'gemma4-legal-iq4xs-direct.gguf' -or $global:atlasLlamaFixture.launchCalls -ne 2) { throw ('ROLLBACK_FAILED: ' + ($result | ConvertTo-Json -Depth 8 -Compress)) }
$passed++
Remove-Item -LiteralPath $statePath -Confirm:$false
Remove-Item -LiteralPath $modelRoot -Recurse -Force -Confirm:$false
@{ schema = 'atlas.llama-runtime-guard-tests.v1'; passed = $passed; serviceMutations = 0; io = 'mocked' } | ConvertTo-Json -Compress
