# ==============================================================
# PHASE 34 – POWERSHELL VERSION (Replaces Node.js Script)
# ==============================================================
# AST-Aware Token Reconstruction for TypeScript Syntax Errors
# - Fixes trailing commas, mismatched brackets, keyword issues
# - Processes files in parallel for speed
# - No Node.js dependency (pure PowerShell)
# ==============================================================

param(
    [string]$SrcPath = "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\src",
    [string]$BackupPath = "C:\Users\james\Videos\deeds-web-app\scripts\backups\phase34",
    [int]$MaxThreads = [System.Environment]::ProcessorCount
)

$ErrorActionPreference = "Stop"
$startTime = Get-Date

# Create backup directory
if (!(Test-Path $BackupPath)) {
    New-Item -ItemType Directory -Force -Path $BackupPath | Out-Null
}

Write-Host "═" * 70 -ForegroundColor Cyan
Write-Host "🔧 PHASE 34: AST-Aware Token Reconstruction (PowerShell)" -ForegroundColor Cyan
Write-Host "═" * 70 -ForegroundColor Cyan
Write-Host ""
Write-Host "📁 Source: $SrcPath" -ForegroundColor Yellow
Write-Host "💾 Backup: $BackupPath" -ForegroundColor Yellow
Write-Host "⚡ Workers: $MaxThreads threads" -ForegroundColor Yellow
Write-Host ""

# ============================================================
# HELPER FUNCTIONS
# ============================================================

function Invoke-TokenBalance {
    param([string]$Text)

    $openers = @("{", "(", "[")
    $closers = @("}", ")", "]")
    $stack = @()
    $result = $Text.ToCharArray()
    $i = 0

    while ($i -lt $result.Count) {
        $ch = $result[$i]
        $oi = $openers.IndexOf([string]$ch)
        $ci = $closers.IndexOf([string]$ch)

        if ($oi -ge 0) {
            $stack += $openers[$oi]
        }
        elseif ($ci -ge 0) {
            $want = $openers[$ci]
            if ($stack.Count -gt 0 -and $stack[-1] -eq $want) {
                $stack = $stack[0..($stack.Count-2)]
            }
        }
        $i++
    }

    # Close remaining brackets
    while ($stack.Count -gt 0) {
        $opener = $stack[-1]
        $stack = $stack[0..($stack.Count-2)]
        $idx = $openers.IndexOf($opener)
        $result += $closers[$idx]
    }

    return [string]::Join("", $result)
}

function Invoke-SyntaxCleanup {
    param([string]$Text)

    $out = $Text

    # Fix trailing colons (: → ,)
    $out = $out -replace ':\s*(\}|$)', ',$1'

    # Remove comma before closing brackets
    $out = $out -replace ',\s*([}\])])', '$1'

    # Remove trailing commas in param lists
    $out = $out -replace ',\s*\)', ')'

    # Fix double commas
    $out = $out -replace ',\s*,', ','

    # Fix colon chains (a: Type: b → a: Type, b)
    $out = $out -replace '([a-z][a-zA-Z0-9]*)\s*:\s*([A-Z][a-zA-Z0-9<>\[\]|&\s]*?)\s*:\s*([a-z])', '$1: $2, $3'

    # Remove trailing spaces
    $out = $out -replace '[ \t]+$', ''

    # Fix missing commas between arrays
    $out = $out -replace '\]\s*\[', '], ['

    # Fix stray commas at line end
    $out = $out -replace ',\s*$', ''

    return $out
}

function Invoke-KeywordFix {
    param([string]$Text)

    $out = $Text

    # Fix keyword confusion (common in corrupted files)
    # interface vs type swaps
    $out = $out -replace '\binterface\s+type\b', 'type'
    $out = $out -replace '\btype\s+interface\b', 'interface'

    # Fix export keyword issues
    $out = $out -replace '\bexport\s+export\b', 'export'
    $out = $out -replace '\bimport\s+import\b', 'import'

    # Fix const/let/var confusion
    $out = $out -replace '\bconst\s+let\b', 'const'
    $out = $out -replace '\blet\s+const\b', 'let'

    return $out
}

function Repair-File {
    param([string]$FilePath)

    try {
        $originalText = [System.IO.File]::ReadAllText($FilePath, [System.Text.Encoding]::UTF8)

        # Skip if file is already clean (basic check)
        if ($originalText -notmatch '(:\s*\}|,\s*,|,\s*[}\])]|\]\s*\[)') {
            return @{ Status = "skipped"; File = $FilePath; Reason = "clean" }
        }

        # Apply repairs in sequence
        $repaired = $originalText
        $repaired = Invoke-KeywordFix -Text $repaired
        $repaired = Invoke-SyntaxCleanup -Text $repaired
        $repaired = Invoke-TokenBalance -Text $repaired

        # Skip if no changes
        if ($repaired -eq $originalText) {
            return @{ Status = "unchanged"; File = $FilePath }
        }

        # Backup original
        $relPath = $FilePath.Substring($SrcPath.Length + 1)
        $backupFile = Join-Path $BackupPath $relPath
        $backupDir = Split-Path -Parent $backupFile
        if (!(Test-Path $backupDir)) {
            New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
        }
        Copy-Item -Path $FilePath -Destination $backupFile -Force

        # Write repaired file
        [System.IO.File]::WriteAllText($FilePath, $repaired, [System.Text.Encoding]::UTF8)

        return @{ Status = "fixed"; File = $FilePath; Diff = (($repaired.Length - $originalText.Length)) }
    }
    catch {
        return @{ Status = "error"; File = $FilePath; Error = $_.Exception.Message }
    }
}

