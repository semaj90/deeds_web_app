# Phase 8C: Analyze Old Store Imports - Simplified
# Find all components importing from fragmented stores

param(
    [string]$RoutesPath = "c:\Users\james\Videos\deeds-web-app\sveltekit-frontend\src\routes"
)

$oldStores = @(
    "from '\$lib/stores/auth",
    "from '\$lib/stores/notification",
    "from '\$lib/stores/evidence",
    "from '\$lib/stores/citation",
    "from '\$lib/stores/cases",
    "from '\$lib/stores/reports",
    "from '\$lib/stores/poi",
    "from '\$lib/stores/search",
    "from '\$lib/stores/canvas",
    "from '\$lib/stores/ai"
)

Write-Host "Finding components with old store imports..." -ForegroundColor Cyan
$count = 0

Get-ChildItem -Path $RoutesPath -Filter "*.svelte" -Recurse | ForEach-Object {
    $file = $_
    $content = Get-Content $file.FullName -Raw

    foreach ($oldStore in $oldStores) {
        if ($content -like "*$oldStore*") {
            $count++
            $relativePath = $file.FullName.Replace($RoutesPath, "").TrimStart("\")
            Write-Host "  $relativePath - uses: $oldStore" -ForegroundColor Yellow
            break
        }
    }
}

Write-Host "`nTotal components with old imports: $count" -ForegroundColor Green
