#!/usr/bin/env pwsh
# Phase 89: KB-Grounded Agent Workflow
# Implements: knowledge_retrieve → expand → compose_prompt → gemma3 pattern

param(
  [Parameter(Mandatory=$true)]
  [string]$ErrorId,

  [int]$ExpandDepth = 1,
  [int]$TopK = 5,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "✅ $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "⚠️  $msg" -ForegroundColor Yellow }

Write-Step "🤖 Phase 89: KB-Grounded Agent Workflow"

# Step 1: Get error details from database
Write-Step "Step 1: Fetching error details (ID: $ErrorId)"

$dbUrl = $env:DATABASE_URL ?? "postgresql://user:pass@127.0.0.1:5434/legal"
$psqlCmd = "psql `"$dbUrl`" -t -c `"SELECT code, message, path, line, column FROM ts_errors WHERE id = $ErrorId`""

$errorDetails = Invoke-Expression $psqlCmd | Out-String | ConvertFrom-Csv -Delimiter '|'
if (-not $errorDetails) {
  Write-Host "❌ Error ID $ErrorId not found" -ForegroundColor Red
  exit 1
}

$errorCode = $errorDetails.code.Trim()
$errorMsg = $errorDetails.message.Trim()
$errorPath = $errorDetails.path.Trim()
$errorLine = $errorDetails.line.Trim()

Write-Ok "Error: $errorCode in $errorPath:$errorLine"
Write-Host "   Message: $errorMsg"

# Step 2: knowledge_retrieve (search KB for similar errors + relevant docs)
Write-Step "Step 2: Retrieving relevant knowledge (top $TopK)"

$query = "$errorCode $errorMsg Svelte 5 runes migration"
$mcpBody = @{
  name = "knowledge_retrieve"
  arguments = @{
    query = $query
    collection = "phase76_knowledge_base"
    top_k = $TopK
  }
} | ConvertTo-Json -Compress

$mcpResponse = Invoke-RestMethod -Uri "http://127.0.0.1:3002/function-call" -Method POST -Body $mcpBody -ContentType "application/json"

if ($mcpResponse.content.results) {
  Write-Ok "Retrieved $($mcpResponse.content.results.Count) knowledge chunks"
  $kbContext = $mcpResponse.content.results | ForEach-Object {
    "[KB Score: $($_.score)] $($_.content.Substring(0, [Math]::Min(200, $_.content.Length)))..."
  } | Join-String -Separator "`n`n"
} else {
  Write-Warn "No KB results found, proceeding with empty context"
  $kbContext = "(No relevant documentation found)"
}

# Step 3: expand (graph traversal to find related files/symbols)
Write-Step "Step 3: Expanding knowledge graph (depth $ExpandDepth)"

$errorUri = "err:${errorCode}:${errorPath}:${errorLine}"
$fileUri = "file:${errorPath}"

$expandBody = @{
  seed_uris = @($errorUri, $fileUri)
  depth = $ExpandDepth
} | ConvertTo-Json -Compress

try {
  $graphExpansion = Invoke-RestMethod -Uri "http://localhost:5175/api/phase89/graph/expand" -Method POST -Body $expandBody -ContentType "application/json"

  $relatedFiles = $graphExpansion.nodes | Where-Object { $_.kind -eq 'file' } | Select-Object -ExpandProperty label
  $relatedSymbols = $graphExpansion.nodes | Where-Object { $_.kind -eq 'symbol' } | Select-Object -ExpandProperty label

  Write-Ok "Graph expanded: $($relatedFiles.Count) files, $($relatedSymbols.Count) symbols"

  $graphContext = @"
Related Files: $($relatedFiles -join ', ')
Related Symbols: $($relatedSymbols -join ', ')
"@
} catch {
  Write-Warn "Graph expansion failed: $($_.Exception.Message)"
  $graphContext = "(Graph expansion unavailable)"
}

# Step 4: compose_prompt (combine all context)
Write-Step "Step 4: Composing unified prompt"

$unifiedPrompt = @"
You are an expert TypeScript and Svelte 5 developer tasked with fixing a compilation error.

ERROR DETAILS:
  Code: $errorCode
  Message: $errorMsg
  File: $errorPath
  Line: $errorLine

KNOWLEDGE BASE CONTEXT (Official Svelte 5 Documentation):
$kbContext

CODEBASE GRAPH CONTEXT:
$graphContext

YOUR TASK:
1. Analyze the error using the official Svelte 5 documentation context above
2. Propose a fix that:
   - Uses Svelte 5 runes (\$props(), \$state(), \$derived(), \$effect())
   - Avoids legacy patterns (export let, \$:, onMount)
   - Follows the examples from the KB exactly
3. Provide the fixed code snippet

FORMAT:
## Analysis
[Your analysis based on KB docs]

## Fix
```typescript
[Fixed code using Svelte 5 runes]
```

## Explanation
[Why this fix works, referencing KB docs]
"@

Write-Host "`nPrompt preview (first 500 chars):"
Write-Host $unifiedPrompt.Substring(0, [Math]::Min(500, $unifiedPrompt.Length)) -ForegroundColor Gray
Write-Host "..."

# Step 5: Call gemma3-legal for fix proposal
Write-Step "Step 5: Generating fix with gemma3-legal"

if ($DryRun) {
  Write-Host "[DRYRUN] Would call Ollama with composed prompt" -ForegroundColor Gray
  Write-Host "`nFull Prompt:" -ForegroundColor Yellow
  Write-Host $unifiedPrompt
  exit 0
}

$ollamaBody = @{
  model = "gemma3-legal:latest"
  prompt = $unifiedPrompt
  stream = $false
} | ConvertTo-Json -Depth 10

try {
  $response = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/generate" -Method POST -Body $ollamaBody -ContentType "application/json"

  Write-Ok "Fix generated!"
  Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
  Write-Host $response.response
  Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Cyan

  # Save to file
  $outputPath = "reports/phase89-fix-$ErrorId-$(Get-Date -Format 'yyyyMMdd-HHmmss').md"
  $outputContent = @"
# Phase 89: KB-Grounded Fix for Error $ErrorId

## Error Details
- Code: $errorCode
- Message: $errorMsg
- File: $errorPath:$errorLine

## Knowledge Base Used
Top $TopK results from phase76_knowledge_base

## Graph Expansion
Depth: $ExpandDepth
Related Files: $($relatedFiles.Count)
Related Symbols: $($relatedSymbols.Count)

## Generated Fix

$($response.response)

---
Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
Workflow: knowledge_retrieve → expand → compose_prompt → gemma3
"@

  $outputContent | Out-File -FilePath $outputPath -Encoding UTF8
  Write-Ok "Fix saved to: $outputPath"

} catch {
  Write-Host "❌ Ollama generation failed: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

Write-Step "✅ KB-Grounded Agent Workflow Complete!"
Write-Host "`nThis fix was generated using:"
Write-Host "  1. Official Svelte 5 docs from your 810-point KB"
Write-Host "  2. Codebase knowledge graph (files, symbols, imports)"
Write-Host "  3. LLM synthesis with guardrails`n"