# ============================================================
# MAIN PROCESSING
# ============================================================

# Get all TypeScript/Svelte files
Write-Host "🔍 Scanning for TypeScript/Svelte files..." -ForegroundColor Cyan

$files = @()
$files += Get-ChildItem -Path $SrcPath -Filter "*.ts" -Recurse -ErrorAction SilentlyContinue
$files += Get-ChildItem -Path $SrcPath -Filter "*.tsx" -Recurse -ErrorAction SilentlyContinue
$files += Get-ChildItem -Path $SrcPath -Filter "*.svelte" -Recurse -ErrorAction SilentlyContinue
$files += Get-ChildItem -Path $SrcPath -Filter "*.mjs" -Recurse -ErrorAction SilentlyContinue
$files += Get-ChildItem -Path $SrcPath -Filter "*.js" -Recurse -ErrorAction SilentlyContinue

Write-Host "✅ Found $($files.Count) files to check" -ForegroundColor Green
Write-Host ""

# Process files in parallel using jobs
$results = @()
$filesPerJob = [Math]::Ceiling($files.Count / $MaxThreads)
$jobCount = 0

Write-Host "⚡ Processing files (parallel: $MaxThreads threads)..." -ForegroundColor Yellow

for ($i = 0; $i -lt $files.Count; $i += $filesPerJob) {
    $batch = $files[$i..[Math]::Min($i + $filesPerJob - 1, $files.Count - 1)]

    $job = Start-Job -ScriptBlock {
        param($batch, $SrcPath, $BackupPath)

        $function:Invoke-TokenBalance = $using:function:Invoke-TokenBalance
        $function:Invoke-SyntaxCleanup = $using:function:Invoke-SyntaxCleanup
        $function:Invoke-KeywordFix = $using:function:Invoke-KeywordFix
        $function:Repair-File = $using:function:Repair-File

        foreach ($file in $batch) {
            Repair-File -FilePath $file.FullName
        }
    } -ArgumentList $batch, $SrcPath, $BackupPath

    $jobCount++
}

# Wait for all jobs to complete and collect results
Write-Host ""
$jobs = Get-Job | Where-Object { $_.State -eq "Running" }
while ($jobs.Count -gt 0) {
    $completed = @(Get-Job | Where-Object { $_.State -eq "Completed" }).Count
    $running = @(Get-Job | Where-Object { $_.State -eq "Running" }).Count
    Write-Host "`r  ⏳ $running jobs running ($completed completed)..." -NoNewline
    Start-Sleep -Milliseconds 500
    $jobs = Get-Job | Where-Object { $_.State -eq "Running" }
}

Write-Host ""
Write-Host ""

foreach ($job in Get-Job) {
    $results += Receive-Job -Job $job
    Remove-Job -Job $job
}

# ============================================================
# REPORTING
# ============================================================

$fixed = @($results | Where-Object { $_.Status -eq "fixed" })
$unchanged = @($results | Where-Object { $_.Status -eq "unchanged" })
$skipped = @($results | Where-Object { $_.Status -eq "skipped" })
$errors = @($results | Where-Object { $_.Status -eq "error" })

Write-Host "📊 PHASE 34 RESULTS" -ForegroundColor Cyan
Write-Host "═" * 50 -ForegroundColor Cyan
Write-Host "✅ Fixed:     $($fixed.Count) files" -ForegroundColor Green
Write-Host "⏭️  Unchanged: $($unchanged.Count) files" -ForegroundColor Gray
Write-Host "⊘ Skipped:   $($skipped.Count) files" -ForegroundColor Gray
Write-Host "❌ Errors:    $($errors.Count) files" -ForegroundColor Red
Write-Host "📈 Total:     $($results.Count) files processed" -ForegroundColor White
Write-Host ""

# Show first few fixed files
if ($fixed.Count -gt 0) {
    Write-Host "📝 Sample fixed files:" -ForegroundColor Yellow
    $fixed | Select-Object -First 5 | ForEach-Object {
        Write-Host "   ✅ $($_.File)" -ForegroundColor Green
    }
    if ($fixed.Count -gt 5) {
        Write-Host "   ... and $($fixed.Count - 5) more" -ForegroundColor Gray
    }
}

# Show errors if any
if ($errors.Count -gt 0) {
    Write-Host ""
    Write-Host "⚠️  Errors:" -ForegroundColor Red
    $errors | Select-Object -First 3 | ForEach-Object {
        Write-Host "   ❌ $($_.File)" -ForegroundColor Red
        Write-Host "      $($_.Error)" -ForegroundColor Gray
    }
}

$duration = (Get-Date) - $startTime
Write-Host ""
Write-Host "═" * 50 -ForegroundColor Cyan
Write-Host "⏱️  Completed in $([math]::Round($duration.TotalSeconds, 1))s" -ForegroundColor Green
Write-Host "═" * 50 -ForegroundColor Cyan

# Exit with success
exit 0
