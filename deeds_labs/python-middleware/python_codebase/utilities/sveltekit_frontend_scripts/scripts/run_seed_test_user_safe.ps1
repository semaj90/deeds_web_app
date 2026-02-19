Param (
    [string]$DbUrl = "postgresql://postgres:123456@localhost:5432/legal_ai_db",
    [string]$TestEmail = "test@example.com",
    [string]$TestPassword = "secret123",
    [switch]$AutoYes,
    [switch]$AutoCreateIndex,
    [switch]$VerboseOutput
)

Set-StrictMode -Version Latest

function Run-Psql {
    param(
        [string]$Database,
        [string[]]$Args
    )
    # Build argument list for Start-Process
    $argList = @($Database) + $Args
    if ($VerboseOutput) { Write-Host "RUN: psql $($argList -join ' ')" }

    $outFile = [System.IO.Path]::GetTempFileName()
    $errFile = [System.IO.Path]::GetTempFileName()
    $psi = @{ FilePath = 'psql'; ArgumentList = $argList; NoNewWindow = $true; Wait = $true; RedirectStandardOutput = $outFile; RedirectStandardError = $errFile }
    try {
        $proc = Start-Process @psi -PassThru
    } catch {
        Write-Error "Failed to start psql: $_"
        return 99
    }
    $exit = $proc.ExitCode
    $stdout = Get-Content $outFile -Raw -ErrorAction SilentlyContinue
    $stderr = Get-Content $errFile -Raw -ErrorAction SilentlyContinue
    if ($stdout) { Write-Host $stdout }
    if ($stderr) { Write-Host $stderr }
    Remove-Item $outFile,$errFile -ErrorAction SilentlyContinue
    return $exit
}

if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
    Write-Error "psql not found in PATH. Install PostgreSQL client or add psql to PATH."
    exit 2
}

$scriptDir = Split-Path -Path $MyInvocation.MyCommand.Definition -Parent
Set-Location (Join-Path $scriptDir "..") | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupDir = "scripts\backups"
if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir | Out-Null }
$backupFile = "$backupDir\users_backup_$timestamp.csv"

Write-Host "Backing up users table to: $backupFile"

# Check existence of table; create minimal dev-safe table if missing
# Use a temporary SQL file to avoid complex quoting when checking for table existence
$tempCheck = [System.IO.Path]::GetTempFileName() + ".sql"
Set-Content -Path $tempCheck -Value "SELECT to_regclass('public.users');" -Encoding UTF8
$out = & psql $DbUrl -t -A -f $tempCheck 2>&1
Remove-Item $tempCheck -ErrorAction SilentlyContinue
$tableCheck = ($out | Out-String) -replace '\s',''
if (-not $tableCheck) {
    Write-Host "public.users not found. Creating minimal table schema..."
    $createSql = "CREATE TABLE IF NOT EXISTS public.users (id uuid PRIMARY KEY, email text, password_hash text, created_at timestamptz DEFAULT now());"
    $rc = Run-Psql $DbUrl @('-c', $createSql)
    if ($rc -ne 0) { Write-Error "Failed to create public.users table (psql exit $rc)"; exit 3 }
}

# Backup using psql \copy to a local file
$copyCmd = "\\copy public.users TO '$backupFile' CSV HEADER;"
$rc = Run-Psql $DbUrl @('-c', $copyCmd)
if ($rc -ne 0) {
    Write-Warning "Backup command returned exit code $rc. Continuing cautiously."
} else {
    Write-Host "Backup created: $backupFile"
}

# Build seed SQL
$seedSql = @"
DO $$
BEGIN
    IF EXISTS (
        SELECT email
        FROM public.users
        GROUP BY email
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Duplicate emails exist in users table. Resolve before proceeding.';
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx
ON public.users(email);

CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO public.users (id, email, password_hash, created_at)
VALUES (
    gen_random_uuid(),
    '$TestEmail',
    crypt('$TestPassword', gen_salt('bf')),
    NOW()
)
ON CONFLICT (email) DO NOTHING;

SELECT id, email, created_at FROM public.users WHERE email = '$TestEmail';
"@

$tempFile = [System.IO.Path]::GetTempFileName() + ".sql"
Set-Content -Path $tempFile -Value $seedSql -Encoding UTF8

Write-Host "Running seed script..."
$execRc = Run-Psql $DbUrl @('-f', $tempFile)
if ($execRc -ne 0) {
    Write-Error "Seeding failed (psql exit code $execRc). See psql output above for details."
    Remove-Item $tempFile -ErrorAction SilentlyContinue
    exit $execRc
}

Remove-Item $tempFile -ErrorAction SilentlyContinue
Write-Host "Seed completed. If the user already existed the INSERT was skipped (ON CONFLICT DO NOTHING)."

exit 0
