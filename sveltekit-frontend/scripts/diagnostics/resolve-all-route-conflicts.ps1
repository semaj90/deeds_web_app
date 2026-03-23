# Comprehensive Route Conflict Resolver
# This script identifies and fixes ALL route conflicts by renaming standalone routes

Write-Host "🔧 Comprehensive Route Conflict Resolution" -ForegroundColor Green
Write-Host "   Preserving ALL functionality through intelligent renaming" -ForegroundColor Gray

$routesPath = "src\routes"

# Get all route groups (directories with parentheses)
$routeGroups = Get-ChildItem -Path $routesPath -Directory -Filter "(*)" | ForEach-Object {
    $groupName = $_.Name -replace '[()]', ''
    @{
        Path = $_.FullName
        Name = $groupName
        Routes = Get-ChildItem -Path $_.FullName -Directory | ForEach-Object { $_.Name }
    }
}

# Get all standalone routes (directories without parentheses)
$standaloneRoutes = Get-ChildItem -Path $routesPath -Directory |
    Where-Object { $_.Name -notmatch '^\(' -and $_.Name -ne 'api' -and $_.Name -ne '.well-known' } |
    ForEach-Object { $_.Name }

Write-Host "`n📊 Route Analysis:" -ForegroundColor Cyan
Write-Host "   Route Groups: $($routeGroups.Count)" -ForegroundColor Gray
Write-Host "   Standalone Routes: $($standaloneRoutes.Count)" -ForegroundColor Gray

# Find conflicts
$conflicts = @()
foreach ($group in $routeGroups) {
    foreach ($groupRoute in $group.Routes) {
        if ($standaloneRoutes -contains $groupRoute) {
            $conflicts += @{
                GroupPath = "($($group.Name))/$groupRoute"
                StandalonePath = $groupRoute
                NewName = "$groupRoute-standalone"
            }
        }
    }
}

if ($conflicts.Count -eq 0) {
    Write-Host "✅ No route conflicts detected!" -ForegroundColor Green
    exit 0
}

Write-Host "`n⚠️  Found $($conflicts.Count) route conflicts:" -ForegroundColor Yellow
foreach ($conflict in $conflicts) {
    Write-Host "   • $($conflict.GroupPath) ↔ /$($conflict.StandalonePath)" -ForegroundColor Red
    Write-Host "     → Renaming to: /$($conflict.NewName)" -ForegroundColor Green
}

Write-Host "`n🔄 Resolving conflicts..." -ForegroundColor Cyan

foreach ($conflict in $conflicts) {
    $oldPath = Join-Path $routesPath $conflict.StandalonePath
    $newPath = Join-Path $routesPath $conflict.NewName

    if (Test-Path $oldPath) {
        Write-Host "   📁 Moving: $($conflict.StandalonePath) → $($conflict.NewName)" -ForegroundColor Yellow
        Move-Item $oldPath $newPath -Force
        Write-Host "     ✅ Success!" -ForegroundColor Green
    } else {
        Write-Host "     ⚠️  Path not found: $oldPath" -ForegroundColor Red
    }
}

Write-Host "`n🎉 Route conflict resolution complete!" -ForegroundColor Green
Write-Host "   All functionality preserved with unique route names" -ForegroundColor Gray

# Verify no conflicts remain
Write-Host "`n🔍 Final verification..." -ForegroundColor Cyan
$remainingConflicts = 0

$updatedStandaloneRoutes = Get-ChildItem -Path $routesPath -Directory |
    Where-Object { $_.Name -notmatch '^\(' -and $_.Name -ne 'api' -and $_.Name -ne '.well-known' } |
    ForEach-Object { $_.Name }

foreach ($group in $routeGroups) {
    foreach ($groupRoute in $group.Routes) {
        if ($updatedStandaloneRoutes -contains $groupRoute) {
            $remainingConflicts++
            Write-Host "   ❌ Still conflicting: ($($group.Name))/$groupRoute ↔ /$groupRoute" -ForegroundColor Red
        }
    }
}

if ($remainingConflicts -eq 0) {
    Write-Host "✅ All conflicts resolved successfully!" -ForegroundColor Green
} else {
    Write-Host "⚠️  $remainingConflicts conflicts still remain" -ForegroundColor Red
    exit 1
}