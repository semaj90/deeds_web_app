#!/usr/bin/env pwsh
<#
.SYNOPSIS
Apply PostgreSQL migration scripts to Phase 66 PostgreSQL

.DESCRIPTION
Applies SQL migration files to the PostgreSQL database using docker exec.
Handles the PowerShell < operator limitation by using Get-Content piping.
#>

param(
    [Parameter(Mandatory=$false)]
    [string]$MigrationFile = "sveltekit-frontend/drizzle/migrations/phase89_timeline_tables.sql",

    [Parameter(Mandatory=$false)]
    [string]$Database = "legal",

    [Parameter(Mandatory=$false)]
    [string]$User = "user"
)

$ErrorActionPreference = "Stop"

Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "PostgreSQL Migration Applicator" -ForegroundColor Cyan
Write-Host "=" * 70

# Check if migration file exists
if (-not (Test-Path $MigrationFile)) {
    Write-Host "❌ Migration file not found: $MigrationFile" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "📄 Migration file: $MigrationFile" -ForegroundColor Yellow
Write-Host "🗄️  Database: $Database" -ForegroundColor Yellow
Write-Host "👤 User: $User" -ForegroundColor Yellow

# Read migration file
$sqlContent = Get-Content $MigrationFile -Raw

# Apply migration via docker exec with stdin
Write-Host ""
Write-Host "🔄 Applying migration..." -ForegroundColor Yellow

try {
    $sqlContent | docker exec -i phase66-postgres psql -U $User -d $Database 2>&1 |
        Select-String -Pattern "CREATE|INSERT|ALTER|ERROR|NOTICE" |
        Select-Object -First 50

    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ Migration applied successfully!" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "⚠️  Migration completed with warnings (exit code: $LASTEXITCODE)" -ForegroundColor Yellow
    }
} catch {
    Write-Host ""
    Write-Host "❌ Migration failed: $_" -ForegroundColor Red
    exit 1
}

# Verify tables created
Write-Host ""
Write-Host "🔍 Verifying tables..." -ForegroundColor Yellow

$verification = @"
\dt phase89_*
"@ | docker exec -i phase66-postgres psql -U $User -d $Database 2>&1

Write-Host $verification

Write-Host ""
Write-Host "=" * 70 -ForegroundColor Green
Write-Host "Migration process complete!" -ForegroundColor Green
Write-Host "=" * 70
