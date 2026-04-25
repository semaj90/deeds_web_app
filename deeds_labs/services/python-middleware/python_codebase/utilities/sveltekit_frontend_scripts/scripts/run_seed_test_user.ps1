<#
scripts/run_seed_test_user.ps1
Wrapper to run scripts/seed_add_test_user.sql with safety checks.
Usage: Open PowerShell in the repo and run:
  .\scripts\run_seed_test_user.ps1
This script will prompt for a Postgres connection URI (psql-compatible). It will:
  - Check whether `public.users` exists
  - Check whether `password_hash` column exists
  - Offer to add `password_hash` (text) if missing
  - Run the seed SQL file
#>

param(
    [string]$DbUrl = '',
    [switch]$AutoYes,
    [switch]$AutoCreateIndex
)

$defaultDb = 'postgresql://postgres:123456@localhost:5432/legal_ai_db'
# If DbUrl not provided, prompt unless AutoYes is set
if ([string]::IsNullOrWhiteSpace($DbUrl)) {
    if ($AutoYes) {
        $dbUrl = $defaultDb
        Write-Host "Using default DB URI (auto): $dbUrl" -ForegroundColor Cyan
    } else {
        Write-Host "Enter Postgres connection URI (press Enter for default):" -NoNewline
        $dbUrl = Read-Host
        if ([string]::IsNullOrWhiteSpace($dbUrl)) { $dbUrl = $defaultDb }
        Write-Host "Using DB URI: $dbUrl" -ForegroundColor Cyan
    }
} else {
    $dbUrl = $DbUrl
    Write-Host "Using DB URI: $dbUrl" -ForegroundColor Cyan
}

Write-Host "Using DB URI: $dbUrl" -ForegroundColor Cyan

# Check connectivity / psql availability
try {
    $ver = & psql --version 2>$null
} catch {
    Write-Error "psql tool not found in PATH. Install PostgreSQL client tools or add psql to PATH."
    exit 1
}

# Helper to run psql and capture trimmed output
function Run-PSQL($uri, $sql) {
    # Use -d for connection string and pass the SQL as a single argument to -c
    $cmd = @('-d', $uri, '-t', '-A', '-c', $sql)
    $output = & psql @cmd 2>&1
    return $output
}

# Check if users table exists
$tableCheckSql = "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='users' LIMIT 1;"
$tableResp = Run-PSQL $dbUrl $tableCheckSql
$tableResp = $tableResp -join "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
if ($tableResp -contains '1') {
    Write-Host "Found existing table: public.users" -ForegroundColor Green
} else {
    Write-Host "No existing public.users table found — the seed script will create one if needed." -ForegroundColor Yellow
}

# Check for password_hash column
$colCheckSql = "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='password_hash';"
$colResp = Run-PSQL $dbUrl $colCheckSql
$colResp = $colResp -join "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
if ($colResp -contains 'password_hash') {
    Write-Host "Column 'password_hash' exists on public.users" -ForegroundColor Green
} else {
    Write-Warning "Column 'password_hash' not found on public.users."
    if ($AutoYes) { $choice = 'y' } else { $choice = Read-Host "Add column 'password_hash' (text) to public.users now? (y/N)" }
    if ($choice -match '^[Yy]') {
        Write-Host "Adding column password_hash (text) to public.users..." -ForegroundColor Cyan
        $alterSql = "ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash text;"
        $alterOut = Run-PSQL $dbUrl $alterSql
        Write-Host $alterOut
        # Do not rely solely on $LASTEXITCODE because Run-PSQL captures output; instead check for ERROR in output
        if ($alterOut -join "`n" | Select-String -Pattern "ERROR") {
            Write-Error "Failed to ALTER TABLE public.users. Inspect output above."; exit 1
        }
        Write-Host "Column added (or already existed)." -ForegroundColor Green
    } else {
        Write-Host "Skipping column addition. The seed script may fail if the existing users table does not accept the insert." -ForegroundColor Yellow
        $confirm = Read-Host "Continue and run seed script anyway? (y/N)"
        if (!($confirm -match '^[Yy]')) { Write-Host "Aborting."; exit 0 }
    }
}

