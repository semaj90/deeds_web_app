Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Resolve this script's directory (works when invoked from VS Code or PowerShell)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
if (-not $ScriptDir) { $ScriptDir = (Get-Location).Path }

function Test-Command([string]$name) {
	try {
		$cmd = Get-Command $name -ErrorAction Stop
		$path = $null
		if ($cmd -is [System.Management.Automation.CommandInfo]) {
			$path = $cmd.Path
			if (-not $path) { $path = $cmd.Source }
		}
		if ([string]::IsNullOrEmpty($path)) {
			Write-Host "[OK] $name found"
		} else {
			Write-Host "[OK] $name found at $path"
		}
		return $true
	} catch {
		Write-Host "[MISSING] $name not found in PATH"
		return $false
	}
}

$allGood = $true

# Required tools
$allGood = $allGood -and (Test-Command 'git')
$allGood = $allGood -and (Test-Command 'node')
$allGood = $allGood -and (Test-Command 'npm')
$allGood = $allGood -and (Test-Command 'dotnet')

# Optional helpful tools
Test-Command 'pnpm' | Out-Null
Test-Command 'yarn' | Out-Null

# Basic repository layout checks (adjust paths if your layout differs)
# Look for a frontend package.json relative to the repo structure
$expectedFrontendPkg = Join-Path (Resolve-Path (Join-Path $ScriptDir '..\..') -ErrorAction SilentlyContinue) 'sveltekit-frontend\package.json'
if ($expectedFrontendPkg -and (Test-Path $expectedFrontendPkg)) {
	Write-Host "[OK] Frontend package.json found at $expectedFrontendPkg"
} else {
	Write-Host "[WARN] Frontend package.json not found at expected path: $expectedFrontendPkg"
}

if ($allGood) {
	Write-Host "Quick health check: PASSED"
	exit 0
} else {
	Write-Host "Quick health check: FAILED (see messages above)"
	exit 2
}
