param(
    [string]$AuditScript = "..\scripts\atlas\audit-contract-map.mjs",
    [switch]$Json,
    [switch]$InstallDotenv
)

$ErrorActionPreference = "Stop"

function Test-NodeResolve {
    param(
        [string]$PackageName,
        [string]$FromPath
    )
    $escapedFrom = $FromPath.Replace('\', '\\').Replace("'", "\'")
    $check = "const { createRequire } = require('node:module'); const req = createRequire('$escapedFrom'); try { req.resolve('$PackageName'); process.exit(0); } catch { process.exit(1); }"
    node -e $check | Out-Null
    return $LASTEXITCODE -eq 0
}

$resolvedAuditScript = Resolve-Path -LiteralPath $AuditScript -ErrorAction SilentlyContinue
if (-not $resolvedAuditScript) {
    throw "Atlas audit script not found: $AuditScript"
}

$auditScriptPath = $resolvedAuditScript.Path

if (-not (Test-NodeResolve -PackageName "dotenv" -FromPath $auditScriptPath)) {
    if (-not $InstallDotenv) {
        throw "dotenv is not resolvable from the Atlas audit script path: $auditScriptPath. Re-run with -InstallDotenv to install it in the parent repo package scope."
    }
    $auditRepoRoot = Resolve-Path -LiteralPath (Join-Path (Split-Path -Parent $auditScriptPath) "..\..")
    npm install dotenv --save-dev --prefix $auditRepoRoot.Path
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$nodeArgs = @(
    "--require",
    "dotenv/config",
    $auditScriptPath
)

if ($Json) {
    $nodeArgs += "--json"
}

node @nodeArgs
exit $LASTEXITCODE