# Before running seed SQL, ensure there's a unique constraint/index on email (required by ON CONFLICT (email))
$uniqueCheckSql = "SELECT 1 FROM pg_constraint con JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey) WHERE con.conrelid = 'public.users'::regclass AND con.contype = 'u' AND att.attname = 'email' LIMIT 1;"
$uniqueResp = Run-PSQL $dbUrl $uniqueCheckSql
$uniqueResp = $uniqueResp -join "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
if ($uniqueResp -contains '1') {
    Write-Host "Unique constraint on public.users(email) exists." -ForegroundColor Green
} else {
    Write-Warning "No unique constraint on public.users(email) detected. The seed SQL uses ON CONFLICT (email) and requires a unique constraint or index."
    # Check for duplicate emails
    $dupCheckSql = "SELECT email, count(*) AS cnt FROM public.users GROUP BY email HAVING count(*) > 1 LIMIT 5;"
    $dupResp = Run-PSQL $dbUrl $dupCheckSql
    $dupResp = $dupResp -join "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
    if ($dupResp) {
        Write-Error "Found duplicate emails (sample):`n$dupResp`nCannot safely create unique index until duplicates are resolved. Aborting."; exit 1
    }

    # Backup users table before making schema changes
    $ts = (Get-Date).ToString('yyyyMMdd_HHmmss')
    $backupDir = 'scripts/backups'
    if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir | Out-Null }
    $backupFile = "$backupDir\users_backup_$ts.csv"
    Write-Host "Creating backup of public.users to $backupFile" -ForegroundColor Cyan
    $copySql = "\copy (SELECT * FROM public.users) TO '$backupFile' WITH CSV HEADER;"
    $copyOut = Run-PSQL $dbUrl $copySql
    Write-Host $copyOut
    if ($copyOut -join "`n" | Select-String -Pattern "ERROR") {
        Write-Error "Backup failed. Aborting."; exit 1
    }
    Write-Host "Backup created." -ForegroundColor Green

    if ($AutoCreateIndex) { $createChoice = 'y' } elseif ($AutoYes) { $createChoice = 'y' } else { $createChoice = Read-Host "Create UNIQUE index on public.users(email) now to support ON CONFLICT? (y/N)" }
    if ($createChoice -match '^[Yy]') {
        Write-Host "Creating unique index users_email_unique_idx on public.users(email)..." -ForegroundColor Cyan
        $createIdxSql = "CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON public.users(email);"
        $createOut = Run-PSQL $dbUrl $createIdxSql
        Write-Host $createOut
        if ($createOut -join "`n" | Select-String -Pattern "ERROR") {
            Write-Error "Failed to create unique index. Inspect output above."; exit 1
        }
        Write-Host "Unique index created (or already existed)." -ForegroundColor Green
    } else {
        Write-Host "Proceeding without creating unique index. Seed may fail with ON CONFLICT error." -ForegroundColor Yellow
        $confirmProceed = Read-Host "Continue and run seed script anyway? (y/N)"
        if (!($confirmProceed -match '^[Yy]')) { Write-Host "Aborting."; exit 0 }
    }
}

# Run the seed SQL file
$scriptPath = "scripts/seed_add_test_user.sql"
if (-not (Test-Path $scriptPath)) { Write-Error "Seed SQL file not found at $scriptPath"; exit 1 }

Write-Host "Running seed script: $scriptPath" -ForegroundColor Cyan
# Use -d to pass the connection string
$runOut = & psql -d $dbUrl -f $scriptPath 2>&1
Write-Host $runOut
if ($runOut -join "`n" | Select-String -Pattern "ERROR") {
    Write-Error "psql reported errors while running the seed script. Inspect output above."; exit 1
}

Write-Host "Seed script completed." -ForegroundColor Green
<#
scripts/run_seed_test_user.ps1
Wrapper to run scripts/seed_add_test_user.sql with safety checks.
Usage: Open PowerShell in the repo and run:
  .\scripts\run_seed_test_user.ps1
This script will prompt for a Postgres connection URI (psql-compatible). It will:
  - Check whether public.users exists
  - Check whether password_hash column exists
  - Offer to add password_hash (text) if missing
  - Backup public.users before creating uniqueness constraints
  - Run the seed SQL file
#>

param()

