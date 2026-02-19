<#
╔══════════════════════════════════════════════════════════════╗
║        PHASE 29 – AUTO-FIX SVELTE 5 MIGRATION ERRORS         ║
╚══════════════════════════════════════════════════════════════╝
• Fixes default-vs-named import syntax
• Replaces <Button.Root> / <Card.Root> with direct tags
• Converts transition:fade/transition:fly → use:fade / use:fly
• Converts $: → $derived() (non-destructive)
• Logs all edits with timestamps
• Post-run verification and summary
#>

param(
  [string]$Target = ".",
  [string]$LogDir = "logs",
  [switch]$SkipVerification
)

$ErrorActionPreference = "Stop"
$startTime = Get-Date

# Setup logging
if (!(Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }
$logFile = Join-Path $LogDir "phase29-fix-imports-and-runes.log"
$summaryFile = Join-Path $LogDir "phase29-summary.txt"

function Write-Log {
  param([string]$Message)
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  "[$timestamp] $Message" | Out-File $logFile -Append -Encoding utf8
  Write-Host $Message
}

Write-Log "🧩 Phase 29 started"
Write-Host "`n╔══════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     PHASE 29: SVELTE 5 MIGRATION AUTO-FIX       ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

$stats = @{
  importFixes = 0
  rootReplacements = 0
  transitionFixes = 0
  reactiveFixes = 0
  onClickFixes = 0
  filesProcessed = 0
}

# ----------------------------------------------------------------
# 1️⃣  Fix curly-brace imports for .svelte modules
# ----------------------------------------------------------------
Write-Host "🔧 Step 1/6: Fixing import syntax..." -ForegroundColor Yellow
Get-ChildItem -Path $Target -Recurse -Include *.svelte -Exclude node_modules*,*.svelte-kit* | ForEach-Object {
  $path = $_.FullName
  $content = Get-Content $path -Raw -ErrorAction SilentlyContinue
  if (!$content) { return }
  
  $updated = $content -replace 'import\s+\{([^}]+)\}\s+from\s+[''"]([^''"]+\.svelte)[''"];', 'import $1 from "$2";'
  
  if ($updated -ne $content) {
    $updated | Set-Content $path -Encoding utf8 -NoNewline
    $stats.importFixes++
    Write-Log "  [IMPORT] $($_.Name)"
  }
  $stats.filesProcessed++
}

Write-Host "  ✅ Import fixes: $($stats.importFixes)" -ForegroundColor Green

# ----------------------------------------------------------------
# 2️⃣  Replace .Root subcomponents with direct usage
# ----------------------------------------------------------------
Write-Host "`n🔧 Step 2/6: Normalizing .Root usages..." -ForegroundColor Yellow
$rootTags = @('Button','Card','Dialog','Select','Popover','Dropdown','Accordion','Tabs')

foreach ($tag in $rootTags) {
  Get-ChildItem -Path $Target -Recurse -Include *.svelte -Exclude node_modules*,*.svelte-kit* | ForEach-Object {
    $content = Get-Content $_ -Raw -ErrorAction SilentlyContinue
    if (!$content) { return }
    
    $updated = $content -replace "<$tag\.Root(\s|>)", "<$tag`$1" -replace "</$tag\.Root>", "</$tag>"
    
    if ($updated -ne $content) {
      $updated | Set-Content $_ -Encoding utf8 -NoNewline
      $stats.rootReplacements++
      Write-Log "  [ROOT] $tag in $($_.Name)"
    }
  }
}

Write-Host "  ✅ Root replacements: $($stats.rootReplacements)" -ForegroundColor Green

# ----------------------------------------------------------------
# 3️⃣  Replace legacy transitions
# ----------------------------------------------------------------
Write-Host "`n🔧 Step 3/6: Updating transition directives..." -ForegroundColor Yellow
Get-ChildItem -Path $Target -Recurse -Include *.svelte -Exclude node_modules*,*.svelte-kit* | ForEach-Object {
  $path = $_.FullName
  $content = Get-Content $path -Raw -ErrorAction SilentlyContinue
  if (!$content) { return }
  
  $original = $content
  $content = $content -replace 'transition:fade', 'use:fade'
  $content = $content -replace 'transition:fly', 'use:fly'
  $content = $content -replace 'transition:slide', 'use:slide'
  $content = $content -replace 'transition:scale', 'use:scale'
  
  if ($content -ne $original) {
    $content | Set-Content $path -Encoding utf8 -NoNewline
    $stats.transitionFixes++
    Write-Log "  [TRANSITION] $($_.Name)"
  }
}

Write-Host "  ✅ Transition fixes: $($stats.transitionFixes)" -ForegroundColor Green

# ----------------------------------------------------------------
# 4️⃣  Convert on:click to onclick (Svelte 5)
# ----------------------------------------------------------------
Write-Host "`n🔧 Step 4/6: Converting on:click to onclick..." -ForegroundColor Yellow
Get-ChildItem -Path $Target -Recurse -Include *.svelte -Exclude node_modules*,*.svelte-kit* | ForEach-Object {
  $path = $_.FullName
  $content = Get-Content $path -Raw -ErrorAction SilentlyContinue
  if (!$content) { return }
  
  $original = $content
  $content = $content -replace '\bon:click=', 'onclick='
  $content = $content -replace '\bon:input=', 'oninput='
  $content = $content -replace '\bon:change=', 'onchange='
  $content = $content -replace '\bon:submit=', 'onsubmit='
  $content = $content -replace '\bon:keydown=', 'onkeydown='
  $content = $content -replace '\bon:keyup=', 'onkeyup='
  
  if ($content -ne $original) {
    $content | Set-Content $path -Encoding utf8 -NoNewline
    $stats.onClickFixes++
    Write-Log "  [EVENT] $($_.Name)"
  }
}

Write-Host "  ✅ Event handler fixes: $($stats.onClickFixes)" -ForegroundColor Green

# ----------------------------------------------------------------
# 5️⃣  Convert `$:` reactive statements to $derived()
# ----------------------------------------------------------------
Write-Host "`n🔧 Step 5/6: Patching reactive `$":" blocks..." -ForegroundColor Yellow
Get-ChildItem -Path $Target -Recurse -Include *.svelte -Exclude node_modules*,*.svelte-kit* | ForEach-Object {
  $path = $_.FullName
  $content = Get-Content $path -Raw -ErrorAction SilentlyContinue
  if (!$content) { return }
  
  # Only convert simple assignments, not blocks
  $updated = $content -replace '(?m)^\s*\$:\s*(\w+)\s*=\s*([^;{]+);', '  let $1 = $derived(() => $2);'
  
  if ($updated -ne $content) {
    $updated | Set-Content $path -Encoding utf8 -NoNewline
    $stats.reactiveFixes++
    Write-Log "  [REACTIVE] $($_.Name)"
  }
}

Write-Host "  ✅ Reactive statement fixes: $($stats.reactiveFixes)" -ForegroundColor Green

# ----------------------------------------------------------------
# 6️⃣  Post-run verification (unless skipped)
# ----------------------------------------------------------------
if (!$SkipVerification) {
  Write-Host "`n🔧 Step 6/6: Running post-fix verification..." -ForegroundColor Yellow
  
  $beforeErrors = $null
  $afterErrors = $null
  
  try {
    Write-Host "  Checking TypeScript errors (this may take 2-3 minutes)..." -ForegroundColor Gray
    $errorOutput = npx tsc --noEmit --skipLibCheck 2>&1 | Out-String
    $afterErrors = ($errorOutput | Select-String -Pattern "error TS" -AllMatches).Matches.Count
    
    if ($afterErrors -eq 0) {
      $afterErrors = 0
    }
    
    Write-Host "  ✅ Current error count: $afterErrors" -ForegroundColor Green
  }
  catch {
    Write-Host "  ⚠️  Verification skipped (tsc not available)" -ForegroundColor Yellow
  }
}

# ----------------------------------------------------------------
# 7️⃣  Generate Summary Report
# ----------------------------------------------------------------
$duration = (Get-Date) - $startTime
$totalFixes = $stats.importFixes + $stats.rootReplacements + $stats.transitionFixes + $stats.reactiveFixes + $stats.onClickFixes

$summary = @"
╔══════════════════════════════════════════════════════════════╗
║           PHASE 29 - SVELTE 5 MIGRATION COMPLETE             ║
╚══════════════════════════════════════════════════════════════╝

📊 EXECUTION SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Started:              $($startTime.ToString('yyyy-MM-dd HH:mm:ss'))
Completed:            $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
Duration:             $($duration.Minutes)m $($duration.Seconds)s

🔧 FIXES APPLIED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Import syntax fixes:       $($stats.importFixes) files
.Root replacements:        $($stats.rootReplacements) files
Transition updates:        $($stats.transitionFixes) files
Event handler fixes:       $($stats.onClickFixes) files
Reactive `$":" fixes:         $($stats.reactiveFixes) files
─────────────────────────────────────────────────────────────────
TOTAL FIXES:               $totalFixes
FILES PROCESSED:           $($stats.filesProcessed)

$(if ($afterErrors) {
@"
📈 ERROR METRICS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Current error count:       $afterErrors
"@
} else {
@"
📈 ERROR METRICS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Verification:              Skipped (use without -SkipVerification)
"@
})

📁 LOG FILES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Detailed log:              $logFile
Summary report:            $summaryFile

✨ NEXT STEPS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Review changes: git diff
2. Test application: npm run dev
3. Run other fixers if needed
4. Commit changes: git add . && git commit -m "Phase 29: Svelte 5 migration fixes"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
Status: ✅ PHASE 29 COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"@

$summary | Out-File $summaryFile -Encoding utf8
Write-Host "`n$summary" -ForegroundColor Cyan
Write-Log "✅ Phase 29 finished - $totalFixes total fixes"

# Add to trend log
if (Test-Path "reports/ERROR_TREND_LOG.csv") {
  $snapshot = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -Path "reports/ERROR_TREND_LOG.csv" -Value "$snapshot, Phase29:$totalFixes, Runtime:$($duration.TotalMinutes -as [int])min"
}

Write-Host "`n✅ Phase 29 complete! See $summaryFile for details`n" -ForegroundColor Green
