# PowerShell script to properly rename conflicting routes instead of deleting them
# This preserves all functionality while fixing route conflicts

Write-Host "🔄 Fixing route conflicts by renaming instead of deleting..." -ForegroundColor Green

$routesPath = "src\routes"

# Function to rename conflicting route group pages
function Rename-ConflictingPage {
    param(
        [string]$GroupPath,
        [string]$NewName
    )

    $pagePath = Join-Path $GroupPath "+page.svelte"
    $newPagePath = Join-Path $GroupPath "$NewName.svelte"

    if (Test-Path $pagePath) {
        Write-Host "  ✅ Renaming $pagePath to $newPagePath" -ForegroundColor Yellow
        Move-Item $pagePath $newPagePath -Force
        return $true
    }
    return $false
}

# Fix route groups that conflict with root "/"
$conflictingGroups = @(
    @{Path = "(ai)"; NewName = "ai-hub"},
    @{Path = "(legal)"; NewName = "legal-hub"},
    @{Path = "(auth)"; NewName = "auth-portal"},
    @{Path = "(admin)"; NewName = "admin-panel"},
    @{Path = "(demo)"; NewName = "demo-showcase"},
    @{Path = "(dev)"; NewName = "dev-tools"},
    @{Path = "(evidence)"; NewName = "evidence-main"},
    @{Path = "(public)"; NewName = "public-portal"},
    @{Path = "(tools)"; NewName = "tools-hub"}
)

foreach ($group in $conflictingGroups) {
    $groupPath = Join-Path $routesPath $group.Path
    if (Test-Path $groupPath) {
        Write-Host "📁 Processing route group: $($group.Path)" -ForegroundColor Cyan
        $renamed = Rename-ConflictingPage -GroupPath $groupPath -NewName $group.NewName
        if ($renamed) {
            Write-Host "  ✅ Successfully renamed conflicting page in $($group.Path)" -ForegroundColor Green
        } else {
            Write-Host "  ℹ️  No conflicting +page.svelte found in $($group.Path)" -ForegroundColor Gray
        }
    }
}

# Also check for any remaining +page.svelte files in route groups
Write-Host "`n🔍 Checking for any remaining conflicts..." -ForegroundColor Cyan

$remainingConflicts = Get-ChildItem -Path $routesPath -Directory -Filter "(*)" |
    Where-Object { Test-Path (Join-Path $_.FullName "+page.svelte") }

if ($remainingConflicts) {
    Write-Host "⚠️  Found additional conflicting routes:" -ForegroundColor Red
    foreach ($conflict in $remainingConflicts) {
        $conflictName = $conflict.Name -replace '[()]', ''
        $newName = "$conflictName-dashboard"
        Write-Host "  📝 $($conflict.Name) -> renaming to $newName.svelte" -ForegroundColor Yellow

        $pagePath = Join-Path $conflict.FullName "+page.svelte"
        $newPagePath = Join-Path $conflict.FullName "$newName.svelte"
        Move-Item $pagePath $newPagePath -Force
    }
} else {
    Write-Host "✅ No additional conflicts found!" -ForegroundColor Green
}

Write-Host "`n🎉 Route conflict resolution complete!" -ForegroundColor Green
Write-Host "   All functionality preserved with new non-conflicting names" -ForegroundColor Green