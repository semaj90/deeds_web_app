<#
.SYNOPSIS
Migrate 20+ files from insecure locals.user?.id to secure getUserId(locals) pattern

.DESCRIPTION
This script performs a systematic migration of authentication patterns across the SvelteKit frontend:
1. Finds all files using locals.user?.id or locals.user.id
2. Adds import for getUserId utility if missing
3. Replaces insecure patterns with secure getUserId(locals) calls
4. Validates TypeScript compilation after changes

.EXAMPLE
.\scripts\migrate-to-getUserId.ps1 -DryRun
Shows what would be changed without making modifications

.EXAMPLE
.\scripts\migrate-to-getUserId.ps1 -Confirm
Performs migration with confirmation prompts for each file

.EXAMPLE
.\scripts\migrate-to-getUserId.ps1 -Auto
Performs migration automatically without prompts
#>

param(
    [switch]$DryRun,
    [switch]$Confirm,
    [switch]$Auto
)

$ErrorActionPreference = "Stop"
$workspaceRoot = "c:\Users\james\Videos\deeds-web-app\sveltekit-frontend"

Write-Host "🔐 Authentication Pattern Migration Tool" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Find all affected files
Write-Host "📂 Searching for files with insecure auth patterns..." -ForegroundColor Yellow

$affectedFiles = @()

# Pattern 1: locals.user?.id
$pattern1Files = Get-ChildItem -Path "$workspaceRoot\src" -Recurse -Filter "*.ts" |
    Select-String -Pattern "locals\.user\?\.id" -List |
    Select-Object -ExpandProperty Path -Unique

# Pattern 2: locals.user.id (without optional chaining)
$pattern2Files = Get-ChildItem -Path "$workspaceRoot\src" -Recurse -Filter "*.ts" |
    Select-String -Pattern "locals\.user\.id(?!\s*\?\?)" -List |
    Select-Object -ExpandProperty Path -Unique

$allFiles = ($pattern1Files + $pattern2Files) | Sort-Object -Unique

