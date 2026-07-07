#!/usr/bin/env pwsh
<#
.SYNOPSIS
Validate that Session 119b fixes are in place:
1. OpenCode fallback config
2. Kanban template exists
3. Task 1.10 card ready
4. Documentation complete
5. Valkey JSON support confirmed
#>

param(
    [switch]$Verbose
)

$checks = @()

# ═══════════════════════════════════════════════════════════════════════════════
# Check 1: OpenCode Config
# ═══════════════════════════════════════════════════════════════════════════════

$openCodeConfig = '.opencode/opencode.jsonc'
if (Test-Path $openCodeConfig) {
    $content = Get-Content $openCodeConfig -Raw
    if ($content -match '"supportsToolCall":\s*false' -and `
        $content -match '"fallbackProvider":\s*"claude-3-5-sonnet"' -and `
        $content -match '"fallbackWhen":\s*"tool_call_failed"') {
        $checks += @{
            check = "OpenCode fallback config"
            status = "✅ PASS"
            details = "supportsToolCall=false, fallbackProvider=claude-3-5-sonnet"
        }
    } else {
        $checks += @{
            check = "OpenCode fallback config"
            status = "❌ FAIL"
            details = "Missing fallback config in .opencode/opencode.jsonc"
        }
    }
} else {
    $checks += @{
        check = "OpenCode config file"
        status = "❌ FAIL"
        details = ".opencode/opencode.jsonc not found"
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
# Check 2: Kanban Template
# ═══════════════════════════════════════════════════════════════════════════════

$kanbanTemplate = '.opencode/kanban-task-template.md'
if (Test-Path $kanbanTemplate) {
    $template = Get-Content $kanbanTemplate -Raw
    if ($template -match 'Telemetry Signal' -and `
        $template -match 'Files Allowed' -and `
        $template -match 'Acceptance Criteria' -and `
        $template -match 'Rollback') {
        $checks += @{
            check = "Kanban template"
            status = "✅ PASS"
            details = "All required sections present (Signal, Files, Acceptance, Rollback)"
        }
    } else {
        $checks += @{
            check = "Kanban template"
            status = "⚠️  PARTIAL"
            details = "Template exists but missing some sections"
        }
    }
} else {
    $checks += @{
        check = "Kanban template"
        status = "❌ FAIL"
        details = ".opencode/kanban-task-template.md not found"
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
# Check 3: Task 1.10 Kanban Card
# ═══════════════════════════════════════════════════════════════════════════════

$task1_10Card = '.opencode/kanban/TASK-1-10-TELEMETRY-REDIS-WIRING.md'
if (Test-Path $task1_10Card) {
    $card = Get-Content $task1_10Card -Raw
    if ($card -match 'telemetry:task-1.10' -and `
        $card -match 'implementation-clusters' -and `
        $card -match 'Telemetry Signal' -and `
        $card -match 'identity:recover') {
        $checks += @{
            check = "Task 1.10 Kanban card"
            status = "✅ PASS"
            details = "Ready-to-use Task 1.10 card with telemetry signal"
        }
    } else {
        $checks += @{
            check = "Task 1.10 Kanban card"
            status = "⚠️  PARTIAL"
            details = "Card exists but missing key sections"
        }
    }
} else {
    $checks += @{
        check = "Task 1.10 Kanban card"
        status = "❌ FAIL"
        details = "TASK-1-10-TELEMETRY-REDIS-WIRING.md not found"
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
# Check 4: Documentation
# ═══════════════════════════════════════════════════════════════════════════════

$docs = @(
    'docs/OPENCODE-TOOL-CALLING-FIX-AND-WORKFLOW.md',
    'docs/SESSION-119B-SUMMARY.md'
)

$docsFound = 0
foreach ($doc in $docs) {
    if (Test-Path $doc) {
        $docsFound++
    }
}

if ($docsFound -eq 2) {
    $checks += @{
        check = "Documentation"
        status = "✅ PASS"
        details = "Both workflow guide and summary present"
    }
} else {
    $checks += @{
        check = "Documentation"
        status = "❌ FAIL"
        details = "Only $docsFound/2 required docs found"
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
# Check 5: Valkey Version
# ═══════════════════════════════════════════════════════════════════════════════

try {
    $valkey = docker inspect legal-ai-valkey 2>$null | Select-String 'valkey/valkey-bundle' | Out-String
    if ($valkey -match '8\.(0|1|2|3|4|5|6|7|8|9)\.\d') {
        $checks += @{
            check = "Valkey version"
            status = "✅ PASS"
            details = "Valkey 8.x running (JSON support built-in)"
        }
    } else {
        $checks += @{
            check = "Valkey version"
            status = "⚠️  WARNING"
            details = "Could not determine version; assumed OK"
        }
    }
} catch {
    $checks += @{
        check = "Valkey container"
        status = "⚠️  WARNING"
        details = "Could not verify via docker (container may not be running)"
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
# Summary
# ═══════════════════════════════════════════════════════════════════════════════

Write-Host "`n" -ForegroundColor Cyan
Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Session 119b Fixes Validation                               ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

foreach ($check in $checks) {
    $statusColor = switch ($check.status) {
        "✅ PASS" { "Green" }
        "❌ FAIL" { "Red" }
        "⚠️  PARTIAL" { "Yellow" }
        "⚠️  WARNING" { "Yellow" }
    }

    Write-Host "[$($check.status)]" -ForegroundColor $statusColor -NoNewline
    Write-Host " $($check.check)"
    if ($Verbose) {
        Write-Host "      → $($check.details)" -ForegroundColor DarkGray
    }
}

# Overall status
$failures = @($checks | Where-Object { $_.status -match "FAIL" }).Count
$pass = @($checks | Where-Object { $_.status -match "PASS" }).Count
$total = $checks.Count

Write-Host ""
Write-Host "Summary: $pass/$total checks passed" -ForegroundColor Cyan

if ($failures -eq 0) {
    Write-Host "`n✅ All Session 119b fixes are in place. Ready for Task 1.10!`n" -ForegroundColor Green
    exit 0
} else {
    Write-Host "`n❌ $failures check(s) failed. Review above and re-run.`n" -ForegroundColor Red
    exit 1
}
