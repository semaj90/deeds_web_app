# PowerShell script to automatically generate a markdown todo list from npm run check

Write-Host "🔄 Running project checks and generating error log..." -ForegroundColor Yellow

# Step 1: Run the check and capture all output to a log file
$ErrorFile = "errors.log"
$OutputFile = "TODO.md"

try {
    # Run npm run check and capture both stdout and stderr
    $process = Start-Process -FilePath "npm" -ArgumentList "run", "check" -NoNewWindow -Wait -RedirectStandardOutput "stdout.log" -RedirectStandardError "stderr.log" -PassThru
    
    # Combine stdout and stderr into one file
    $stdout = if (Test-Path "stdout.log") { Get-Content "stdout.log" } else { @() }
    $stderr = if (Test-Path "stderr.log") { Get-Content "stderr.log" } else { @() }
    
    $allOutput = @()
    $allOutput += $stdout
    $allOutput += $stderr
    
    $allOutput | Out-File -FilePath $ErrorFile -Encoding UTF8
    
    Write-Host "✅ Checks complete. Parsing log file..." -ForegroundColor Green
    
    # Clean up temporary files
    if (Test-Path "stdout.log") { Remove-Item "stdout.log" }
    if (Test-Path "stderr.log") { Remove-Item "stderr.log" }
    
} catch {
    Write-Host "❌ Error running npm run check: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 2: Prepare the output markdown file
$date = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

@"
# ✅ Project Issues Todo List

Generated on $date

## Summary
This file contains all TypeScript, Svelte, and other issues found by running ``npm run check``.

"@ | Out-File -FilePath $OutputFile -Encoding UTF8

# Step 3: Parse the log file and format the output
if (Test-Path $ErrorFile) {
    $content = Get-Content $ErrorFile
    $currentFile = ""
    $lastFile = ""
    $todoContent = @()
    $issueCount = 0
    
    foreach ($line in $content) {
        # Match a line containing a file path (e.g., .../src/...)
        if ($line -match "src[/\\].*") {
            $matches = [regex]::Matches($line, "src[/\\][^:]*")
            if ($matches.Count -gt 0) {
                $currentFile = $matches[0].Value
                $currentFile = $currentFile -replace ":[0-9]+:[0-9]+$", ""
            }
        }
        
        # Match lines that contain errors or warnings
        if ($line -match "^(Warn:|Error:|✖)" -or $line -match "error" -or $line -match "warning") {
            if ($currentFile -and $currentFile -ne "") {
                # Print the file header if it is new
                if ($currentFile -ne $lastFile) {
                    $todoContent += ""
                    $todoContent += "- **File:** ``$currentFile``"
                }
                
                # Clean up the message
                $issue = $line -replace "^(Warn:|Error:)\s*", ""
                $issue = $issue -replace "^✖\s*", ""
                $todoContent += "  - **Issue:** $issue"
                $issueCount++
                
                # Track the last file to avoid duplicate headers
                $lastFile = $currentFile
            }
        }
        
        # Also catch TypeScript compilation errors
        if ($line -match "TS[0-9]+:" -or $line -match "Cannot find" -or $line -match "does not exist") {
            if ($currentFile -and $currentFile -ne "") {
                if ($currentFile -ne $lastFile) {
                    $todoContent += ""
                    $todoContent += "- **File:** ``$currentFile``"
                }
                
                $todoContent += "  - **TypeScript Error:** $line"
                $issueCount++
                $lastFile = $currentFile
            }
        }
    }
    
    # Add summary
    if ($issueCount -eq 0) {
        "## Results" | Out-File -FilePath $OutputFile -Append -Encoding UTF8
        "✅ **No issues found!** Your project is clean." | Out-File -FilePath $OutputFile -Append -Encoding UTF8
        "" | Out-File -FilePath $OutputFile -Append -Encoding UTF8
        "### What was checked:" | Out-File -FilePath $OutputFile -Append -Encoding UTF8
        "- TypeScript compilation" | Out-File -FilePath $OutputFile -Append -Encoding UTF8
        "- Svelte component syntax" | Out-File -FilePath $OutputFile -Append -Encoding UTF8
        "- Import/export statements" | Out-File -FilePath $OutputFile -Append -Encoding UTF8
        "- Type definitions" | Out-File -FilePath $OutputFile -Append -Encoding UTF8
        "- ESLint rules (if configured)" | Out-File -FilePath $OutputFile -Append -Encoding UTF8
    } else {
        "## Results" | Out-File -FilePath $OutputFile -Append -Encoding UTF8
        "Found **$issueCount** issues that need to be addressed:" | Out-File -FilePath $OutputFile -Append -Encoding UTF8
        "" | Out-File -FilePath $OutputFile -Append -Encoding UTF8
        "### Issues by File:" | Out-File -FilePath $OutputFile -Append -Encoding UTF8
        
        # Append the todo content to the file
        $todoContent | Out-File -FilePath $OutputFile -Append -Encoding UTF8
    }
    
    # Add footer
    "" | Out-File -FilePath $OutputFile -Append -Encoding UTF8
    "---" | Out-File -FilePath $OutputFile -Append -Encoding UTF8
    "" | Out-File -FilePath $OutputFile -Append -Encoding UTF8
    "### Modern SvelteKit Components Available:" | Out-File -FilePath $OutputFile -Append -Encoding UTF8
    "- 🎯 **CommandMenu.svelte** - Slash command system with citations" | Out-File -FilePath $OutputFile -Append -Encoding UTF8
    "- 🎨 **GoldenLayout.svelte** - Golden ratio layout with collapsible sidebar" | Out-File -FilePath $OutputFile -Append -Encoding UTF8
    "- 📱 **ExpandGrid.svelte** - Hover-expanding grid (1→3 columns)" | Out-File -FilePath $OutputFile -Append -Encoding UTF8
    "- 💬 **SmartTextarea.svelte** - Textarea with integrated command menu" | Out-File -FilePath $OutputFile -Append -Encoding UTF8
    "- 🔧 **Enhanced EvidenceCard.svelte** - Improved hover effects and accessibility" | Out-File -FilePath $OutputFile -Append -Encoding UTF8
    "- 📚 **Citations Store** - Full CRUD with recent citations tracking" | Out-File -FilePath $OutputFile -Append -Encoding UTF8
    "- 🔗 **Fast Navigation** - SvelteKit's built-in SPA routing" | Out-File -FilePath $OutputFile -Append -Encoding UTF8
    "" | Out-File -FilePath $OutputFile -Append -Encoding UTF8
    "### Demo Page" | Out-File -FilePath $OutputFile -Append -Encoding UTF8
    "Visit ``/modern-demo`` to see all components in action!" | Out-File -FilePath $OutputFile -Append -Encoding UTF8
    
} else {
    "## Results" | Out-File -FilePath $OutputFile -Append -Encoding UTF8
    "❌ **Error:** Could not find error log file." | Out-File -FilePath $OutputFile -Append -Encoding UTF8
}

Write-Host "🎉 Success! Your todo list has been generated at ./TODO.md" -ForegroundColor Green

# Optional: Display summary
if (Test-Path $OutputFile) {
    $content = Get-Content $OutputFile
    Write-Host "" -ForegroundColor White
    Write-Host "📋 TODO.md Summary:" -ForegroundColor Cyan
    $content | Select-Object -First 10 | ForEach-Object { Write-Host "   $_" -ForegroundColor White }
    if ($content.Count -gt 10) {
        Write-Host "   ... (see TODO.md for full details)" -ForegroundColor Gray
    }
}
