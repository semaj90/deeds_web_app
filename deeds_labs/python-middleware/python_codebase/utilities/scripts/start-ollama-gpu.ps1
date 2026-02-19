Param(
    [string]$OllamaPath = "ollama",
    [int]$GpuLayers = 25,
    [int]$Port = 11434,
    [int]$WaitSeconds = 15
)

Write-Host "▶️ Starting Ollama server with GPU layers=$GpuLayers (port $Port)" -ForegroundColor Cyan

try {
    # Start Ollama serve as a new background process
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $OllamaPath
    $startInfo.Arguments = "serve"
    if (-not $startInfo.EnvironmentVariables.ContainsKey("OLLAMA_PORT")) {
        $startInfo.EnvironmentVariables.Add("OLLAMA_PORT", $Port)
    }
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    $process.Start() | Out-Null

    Write-Host "Started Ollama (PID=$($process.Id)). Waiting $WaitSeconds seconds for the HTTP API to become available..." -ForegroundColor Green

    $tries = 0
    $max = [int]([math]::Ceiling($WaitSeconds / 1))
    while ($tries -lt $max) {
        Start-Sleep -Seconds 1
        try {
            $resp = Invoke-RestMethod -Uri "http://localhost:$Port/api/version" -Method Get -TimeoutSec 2 -ErrorAction Stop
            Write-Host "✅ Ollama HTTP API responding at http://localhost:$Port/api/version" -ForegroundColor Green
            Write-Host "Server version: $($resp.version ?? $resp.version_string ?? '<unknown>')" -ForegroundColor Yellow
            Write-Host "Ollama serve is running in the background (PID=$($process.Id))." -ForegroundColor Green
            return 0
        } catch {
            # continue waiting
        }
        $tries++
    }

    Write-Host "⚠️ Ollama HTTP API did not respond at http://localhost:$Port within $WaitSeconds seconds." -ForegroundColor Yellow
    Write-Host "You can inspect the process output or increase wait time. PID=$($process.Id)" -ForegroundColor Yellow
    return 2
} catch {
    Write-Host "❌ Failed to start Ollama: $($_.Exception.Message)" -ForegroundColor Red
    return 1
}
