param(
  [string]$OpenCodeCommand = "opencode"
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "../..")
Set-Location $repoRoot

# Inline config has higher precedence than the project config and is merged by
# OpenCode. We add only the atlas-ldr MCP entry; the existing provider, agents,
# TRACE server, and permissions remain owned by opencode.json.
$ldrConfig = @{
  mcp = @{
    "atlas-ldr" = @{
      type = "local"
      command = @("node", "./sveltekit-frontend/scripts/mcp/atlas-ldr-mcp.mjs")
      enabled = $true
      timeout = 120000
      environment = @{
        ATLAS_LDR_OPENAI_BASE_URL = "http://127.0.0.1:8090/v1"
        ATLAS_LDR_OPENAI_API_KEY = "local"
        ATLAS_LDR_MODEL = "ornith-1.5-9b"
      }
    }
  }
}

$env:OPENCODE_CONFIG_CONTENT = ($ldrConfig | ConvertTo-Json -Depth 10 -Compress)

Write-Host "[atlas-ldr] additive MCP overlay enabled"
Write-Host "[atlas-ldr] server: node ./sveltekit-frontend/scripts/mcp/atlas-ldr-mcp.mjs"
Write-Host "[atlas-ldr] model owner remains Windows llama-server.exe :8090"
Write-Host "[atlas-ldr] no Docker/Valkey/Postgres/Qdrant services are stopped or replaced"

& $OpenCodeCommand
exit $LASTEXITCODE
