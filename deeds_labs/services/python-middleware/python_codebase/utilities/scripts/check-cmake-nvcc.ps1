<#
  check-cmake-nvcc.ps1
  Parses a CMakeOutput.log to confirm CMake picked up nvcc as the CUDA compiler.

  Usage:
    pwsh -File scripts/check-cmake-nvcc.ps1 [-LogPath path\to\CMakeOutput.log]

  When nvcc is detected it prints a green check mark. Otherwise a yellow warning
  is shown with hints for next steps.
#>

[CmdletBinding()]
param(
  [string]$LogPath = "build/gpu-release/CMakeFiles/CMakeOutput.log"
)

if (-not (Test-Path $LogPath)) {
  Write-Host "CMakeOutput.log not found at '$LogPath'. Run a CMake configure pass first." -ForegroundColor Yellow
  exit 1
}

try {
  $content = Get-Content -Path $LogPath -Raw
} catch {
  Write-Host "Failed to read '$LogPath': $_" -ForegroundColor Red
  exit 1
}

$nvccLines = @()
$patterns = @(
  'CMAKE_CUDA_COMPILER[^:\n]*[:=]\s*(?<compiler>.+)',
  'Detecting C\+\+ compiler ABI info\s*\(CUDA\).*?(?<compiler>nvcc\.exe)',
  'nvcc(\.exe)?'
)

foreach ($pattern in $patterns) {
  $matches = [regex]::Matches($content, $pattern, 'IgnoreCase, Singleline')
  foreach ($match in $matches) {
    if ($match.Groups['compiler'].Success) {
      $nvccLines += $match.Groups['compiler'].Value.Trim()
    } else {
      $nvccLines += $match.Value.Trim()
    }
  }
}

$nvccLines = $nvccLines | Sort-Object -Unique

if ($nvccLines.Count -gt 0) {
  $check = [char]0x2705
  Write-Host "$check nvcc detected in CMake output:" -ForegroundColor Green
  foreach ($line in $nvccLines) {
    Write-Host "    $line"
  }
  exit 0
}

$warn = [char]0x26A0
Write-Host "$warn  nvcc not found in CMake output log." -ForegroundColor Yellow
Write-Host "    • Ensure CMake configure was run with CUDA enabled."
Write-Host "    • Confirm CMAKE_CUDA_COMPILER points at nvcc."
exit 2
