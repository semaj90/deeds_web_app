<#
.SYNOPSIS
  9-Layer Import Audit — finds ALL dependency patterns that standard grep misses.
.DESCRIPTION
  Detects static ESM, dynamic ESM, CJS require, @vite-ignore variable imports,
  SvelteKit auto-routes, fetch wiring, component registries, barrel re-exports,
  event coupling, and store subscriptions.
.PARAMETER Module
  The module/component name to audit (e.g., "AnalysisPanel", "webgpu", "tts").
.PARAMETER Full
  Run all 10 layers. Default runs L1-L4 + L8-L9 (the most impactful).
.PARAMETER Directory
  Source directory to search. Default: src/
.EXAMPLE
  .\scripts\audit-9layer-imports.ps1 -Module AnalysisPanel
  .\scripts\audit-9layer-imports.ps1 -Module webgpu -Full
  .\scripts\audit-9layer-imports.ps1   # scans ALL components for orphans
#>
param(
    [string]$Module = "",
    [switch]$Full,
    [string]$Directory = "sveltekit-frontend/src",
    [switch]$OrphanScan
)

$ErrorActionPreference = "Continue"
$root = Split-Path $PSScriptRoot -Parent

function Write-Layer {
    param([string]$Layer, [string]$Description, [string]$Status, [int]$Count)
    $color = if ($Count -gt 0) { "Green" } elseif ($Status -eq "SKIP") { "DarkGray" } else { "Yellow" }
    $icon = if ($Count -gt 0) { "+" } elseif ($Status -eq "SKIP") { "~" } else { "-" }
    Write-Host "  [$icon] $Layer : $Description " -NoNewline
    Write-Host "($Count hits)" -ForegroundColor $color
}

function Search-Layer {
    param([string]$Pattern, [string]$Dir)
    $results = @()
    try {
        $output = & rg $Pattern "$Dir" --type ts --type-add 'svelte:*.svelte' --type svelte -l 2>$null
        if ($output) { $results = @($output) }
    } catch {}
    return $results
}

function Audit-Module {
    param([string]$Name)

    Write-Host "`n  Auditing: " -NoNewline
    Write-Host "$Name" -ForegroundColor Cyan
    Write-Host "  $('─' * 60)"

    $srcDir = Join-Path $root $Directory
    $total = 0

    # L1: Static ESM imports
    $l1 = Search-Layer "from.*['\`"].*$Name" $srcDir
    Write-Layer "L1 Static ESM   " "import { X } from '.../$Name'" "CHECK" $l1.Count
    $total += $l1.Count

    # L2: Dynamic ESM imports
    $l2 = Search-Layer "import\(.*$Name" $srcDir
    Write-Layer "L2 Dynamic ESM   " "await import('.../$Name')" "CHECK" $l2.Count
    $total += $l2.Count

    # L3: CJS require
    $l3 = Search-Layer "require\(.*$Name" $srcDir
    Write-Layer "L3 CJS require   " "require('.../$Name')" "CHECK" $l3.Count
    $total += $l3.Count

    # L4: Variable dynamic imports (@vite-ignore)
    $l4 = @()
    try {
        $viteIgnoreFiles = & rg "@vite-ignore" "$srcDir" -l 2>$null
        if ($viteIgnoreFiles) {
            foreach ($f in $viteIgnoreFiles) {
                $content = Get-Content $f -Raw -ErrorAction SilentlyContinue
                if ($content -match $Name) { $l4 += $f }
            }
        }
    } catch {}
    Write-Layer "L4 @vite-ignore  " "Variable-based dynamic import" "CHECK" $l4.Count
    $total += $l4.Count

    # L5: SvelteKit auto-discovery (route files)
    $l5Skip = $false
    if ($Name -match '^\+page|^\+layout|^\+server|^\+error') {
        Write-Layer "L5 SvelteKit route" "Auto-discovered by router" "CHECK" 1
        $total += 1
        $l5Skip = $true
    } else {
        if ($Full) {
            Write-Layer "L5 SvelteKit route" "Not a route file" "SKIP" 0
        }
    }

    # L6: fetch() wiring (API routes referenced by client fetch calls)
    if ($Full -or $Name -match 'api|server') {
        $l6 = Search-Layer "fetch\(.*$Name" $srcDir
        Write-Layer "L6 fetch() wiring" "Client-side fetch references" "CHECK" $l6.Count
        $total += $l6.Count
    }

    # L7: Component registries/maps (string-keyed lookups)
    if ($Full) {
        $l7 = Search-Layer "(componentMap|registry|loadComponent).*$Name" $srcDir
        Write-Layer "L7 Registry map  " "String-keyed component lookup" "CHECK" $l7.Count
        $total += $l7.Count
    }

    # L8: Barrel re-export chains
    $l8 = Search-Layer "export.*from.*$Name" $srcDir
    $l8Barrel = @()
    foreach ($f in $l8) {
        if ($f -match 'index\.(ts|js)$') { $l8Barrel += $f }
    }
    Write-Layer "L8 Barrel exports " "Re-exported via index.ts" "CHECK" $l8Barrel.Count
    # Check if barrel itself is imported
    foreach ($barrel in $l8Barrel) {
        $barrelDir = Split-Path $barrel -Parent | Split-Path -Leaf
        $barrelConsumers = Search-Layer "from.*$barrelDir['\`"]" $srcDir
        if ($barrelConsumers.Count -eq 0) {
            Write-Host "     ⚠ Barrel $barrelDir/index.ts has 0 consumers — dead chain!" -ForegroundColor Red
        } else {
            $total += $barrelConsumers.Count
        }
    }

    # L9: Event coupling (CustomEvent, addEventListener, yorha: namespace)
    $l9 = @()
    try {
        $eventFiles = & rg "(CustomEvent|addEventListener|dispatchEvent).*$Name" "$srcDir" -l 2>$null
        if ($eventFiles) { $l9 = @($eventFiles) }
        $yorhaFiles = & rg "yorha:.*$Name" "$srcDir" -l 2>$null
        if ($yorhaFiles) { $l9 += @($yorhaFiles) }
    } catch {}
    $l9 = $l9 | Select-Object -Unique
    Write-Layer "L9 Event coupling" "CustomEvent / addEventListener" "CHECK" $l9.Count
    $total += $l9.Count

    # L10: Store subscriptions (.svelte.ts consumers)
    if ($Full) {
        $l10 = Search-Layer "from.*$Name.*\.svelte" $srcDir
        Write-Layer "L10 Store subs   " ".svelte.ts store consumers" "CHECK" $l10.Count
        $total += $l10.Count
    }

    # Summary
    Write-Host "  $('─' * 60)"
    if ($total -eq 0) {
        Write-Host "  RESULT: " -NoNewline
        Write-Host "ORPHAN CANDIDATE" -ForegroundColor Red
        Write-Host "  → 0 consumers across all layers. Safe to archive (verify manually)."
    } else {
        Write-Host "  RESULT: " -NoNewline
        Write-Host "WIRED ($total total references)" -ForegroundColor Green
    }

    # Show file list if not too many
    $allFiles = @($l1) + @($l2) + @($l3) + @($l4) + @($l9) | Where-Object { $_ } | Select-Object -Unique
    if ($allFiles.Count -gt 0 -and $allFiles.Count -le 15) {
        Write-Host "`n  Consumers:"
        foreach ($f in $allFiles) {
            $rel = $f -replace [regex]::Escape($root + "\"), ""
            Write-Host "    • $rel" -ForegroundColor DarkCyan
        }
    }

    return @{ Name = $Name; Total = $total; IsOrphan = ($total -eq 0) }
}