$defaultDb = 'postgresql://postgres:123456@localhost:5432/legal_ai_db'
Write-Host "Enter Postgres connection URI (press Enter for default):" -NoNewline
$dbUrl = Read-Host
if ([string]::IsNullOrWhiteSpace($dbUrl)) { $dbUrl = $defaultDb }

Write-Host "Using DB URI: $dbUrl" -ForegroundColor Cyan

# Check connectivity / psql availability
try {
    $ver = & psql --version 2>$null
} catch {
    Write-Error "psql tool not found in PATH. Install PostgreSQL client tools or add psql to PATH."
    exit 1
}

# Helper to run psql and capture output as array of trimmed lines
function Run-PSQL($uri, $sql) {
    $cmd = @('-d', $uri, '-t', '-A', '-c', $sql)
    $raw = & psql @cmd 2>&1
    if ($raw -eq $null) { return @() }
    $lines = $raw -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
    return ,$lines
}

# Check if users table exists
$tableCheckSql = "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='users' LIMIT 1;"
$tableResp = Run-PSQL $dbUrl $tableCheckSql
if ($tableResp -contains '1') {
    Write-Host "Found existing table: public.users" -ForegroundColor Green
} else {
    Write-Host "No existing public.users table found — the seed script will create one if needed." -ForegroundColor Yellow
}

# Check for password_hash column
$colCheckSql = "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='password_hash';"
$colResp = Run-PSQL $dbUrl $colCheckSql
if ($colResp -contains 'password_hash') {
    Write-Host "Column 'password_hash' exists on public.users" -ForegroundColor Green
} else {
    Write-Warning "Column 'password_hash' not found on public.users."
    $choice = Read-Host "Add column 'password_hash' (text) to public.users now? (y/N)"
    if ($choice -match '^[Yy]') {
        Write-Host "Adding column password_hash (text) to public.users..." -ForegroundColor Cyan
        $alterSql = "ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash text;"
        $alterOut = Run-PSQL $dbUrl $alterSql
        if ($alterOut -match 'ERROR') {
            Write-Error "Failed to ALTER TABLE public.users. Inspect output above."; exit 1
        }
        Write-Host "Column added (or already existed)." -ForegroundColor Green
    } else {
        Write-Host "Skipping column addition. The seed script may fail if the existing users table does not accept the insert." -ForegroundColor Yellow
        $confirm = Read-Host "Continue and run seed script anyway? (y/N)"
        if (!($confirm -match '^[Yy]')) { Write-Host "Aborting."; exit 0 }
    }
}

# Ensure unique constraint/index on email exists or can be created safely
$uniqueCheckSql = "SELECT 1 FROM pg_constraint con JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey) WHERE con.conrelid = 'public.users'::regclass AND con.contype = 'u' AND att.attname = 'email' LIMIT 1;"
$uniqueResp = Run-PSQL $dbUrl $uniqueCheckSql
if ($uniqueResp -contains '1') {
    Write-Host "Unique constraint on public.users(email) exists." -ForegroundColor Green
} else {
    Write-Warning "No unique constraint on public.users(email) detected. The seed SQL uses ON CONFLICT (email) and requires a unique constraint or index."
    # Check for duplicate emails
    $dupCheckSql = "SELECT email, count(*) AS cnt FROM public.users GROUP BY email HAVING count(*) > 1 LIMIT 5;"
    $dupResp = Run-PSQL $dbUrl $dupCheckSql
    if ($dupResp.Count -gt 0) {
        Write-Error "Found duplicate emails (sample):`n$($dupResp -join "`n")`nCannot safely create unique index until duplicates are resolved. Aborting."; exit 1
    }

    # Backup users table before making schema changes
    $ts = (Get-Date).ToString('yyyyMMdd_HHmmss')
    $backupDir = 'scripts/backups'
    if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir | Out-Null }
    $backupFile = "$backupDir\users_backup_$ts.csv"
    Write-Host "Creating backup of public.users to $backupFile" -ForegroundColor Cyan
    $copySql = "\copy (SELECT * FROM public.users) TO '$backupFile' WITH CSV HEADER;"
    $copyOut = Run-PSQL $dbUrl $copySql
    if ($copyOut -match 'ERROR') {
        Write-Error "Backup failed. Aborting."; exit 1
    }
    Write-Host "Backup created." -ForegroundColor Green

    $createChoice = Read-Host "Create UNIQUE index on public.users(email) now to support ON CONFLICT? (y/N)"
    if ($createChoice -match '^[Yy]') {
        Write-Host "Creating unique index users_email_unique_idx on public.users(email)..." -ForegroundColor Cyan
        $createIdxSql = "CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON public.users(email);"
        $createOut = Run-PSQL $dbUrl $createIdxSql
    if ($createOut -match 'ERROR') {
            Write-Error "Failed to create unique index. Inspect output above."; exit 1
        }
        Write-Host "Unique index created (or already existed)." -ForegroundColor Green
    } else {
        Write-Host "Proceeding without creating unique index. Seed may fail with ON CONFLICT error." -ForegroundColor Yellow
        $confirmProceed = Read-Host "Continue and run seed script anyway? (y/N)"
        if (!($confirmProceed -match '^[Yy]')) { Write-Host "Aborting."; exit 0 }
    }
}

