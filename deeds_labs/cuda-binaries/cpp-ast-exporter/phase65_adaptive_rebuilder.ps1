# ===============================================================
# Phase 65 — Adaptive Rebuilder (YoRHa Legal AI)
#   • Parses AI patches from Phase 64 diagnostics
#   • Applies JSON-encoded fixes automatically
#   • Loops until build succeeds or 3 adaptive passes
# ===============================================================

$projectRoot = "C:\Users\james\Videos\deeds-web-app\cpp-ast-exporter"
$phase64 = Join-Path $projectRoot "phase64_self_heal_loop.ps1"
$logDir  = Join-Path $projectRoot "build"

function Apply-AIPatch($patchFile) {
    try {
        $jsonContent = Get-Content $patchFile -Raw
        $patches = $jsonContent | ConvertFrom-Json -ErrorAction SilentlyContinue

        if (-not $patches) {
            Write-Warning "⚠️ No valid JSON patches found in $patchFile. Skipping AI patch application."
            return
        }

        # --- Apply patches ---
        foreach ($patch in $patches) {
            Write-Host "Applying patch: $($patch | ConvertTo-Json -Compress)"

            if ($patch.file -eq "CMakeLists.txt") {
                $targetFile = Join-Path $projectRoot "CMakeLists.txt"
                if (-not (Test-Path $targetFile)) {
                    Write-Warning "Target file $($targetFile) not found for patch."
                    continue
                }

                if ($patch.action -eq "replace") {
                    $fileContent = Get-Content $targetFile -Raw
                    $escapedOld = [regex]::Escape($patch.old)
                    if ($fileContent -match $escapedOld) {
                        $fileContent = $fileContent -replace $escapedOld, $patch.new
                        Set-Content $targetFile $fileContent -Encoding UTF8
                        Write-Host "🧠  Patched (replace): $($patch.old) → $($patch.new)"
                    } else {
                        Write-Warning "Old string '$($patch.old)' not found in $($targetFile). Skipping replace."
                    }
                }
                elseif ($patch.action -eq "add") {
                    Add-Content $targetFile "`n$($patch.content)" -Encoding UTF8
                    Write-Host "➕  Patched (add): $($patch.content)"
                }
            }
            # Add more file types/logic here if AI output can target other files
            else {
                Write-Warning "Unsupported target file type: $($patch.file). Skipping patch."
            }
        }

        # Output the structured patches to a JSON file for future phases (Phase 66)
        $patches | ConvertTo-Json -Depth 10 | Out-File -FilePath (Join-Path $logDir "applied_patches_$(Get-Date -Format yyyyMMdd_HHmmss).json") -Encoding UTF8
        Write-Host "✅  Structured patches saved."

    } catch {
        Write-Warning "Failed to parse or apply patch from $patchFile : $_"
    }
}

for ($i=1; $i -le 3; $i++) {
    Write-Host "`n⚙️  Adaptive Rebuild Pass #$i"
    pwsh -ExecutionPolicy Bypass -File $phase64

    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅  Build succeeded after adaptive pass #$i"
        exit 0
    }

    # Locate AI diagnostic file
    $aiDiagnosticFile = Join-Path $logDir "ai_diagnostic.txt"
    if (Test-Path $aiDiagnosticFile) {
        Write-Host "🧩  Applying AI patch from $($aiDiagnosticFile)"
        Apply-AIPatch $aiDiagnosticFile
    } else {
        Write-Warning "⚠️ No ai_diagnostic.txt found. Skipping AI patch application."
    }
}

Write-Error "💀  Adaptive rebuild failed after 3 passes. Review patches manually."
exit 1