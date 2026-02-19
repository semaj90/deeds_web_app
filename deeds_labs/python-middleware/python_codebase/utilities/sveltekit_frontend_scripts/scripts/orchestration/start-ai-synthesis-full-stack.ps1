Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Resolve paths relative to this script:
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
try {
	$FrontendDir = Resolve-Path (Join-Path $ScriptDir '..\..') -ErrorAction Stop
} catch {
	Write-Error "Cannot resolve frontend directory relative to script location: $ScriptDir"
	exit 1
}

try {
	$RepoRoot = Resolve-Path (Join-Path $ScriptDir '..\..\..') -ErrorAction Stop
} catch {
	Write-Error "Cannot resolve repository root relative to script location: $ScriptDir"
	exit 1
}

function Get-PackageManager($dir) {
	if (Test-Path (Join-Path $dir 'pnpm-lock.yaml')) { return @{ Command = 'pnpm'; Args = @('dev') } }
	if (Test-Path (Join-Path $dir 'yarn.lock')) { return @{ Command = 'yarn'; Args = @('dev') } }
	if (Test-Path (Join-Path $dir 'package.json')) { return @{ Command = 'npm'; Args = @('run','dev') } }
	return $null
}

function Find-BackendDir($root) {
	$sln = Get-ChildItem -Path $root -Filter '*.sln' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
	if ($sln) { return $sln.DirectoryName }
	$csproj = Get-ChildItem -Path $root -Filter '*.csproj' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
	if ($csproj) { return $csproj.DirectoryName }
	return $null
}

$processes = @()

try {
	# Start frontend if package.json exists
	$pm = Get-PackageManager $FrontendDir
	if ($pm) {
		Write-Host "Starting frontend in $FrontendDir using $($pm.Command) $($pm.Args -join ' ')"
		$p = Start-Process -FilePath $pm.Command -ArgumentList $pm.Args -WorkingDirectory $FrontendDir -NoNewWindow -PassThru -ErrorAction Stop
		$processes += $p
		Write-Host "Frontend PID: $($p.Id)"
	} else {
		Write-Host "No package.json found in frontend directory; skipping frontend start."
	}

	# Start backend if solution or project exists
	$BackendDir = Find-BackendDir $RepoRoot
	if ($BackendDir) {
		Write-Host "Starting backend (dotnet watch run) in $BackendDir"
		$p = Start-Process -FilePath 'dotnet' -ArgumentList 'watch','run' -WorkingDirectory $BackendDir -NoNewWindow -PassThru -ErrorAction Stop
		$processes += $p
		Write-Host "Backend PID: $($p.Id)"
	} else {
		Write-Host "No .sln or .csproj found in repository root; skipping backend start."
	}

	if ($processes.Count -eq 0) {
		Write-Host "Nothing to run. Exiting."
		exit 0
	}

	Write-Host ""
	Write-Host "Dev processes started. Press Enter to stop them and exit, or close this window."
	Read-Host | Out-Null

} catch {
	Write-Error "An error occurred while starting processes: $_"
} finally {
	if ($processes.Count -gt 0) {
		Write-Host "Stopping started processes..."
		foreach ($pr in $processes) {
			try {
				if ($pr -and (Get-Process -Id $pr.Id -ErrorAction SilentlyContinue)) {
					Stop-Process -Id $pr.Id -ErrorAction SilentlyContinue -Force
					Write-Host "Stopped PID $($pr.Id)"
				}
			} catch {
				# ignore individual stop errors
			}
		}
	}
}
