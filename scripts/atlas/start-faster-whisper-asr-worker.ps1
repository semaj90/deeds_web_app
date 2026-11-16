# Start the persistent faster-whisper ASR worker (scripts/atlas/faster-whisper-asr-worker-v1.py).
# Uses the pinned venv (faster-whisper 1.2.1, av 18.1.0). Idempotent: exits if the port already answers.
#
# usage: powershell -NoProfile -File scripts\atlas\start-faster-whisper-asr-worker.ps1
# stop:  Stop-Process -Id (Get-Content $env:TEMP\asr-worker.pid)

$ErrorActionPreference = 'Stop'
$repo    = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$python  = 'C:\Users\james\atlas-asr-venv\Scripts\python.exe'
$worker  = Join-Path $repo 'scripts\atlas\faster-whisper-asr-worker-v1.py'
$port    = if ($env:ASR_PORT) { $env:ASR_PORT } else { '8093' }
$pidFile = Join-Path $env:TEMP 'asr-worker.pid'

if (-not (Test-Path $python)) { throw "ASR venv missing: $python" }
if (-not (Test-Path $worker)) { throw "worker script missing: $worker" }

try {
	$h = Invoke-RestMethod "http://127.0.0.1:$port/health" -TimeoutSec 3
	if ($h.status -eq 'ok') { Write-Output "already running on $port"; exit 0 }
} catch { }

# Allowed roots: the Music sample folder and the pipeline's temp/media directory.
$env:PORT = $port
$env:ASR_CPU_THREADS = if ($env:ASR_CPU_THREADS) { $env:ASR_CPU_THREADS } else { '4' }
$env:ASR_ALLOWED_ROOTS = (@(
	'C:\Users\james\Music',
	(Join-Path $repo 'sveltekit-frontend\temp\media')
) -join ';')

$p = Start-Process -FilePath $python -ArgumentList $worker -PassThru -WindowStyle Hidden `
	-RedirectStandardOutput (Join-Path $env:TEMP "asr-$port.out.log") `
	-RedirectStandardError  (Join-Path $env:TEMP "asr-$port.err.log")
$p.Id | Out-File $pidFile -Encoding ascii

for ($i = 0; $i -lt 30; $i++) {
	Start-Sleep -Seconds 1
	try {
		$h = Invoke-RestMethod "http://127.0.0.1:$port/health" -TimeoutSec 2
		if ($h.status -eq 'ok') { Write-Output "started pid=$($p.Id) port=$port threads=$($h.cpu_threads)"; exit 0 }
	} catch { }
}
throw "worker did not become healthy on $port; see $env:TEMP\asr-$port.err.log"