# Run the seed SQL file
$scriptPath = "scripts/seed_add_test_user.sql"
if (-not (Test-Path $scriptPath)) { Write-Error "Seed SQL file not found at $scriptPath"; exit 1 }

Write-Host "Running seed script: $scriptPath" -ForegroundColor Cyan
$runRaw = & psql -d $dbUrl -f $scriptPath 2>&1
if ($runRaw -match 'ERROR') {
    Write-Host $runRaw
    Write-Error "psql reported errors while running the seed script. Inspect output above."; exit 1
}
Write-Host $runRaw
Write-Host "Seed script completed." -ForegroundColor Green
<#
scripts/run_seed_test_user.ps1
Wrapper to run scripts/seed_add_test_user.sql with safety checks.
Usage: Open PowerShell in the repo and run:
  .\scripts\run_seed_test_user.ps1
This script will prompt for a Postgres connection URI (psql-compatible). It will:
  - Check whether public.users exists
  - Check whether password_hash column exists
  - Offer to add password_hash (text) if missing
  - Backup public.users before creating uniqueness constraints
  - Run the seed SQL file
#>

param()

$defaultDb = 'postgresql://postgres:123456@localhost:5432/legal_ai_db'
Write-Host "Enter Postgres connection URI (press Enter for default):" -NoNewline
$dbUrl = Read-Host
if ([string]::IsNullOrWhiteSpace($dbUrl)) { $dbUrl = $defaultDb }

Write-Host "Using DB URI: $dbUrl" -ForegroundColor Cyan

# Check connectivity / psql availability
try {
    $ver = & psql --version 2>$null
} catch {
    Write-Error "psql tool not found in PATH. Install PostgreSQL client tools or add psql to PATH."
    exit 1
}

# Helper to run psql and capture output as array of trimmed lines
function Run-PSQL($uri, $sql) {
    $cmd = @('-d', $uri, '-t', '-A', '-c', $sql)
    $raw = & psql @cmd 2>&1
    if ($raw -eq $null) { return @() }
    $lines = $raw -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
    return ,$lines
}

# Check if users table exists
$tableCheckSql = "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='users' LIMIT 1;"
$tableResp = Run-PSQL $dbUrl $tableCheckSql
if ($tableResp -contains '1') {
    Write-Host "Found existing table: public.users" -ForegroundColor Green
} else {
    Write-Host "No existing public.users table found — the seed script will create one if needed." -ForegroundColor Yellow
}

# Check for password_hash column
$colCheckSql = "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='password_hash';"
$colResp = Run-PSQL $dbUrl $colCheckSql
if ($colResp -contains 'password_hash') {
    Write-Host "Column 'password_hash' exists on public.users" -ForegroundColor Green
} else {
    Write-Warning "Column 'password_hash' not found on public.users."
    $choice = Read-Host "Add column 'password_hash' (text) to public.users now? (y/N)"
    if ($choice -match '^[Yy]') {
        Write-Host "Adding column password_hash (text) to public.users..." -ForegroundColor Cyan
        $alterSql = "ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash text;"
        $alterOut = Run-PSQL $dbUrl $alterSql
        if ($alterOut -match 'ERROR') {
            Write-Error "Failed to ALTER TABLE public.users. Inspect output above."; exit 1
        }
        Write-Host "Column added (or already existed)." -ForegroundColor Green
    } else {
        Write-Host "Skipping column addition. The seed script may fail if the existing users table does not accept the insert." -ForegroundColor Yellow
        $confirm = Read-Host "Continue and run seed script anyway? (y/N)"
        if (!($confirm -match '^[Yy]')) { Write-Host "Aborting."; exit 0 }
    }
}

