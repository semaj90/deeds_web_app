# Phase 97: Robust Batch Fixer (Round 4)
# Using Global Replacements per Pattern

param(
    [switch]$DryRun = $false,
    [switch]$Apply = $false
)

$ErrorActionPreference = 'Continue'

Write-Host "🔍 Phase 97: Batch Fixer (Round 4 - Robust Global)" -ForegroundColor Cyan
Write-Host "Targeting: Svelte Directives, Ternaries, Interfaces, and Bidirectional Corruptions"
Write-Host "Strategy: Global Replacement per Pattern"
Write-Host "=" * 70
Write-Host ""

if ($DryRun) {
    Write-Host "🛡️  DRY-RUN MODE" -ForegroundColor Yellow
} else {
    Write-Host "⚠️  APPLY MODE" -ForegroundColor Red
}
Write-Host ""

# Priority fix patterns
$fixPatterns = @(
    # 1. Svelte Directives (use, bind, class, etc.)
    # Fixes: use, enhance -> use:enhance
    # Fixes: bind, open -> bind:open
    @{
        Name = "Svelte Directive Corruption"
        Regex = "\b(use|bind|class|in|out|animate|transition|on)\s*,\s*([a-zA-Z0-9_]+)"
        Replacement = '$1:$2'
        FilePattern = "*.svelte"
    },

    # 2. Svelte Ternary with Strings
    # Fixes: class="{... ? 'a' , 'b'}" -> class="{... ? 'a' : 'b'}"
    @{
        Name = "Svelte Ternary Corruption"
        Regex = "(\?\s*'[^']*')\s*,\s*('[^']*')"
        Replacement = '$1 : $2'
        FilePattern = "*.svelte"
    },

    # 3. Interface Properties (Explicit semicolon check - Lowercase/Mixed)
    # Fixes: after, string; -> after: string;
    # Fixes: before, string; -> before: string;
    # Regex note: (?m) enables multiline mode for ^ to work
    @{
        Name = "Interface Property Semicolon Fix"
        Regex = "(?m)^\s*([a-zA-Z0-9_]+)\s*,\s*([a-zA-Z0-9_\[\]]+)\s*;"
        Replacement = '$1: $2;'
        FilePattern = "*.ts"
    },

    # 4. Qdrant 'any' Key Fix
    # Fixes: { any, string[] } -> { any: string[] }
    @{
        Name = "Qdrant Any Key Fix"
        Regex = "\{\s*any\s*,\s*([a-zA-Z0-9_\[\]]+)\s*\}"
        Replacement = '{ any: $1 }'
        FilePattern = "*.ts"
    },

    # 5. Destructuring Renaming Fix (Broad)
    # Fixes: async ({ request: fetch }) -> async ({ request, fetch })
    @{
        Name = "Destructuring Renaming Fix"
        Regex = "async\s*\(\s*\{\s*(request|locals|cookies|url|params)\s*:\s*(fetch|request|locals|cookies|url|params)\s*\}\s*\)"
        Replacement = 'async ({ $1, $2 })'
        FilePattern = "+server.ts"
    },

    # 6. Function Call Argument Fix (Colon replacing Comma)
    # Fixes: sse.sendProgress(step.name: Math.round...) -> sse.sendProgress(step.name, Math.round...)
    @{
        Name = "Function Arg Colon Fix"
        Regex = "\(\s*([a-zA-Z0-9_\.]+)\s*:\s*(Math\.[a-zA-Z0-9_]+|new\s+[a-zA-Z0-9_]+)"
        Replacement = '($1, $2'
        FilePattern = "*.ts"
    },

    # 7. Validation Step Logic Fix (Specific to security route)
    # Fixes the loop in validate/progress/+server.ts
    @{
        Name = "Validation Loop Fix"
        Regex = "(step\.name)\s*:\s*(Math\.round)"
        Replacement = '$1, $2'
        FilePattern = "*.ts"
    },

    # 8. Svelte Action - manual verify
    @{
        Name = "Svelte Action Fix"
        Regex = "use,\s*enhance"
        Replacement = "use:enhance"
        FilePattern = "*.svelte"
    }
)

$scannedCount = 0
$filesFixed = 0
$totalMatches = 0

foreach ($pattern in $fixPatterns) {
    Write-Host "  Checking: $($pattern.Name)" -ForegroundColor Cyan

    $include = $pattern.FilePattern
    $files = Get-ChildItem -Path src -Recurse -Include $include -ErrorAction SilentlyContinue

    foreach ($file in $files) {
        $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
        if (-not $content) { continue }
        $scannedCount++

        # Check for match (Fast Check)
        if ($content -match $pattern.Regex) {

            # Apply Replacement (Global)
            try {
                $newContent = $content -replace $pattern.Regex, $pattern.Replacement
            } catch {
                Write-Host "    ❌ Regex Error in $($file.Name): $_" -ForegroundColor Red
                continue
            }

            # Verify if changed
            if ($newContent.Length -ne $content.Length -or $newContent -ne $content) {
                # Count matches roughly
                $matches = [regex]::Matches($content, $pattern.Regex)
                $count = $matches.Count

                if ($Apply) {
                    Set-Content -Path $file.FullName -Value $newContent -NoNewline
                    Write-Host "  ✅ Fixed ($count): $($file.Name)" -ForegroundColor Green
                    $filesFixed++
                } else {
                    Write-Host "  Found ($count): $($file.Name)" -ForegroundColor Yellow
                    # Preview first match
                    if ($count -gt 0) {
                        $m = $matches[0]
                        Write-Host "    Match: $($m.Value.Trim())" -ForegroundColor DarkGray
                    }
                }

                $totalMatches += $count
            }
        }
    }
}

Write-Host ""
Write-Host "📊 Summary:" -ForegroundColor White
Write-Host "  Scanned Files: $scannedCount"
Write-Host "  Found Matches: $totalMatches"
if ($Apply) {
    Write-Host "  Files Fixed:   $filesFixed"
    Write-Host "  Re-run svelte-check to verify fixes." -ForegroundColor Green
} else {
    Write-Host "  Files to Fix:  $filesFixed"
    Write-Host "  Run with -Apply to execute." -ForegroundColor Yellow
}