# ════════════════════════════════════════════════════════════════════
# Main
# ════════════════════════════════════════════════════════════════════

Write-Host "`n╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  9-Layer Import Audit                                       ║" -ForegroundColor Cyan
Write-Host "║  L1:Static L2:Dynamic L3:CJS L4:ViteIgnore L5:Route        ║" -ForegroundColor Cyan
Write-Host "║  L6:Fetch L7:Registry L8:Barrel L9:Events L10:Stores       ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan

if ($Module) {
    Audit-Module -Name $Module
} elseif ($OrphanScan) {
    # Scan all components for orphans
    Write-Host "`n  Scanning all lib/components/ for orphans..." -ForegroundColor Yellow
    $componentDir = Join-Path $root "$Directory/lib/components"
    $svelteFiles = Get-ChildItem -Path $componentDir -Filter "*.svelte" -Recurse -ErrorAction SilentlyContinue
    $orphans = @()
    $wired = 0

    foreach ($file in $svelteFiles) {
        $name = $file.BaseName
        # Skip route files
        if ($name -match '^\+') { continue }
        $result = Audit-Module -Name $name
        if ($result.IsOrphan) { $orphans += $name }
        else { $wired++ }
    }

    Write-Host "`n╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║  ORPHAN SCAN SUMMARY                                        ║" -ForegroundColor Cyan
    Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host "  Wired: $wired  |  Orphan candidates: $($orphans.Count)"
    if ($orphans.Count -gt 0) {
        Write-Host "`n  Orphan candidates:" -ForegroundColor Yellow
        foreach ($o in $orphans) {
            Write-Host "    ✗ $o" -ForegroundColor Red
        }
    }
} else {
    Write-Host "`n  Usage:" -ForegroundColor Yellow
    Write-Host "    .\scripts\audit-9layer-imports.ps1 -Module <name>    # Audit specific module"
    Write-Host "    .\scripts\audit-9layer-imports.ps1 -OrphanScan       # Scan all components"
    Write-Host "    .\scripts\audit-9layer-imports.ps1 -Module <name> -Full  # All 10 layers"
    Write-Host ""
}
