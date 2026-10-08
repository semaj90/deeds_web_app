$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$pythonRoot = Join-Path $repoRoot 'python'
$pythonExe = Join-Path $repoRoot '.venv/Scripts/python.exe'
$requirementsPath = Join-Path $pythonRoot 'requirements-oak-agent.txt'

if (-not (Test-Path -LiteralPath $pythonExe -PathType Leaf)) {
    throw 'OAK_AGENT_TEST_INTERPRETER_MISSING'
}

$expectedPrefix = (Resolve-Path (Join-Path $repoRoot '.venv')).Path
$actualPrefix = (& $pythonExe -c 'import sys; print(sys.prefix)')
if ($LASTEXITCODE -ne 0 -or [IO.Path]::GetFullPath($actualPrefix.Trim()) -ne $expectedPrefix) {
    throw 'OAK_AGENT_TEST_INTERPRETER_PREFIX_MISMATCH'
}

$expectedVersions = @{}
foreach ($line in Get-Content -LiteralPath $requirementsPath) {
    if ($line -match '^\s*(?<name>[A-Za-z0-9_.-]+)==(?<version>[A-Za-z0-9_.+-]+)\s*$') {
        $expectedVersions[$Matches.name] = $Matches.version
    }
}
if ($expectedVersions.Count -eq 0) {
    throw 'OAK_AGENT_REQUIREMENTS_PINNINGS_MISSING'
}

foreach ($name in $expectedVersions.Keys) {
    $actualVersion = (& $pythonExe -c "import importlib.metadata as m; print(m.version('$name'))")
    if ($LASTEXITCODE -ne 0 -or $actualVersion.Trim() -ne $expectedVersions[$name]) {
        throw "OAK_AGENT_PACKAGE_VERSION_MISMATCH:$name expected=$($expectedVersions[$name]) actual=$($actualVersion.Trim())"
    }
}

$previousPythonPath = $env:PYTHONPATH
try {
    $env:PYTHONPATH = $pythonRoot
    & $pythonExe -m unittest `
        oak_agent.test_grounded_nlp_fact_parity_v1 `
        python.tests.test_oak_agent_structured_contracts_v1 `
        python.tests.test_grounded_nlp_fact_dataclass_v1 -v
    if ($LASTEXITCODE -ne 0) {
        throw "OAK_AGENT_CONTRACT_TESTS_FAILED:$LASTEXITCODE"
    }
} finally {
    $env:PYTHONPATH = $previousPythonPath
}

Write-Output 'OAK_AGENT_CONTRACT_TESTS_PROVEN'
