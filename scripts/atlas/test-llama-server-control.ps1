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
$global:atlasLlamaFixture = @{ running = $false; busy = $false; foreignOwner = $false; stopCalls = 0; launchCalls = 0 }
function Get-NetTCPConnection { if ($global:atlasLlamaFixture.running) { [pscustomobject]@{ OwningProcess = $(if ($global:atlasLlamaFixture.foreignOwner) { 99 } else { 42 }) } } }
function Get-CimInstance { if ($global:atlasLlamaFixture.running -and -not $global:atlasLlamaFixture.foreignOwner) { [pscustomobject]@{ ProcessId = 42; CommandLine = 'llama-server.exe --port 8090' } } }
function Invoke-RestMethod {
    param($Uri)
    if ($Uri.EndsWith('/slots')) { return @([pscustomobject]@{ is_processing = $global:atlasLlamaFixture.busy }) }
    if ($Uri.EndsWith('/health')) { return @{ status = 'ok' } }
    return @{ data = @(@{ id = 'ornith-1.5-9b' }) }
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
    $global:atlasLlamaFixture.running = $true
    $global:LASTEXITCODE = 0
}
function Run-Fixture($Action, [switch]$Confirm) {
    $json = & $scriptPath -Action $Action -ConfirmControl:$Confirm
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
@{ schema = 'atlas.llama-runtime-guard-tests.v1'; passed = $passed; serviceMutations = 0; io = 'mocked' } | ConvertTo-Json -Compress
