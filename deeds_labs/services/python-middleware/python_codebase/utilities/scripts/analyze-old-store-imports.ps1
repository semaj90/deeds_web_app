# ============================================================================
# Phase 8C: Analyze Old Store Imports in Components
# ============================================================================
# Purpose: Find all components importing from fragmented stores
# Output: JSON report with mapping of OLD → NEW imports
# ============================================================================

param(
    [string]$RoutesPath = "c:\Users\james\Videos\deeds-web-app\sveltekit-frontend\src\routes",
    [string]$OutputFile = "c:\Users\james\Videos\deeds-web-app\logs\store-import-analysis.json"
)

Write-Host "🔍 Analyzing old store imports in components..." -ForegroundColor Cyan

# Import mapping: OLD store → NEW unified store
$storeMapping = @{
    '$lib/stores/auth' = 'userStore'
    '$lib/stores/auth.svelte.ts' = 'userStore'
    '$lib/stores/sessionStore' = 'userStore'
    '$lib/stores/sessionStore.svelte' = 'userStore'
    '$lib/stores/notification' = 'notificationStore'
    '$lib/stores/notifications' = 'notificationStore'
    '$lib/stores/alerts' = 'notificationStore'
    '$lib/stores/toast' = 'notificationStore'
    '$lib/stores/citation' = 'citationStore'
    '$lib/stores/citations' = 'citationStore'
    '$lib/stores/legal-citations' = 'citationStore'
    '$lib/stores/cases' = 'caseStore'
    '$lib/stores/casesStore' = 'caseStore'
    '$lib/stores/case-filters' = 'caseStore'
    '$lib/stores/evidence' = 'evidenceStore'
    '$lib/stores/evidenceStore' = 'evidenceStore'
    '$lib/stores/upload' = 'evidenceStore'
    '$lib/stores/chain-of-custody' = 'evidenceStore'
    '$lib/stores/reports' = 'reportStore'
    '$lib/stores/reportStore' = 'reportStore'
    '$lib/stores/report-builder' = 'reportStore'
    '$lib/stores/legal-poi' = 'poiStore'
    '$lib/stores/poi-network' = 'poiStore'
    '$lib/stores/poi-analysis' = 'poiStore'
    '$lib/stores/timeline' = 'poiStore'
    '$lib/stores/search-store' = 'searchStore'
    '$lib/stores/command-search' = 'searchStore'
    '$lib/stores/vector-search' = 'searchStore'
    '$lib/stores/canvas-state' = 'canvasStore'
    '$lib/stores/canvas' = 'canvasStore'
    '$lib/stores/ai-assistant' = 'aiAssistantStore'
    '$lib/stores/ai-chat-store' = 'aiAssistantStore'
    '$lib/stores/ai-unified' = 'aiAssistantStore'
}

$results = @{
    timestamp = Get-Date -Format "o"
    totalFiles = 0
    filesWithImports = 0
    totalImports = 0
    components = @()
}

# Find all .svelte files in routes
$svelteFiles = Get-ChildItem -Path $RoutesPath -Filter "*.svelte" -Recurse -ErrorAction SilentlyContinue

Write-Host "📄 Found $($svelteFiles.Count) .svelte files" -ForegroundColor Yellow
$results.totalFiles = $svelteFiles.Count

foreach ($file in $svelteFiles) {
    $content = Get-Content $file.FullName -Raw
    $relativePath = $file.FullName -replace [regex]::Escape($RoutesPath), ""

    $foundImports = @()

    foreach ($oldStore in $storeMapping.Keys) {
        $pattern = "from\s+['\"]" + [regex]::Escape($oldStore) + "['\"]"
        if ($content -match $pattern) {
            $importLines = $content -split "`n" | Where-Object { $_ -match $pattern }

            foreach ($line in $importLines) {
                if ($line -match "import\s+\{\s*([^}]+)\s*\}\s+from") {
                    $imports = $matches[1] -split "," | ForEach-Object { $_.Trim() }
                    $foundImports += @{
                        oldStore = $oldStore
                        newStore = $storeMapping[$oldStore]
                        importedItems = @($imports)
                        line = $line.Trim()
                    }
                }
            }
        }
    }    if ($foundImports.Count -gt 0) {
        $results.filesWithImports++
        $results.totalImports += $foundImports.Count
        $results.components += @{
            file = $relativePath
            fullPath = $file.FullName
            imports = $foundImports
        }
    }
}

# Output summary
Write-Host "`n📊 Analysis Results:" -ForegroundColor Green
Write-Host "  Total .svelte files: $($results.totalFiles)" -ForegroundColor Cyan
Write-Host "  Files with old imports: $($results.filesWithImports)" -ForegroundColor Yellow
Write-Host "  Total old store imports: $($results.totalImports)" -ForegroundColor Yellow

# Save detailed results
$results | ConvertTo-Json -Depth 10 | Out-File -FilePath $OutputFile -Encoding UTF8
Write-Host "`n✅ Detailed analysis saved to: $OutputFile" -ForegroundColor Green

# Show sample
Write-Host "`n📋 Sample files needing migration:" -ForegroundColor Cyan
$results.components | Select-Object -First 5 | ForEach-Object {
    Write-Host "  - $($_.file)" -ForegroundColor Gray
    $_.imports | ForEach-Object {
        Write-Host "    $($_.line)" -ForegroundColor Gray
    }
}

Write-Host "`n✨ Migration data ready for Phase 8C!" -ForegroundColor Green