Write-Host "✅ Found $($allFiles.Count) files with insecure patterns:" -ForegroundColor Green
$allFiles | ForEach-Object {
    $relativePath = $_.Replace($workspaceRoot, "sveltekit-frontend").Replace("\", "/")
    Write-Host "   - $relativePath" -ForegroundColor Gray
}
Write-Host ""

if ($allFiles.Count -eq 0) {
    Write-Host "✨ No files need migration! All clean." -ForegroundColor Green
    exit 0
}

# Step 2: Analyze each file
Write-Host "🔍 Analyzing file patterns..." -ForegroundColor Yellow

$migrationPlan = @()

foreach ($filePath in $allFiles) {
    # Use -LiteralPath to handle brackets in file names
    if (-not (Test-Path -LiteralPath $filePath)) {
        Write-Host "  ⚠️  Skipping invalid path: $filePath" -ForegroundColor Yellow
        continue
    }

    $content = Get-Content -LiteralPath $filePath -Raw
    $relativePath = $filePath.Replace($workspaceRoot, "sveltekit-frontend").Replace("\", "/")

    # Count occurrences
    $pattern1Count = ([regex]::Matches($content, "locals\.user\?\.id")).Count
    $pattern2Count = ([regex]::Matches($content, "locals\.user\.id")).Count
    $totalOccurrences = $pattern1Count + $pattern2Count    # Check if getUserId is already imported
    $hasImport = $content -match "import\s+\{[^}]*getUserId[^}]*\}\s+from\s+['\`"].*auth.*['\`"]"

    # Check if auth/utils import exists
    $hasAuthUtilsImport = $content -match "import\s+\{[^}]*\}\s+from\s+['\`"]\$lib/server/auth/utils['\`"]"

    $migrationPlan += [PSCustomObject]@{
        FilePath = $filePath
        RelativePath = $relativePath
        Pattern1Count = $pattern1Count
        Pattern2Count = $pattern2Count
        TotalOccurrences = $totalOccurrences
        HasGetUserIdImport = $hasImport
        HasAuthUtilsImport = $hasAuthUtilsImport
        NeedsImportUpdate = -not $hasImport
    }
}

# Display migration plan
Write-Host ""
Write-Host "📋 Migration Plan:" -ForegroundColor Cyan
Write-Host "==================" -ForegroundColor Cyan
$migrationPlan | ForEach-Object {
    Write-Host ""
    Write-Host "File: $($_.RelativePath)" -ForegroundColor White
    Write-Host "  - locals.user?.id occurrences: $($_.Pattern1Count)" -ForegroundColor Gray
    Write-Host "  - locals.user.id occurrences: $($_.Pattern2Count)" -ForegroundColor Gray
    Write-Host "  - Total replacements needed: $($_.TotalOccurrences)" -ForegroundColor Yellow
    Write-Host "  - Has getUserId import: $(if ($_.HasGetUserIdImport) { 'Yes ✅' } else { 'No ❌' })" -ForegroundColor Gray
    Write-Host "  - Needs import update: $(if ($_.NeedsImportUpdate) { 'Yes' } else { 'No' })" -ForegroundColor Gray
}

Write-Host ""
Write-Host "📊 Summary:" -ForegroundColor Cyan
Write-Host "  - Files to migrate: $($migrationPlan.Count)" -ForegroundColor Yellow
Write-Host "  - Total replacements: $(($migrationPlan | Measure-Object -Property TotalOccurrences -Sum).Sum)" -ForegroundColor Yellow
Write-Host "  - Files needing import updates: $(($migrationPlan | Where-Object { $_.NeedsImportUpdate }).Count)" -ForegroundColor Yellow
Write-Host ""

if ($DryRun) {
    Write-Host "🏁 DRY RUN MODE - No changes made" -ForegroundColor Magenta
    exit 0
}

# Step 3: Perform migration
if (-not $Auto) {
    $response = Read-Host "Proceed with migration? (y/n)"
    if ($response -ne 'y') {
        Write-Host "❌ Migration cancelled" -ForegroundColor Red
        exit 0
    }
}

Write-Host ""
Write-Host "🚀 Starting migration..." -ForegroundColor Green

$successCount = 0
$failCount = 0

foreach ($plan in $migrationPlan) {
    try {
        Write-Host ""
        Write-Host "Processing: $($plan.RelativePath)" -ForegroundColor Cyan

        # Use -LiteralPath to handle brackets in file names
        $content = Get-Content -LiteralPath $plan.FilePath -Raw
        $originalContent = $content

        # Step 3.1: Add/update import
        if ($plan.NeedsImportUpdate) {
            if ($plan.HasAuthUtilsImport) {
                # Add getUserId to existing import
                $content = $content -replace "(import\s+\{)([^}]*)(}\s+from\s+['\`"]\$lib/server/auth/utils['\`"])", "`$1`$2, getUserId`$3"
                Write-Host "  ✅ Added getUserId to existing auth/utils import" -ForegroundColor Green
            } else {
                # Find best place to add import (after other imports)
                $importPattern = "(?m)^import\s+.*?;[\r\n]+"
                $lastImportMatch = [regex]::Matches($content, $importPattern) | Select-Object -Last 1

                if ($lastImportMatch) {
                    $insertPosition = $lastImportMatch.Index + $lastImportMatch.Length
                    $newImport = "import { getUserId } from '`$lib/server/auth/utils';`n"
                    $content = $content.Insert($insertPosition, $newImport)
                    Write-Host "  ✅ Added getUserId import" -ForegroundColor Green
                } else {
                    Write-Host "  ⚠️  Could not find import section - manual review needed" -ForegroundColor Yellow
                }
            }
        }

        # Step 3.2: Replace patterns with context-aware regex
        $replacements = 0

        # Pattern 1: Replace locals.user?.id (with optional chaining)
        # Match: userId: locals.user?.id, const x = locals.user?.id, getUserId(locals.user?.id)
        # Avoid: In strings, comments
        $pattern1 = "(?<!\/\/)(?<!['\`"])locals\.user\?\.id(?!['\`"])"
        $content = $content -replace $pattern1, "getUserId(locals)"
        $pattern1Count = ([regex]::Matches($originalContent, $pattern1)).Count
        $replacements += $pattern1Count

        # Pattern 2: Replace locals.user.id (without optional chaining)
        # More conservative - only replace when used as a value (after :, =, or in function calls)
        # Match: userId: locals.user.id, const x = locals.user.id, someFunc(locals.user.id)
        # Avoid: In comments, strings, or other contexts
        $pattern2 = "(?<!\/\/)(?<!['\`"])(?<=[:=,\(]\s*)locals\.user\.id(?!['\`"])"
        $content = $content -replace $pattern2, "getUserId(locals)"
        $pattern2Count = ([regex]::Matches($originalContent, $pattern2)).Count
        $replacements += $pattern2Count

        Write-Host "  ✅ Replaced $replacements occurrences (Pattern1: $pattern1Count, Pattern2: $pattern2Count)" -ForegroundColor Green        # Step 3.3: Save file
        if ($content -ne $originalContent) {
            Set-Content -LiteralPath $plan.FilePath -Value $content -NoNewline
            Write-Host "  💾 File saved" -ForegroundColor Green
            $successCount++
        } else {
            Write-Host "  ⚠️  No changes made" -ForegroundColor Yellow
        }

    } catch {
        Write-Host "  ❌ ERROR: $_" -ForegroundColor Red
        $failCount++
    }
}

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "✨ Migration Complete!" -ForegroundColor Green
Write-Host "  - Successfully migrated: $successCount files" -ForegroundColor Green
Write-Host "  - Failed: $failCount files" -ForegroundColor $(if ($failCount -eq 0) { "Green" } else { "Red" })
Write-Host ""

# Step 4: Run TypeScript check
Write-Host "🔍 Running TypeScript validation..." -ForegroundColor Yellow
Push-Location $workspaceRoot
try {
    $tscOutput = & npx tsc --noEmit --skipLibCheck 2>&1
    $tscExitCode = $LASTEXITCODE

    if ($tscExitCode -eq 0) {
        Write-Host "✅ TypeScript validation passed!" -ForegroundColor Green
    } else {
        Write-Host "⚠️  TypeScript validation found errors:" -ForegroundColor Yellow
        Write-Host $tscOutput -ForegroundColor Gray
        Write-Host ""
        Write-Host "Please review the errors above. Migration completed but type errors need attention." -ForegroundColor Yellow
    }
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "📝 Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Review migrated files for correctness" -ForegroundColor Gray
Write-Host "  2. Run tests: npm test" -ForegroundColor Gray
Write-Host "  3. Commit changes with descriptive message" -ForegroundColor Gray
Write-Host "  4. Update documentation if needed" -ForegroundColor Gray
Write-Host ""