# Ensure unique constraint/index on email exists or can be created safely
$uniqueCheckSql = "SELECT 1 FROM pg_constraint con JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey) WHERE con.conrelid = 'public.users'::regclass AND con.contype = 'u' AND att.attname = 'email' LIMIT 1;"
$uniqueResp = Run-PSQL $dbUrl $uniqueCheckSql
if ($uniqueResp -contains '1') {
    Write-Host "Unique constraint on public.users(email) exists." -ForegroundColor Green
} else {
    Write-Warning "No unique constraint on public.users(email) detected. The seed SQL uses ON CONFLICT (email) and requires a unique constraint or index."
    # Check for duplicate emails
    $dupCheckSql = "SELECT email, count(*) AS cnt FROM public.users GROUP BY email HAVING count(*) > 1 LIMIT 5;"
    $dupResp = Run-PSQL $dbUrl $dupCheckSql
    if ($dupResp.Count -gt 0) {
        Write-Error "Found duplicate emails (sample):`n$($dupResp -join "`n")`nCannot safely create unique index until duplicates are resolved. Aborting."; exit 1
    }

    # Backup users table before making schema changes
    $ts = (Get-Date).ToString('yyyyMMdd_HHmmss')
    $backupDir = 'scripts/backups'
    if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir | Out-Null }
    $backupFile = "$backupDir\users_backup_$ts.csv"
    Write-Host "Creating backup of public.users to $backupFile" -ForegroundColor Cyan
    $copySql = "\copy (SELECT * FROM public.users) TO '$backupFile' WITH CSV HEADER;"
    $copyOut = Run-PSQL $dbUrl $copySql
    if ($copyOut -match 'ERROR') {
        Write-Error "Backup failed. Aborting."; exit 1
    }
    Write-Host "Backup created." -ForegroundColor Green

    $createChoice = Read-Host "Create UNIQUE index on public.users(email) now to support ON CONFLICT? (y/N)"
    if ($createChoice -match '^[Yy]') {
        Write-Host "Creating unique index users_email_unique_idx on public.users(email)..." -ForegroundColor Cyan
        $createIdxSql = "CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON public.users(email);"
        $createOut = Run-PSQL $dbUrl $createIdxSql
        if ($createOut -match 'ERROR') {
            Write-Error "Failed to create unique index. Inspect output above."; exit 1
        }
        Write-Host "Unique index created (or already existed)." -ForegroundColor Green
    } else {
        Write-Host "Proceeding without creating unique index. Seed may fail with ON CONFLICT error." -ForegroundColor Yellow
        $confirmProceed = Read-Host "Continue and run seed script anyway? (y/N)"
        if (!($confirmProceed -match '^[Yy]')) { Write-Host "Aborting."; exit 0 }
    }
}

# Run the seed SQL file
$scriptPath = "scripts/seed_add_test_user.sql"
if (-not (Test-Path $scriptPath)) { Write-Error "Seed SQL file not found at $scriptPath"; exit 1 }

Write-Host "Running seed script: $scriptPath" -ForegroundColor Cyan
$runRaw = & psql -d $dbUrl -f $scriptPath 2>&1
if ($runRaw -match 'ERROR') {
    Write-Host $runRaw
    Write-Error "psql reported errors while running the seed script. Inspect output above."; exit 1
}
Write-Host $runRaw
Write-Host "Seed script completed." -ForegroundColor Green

# Show verification query suggestion
Write-Host "You can verify the inserted user with:" -ForegroundColor Cyan
$verifyCmd = 'psql "' + $dbUrl + '" -c "SELECT id,email,created_at FROM public.users WHERE email=''test@example.com'';"'
Write-Host $verifyCmd -ForegroundColor Yellow
Write-Host "And check password match:" -ForegroundColor Cyan
$checkCmd = 'psql "' + $dbUrl + '" -c "SELECT (password_hash = crypt(''secret123'', password_hash)) AS password_ok FROM public.users WHERE email=''test@example.com'';"'
Write-Host $checkCmd -ForegroundColor Yellow

exit 0
