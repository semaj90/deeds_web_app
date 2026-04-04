$logFile = "C:\Users\james\Videos\deeds-web-app\scripts\compact-vhdx-log.txt"
$vhdxPath = "C:\Users\james\AppData\Local\Docker\wsl\disk\docker_data.vhdx"

"=== VHDX Compaction $(Get-Date) ===" | Out-File $logFile -Encoding utf8
$sizeBefore = (Get-Item $vhdxPath).Length / 1GB
"Size before: $([math]::Round($sizeBefore, 2)) GB" | Out-File $logFile -Append -Encoding utf8

# Kill Docker Desktop completely
"Stopping Docker Desktop..." | Out-File $logFile -Append -Encoding utf8
Get-Process -Name "Docker Desktop" -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process -Name "com.docker*" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 3

# Shut down all WSL distros
"Shutting down WSL..." | Out-File $logFile -Append -Encoding utf8
wsl --shutdown 2>&1 | Out-File $logFile -Append -Encoding utf8
Start-Sleep -Seconds 8

# Check if file is locked
try {
    $fs = [System.IO.File]::Open($vhdxPath, 'Open', 'ReadWrite', 'None')
    $fs.Close()
    "File is NOT locked - proceeding with compact" | Out-File $logFile -Append -Encoding utf8
} catch {
    "WARNING: File still locked: $_" | Out-File $logFile -Append -Encoding utf8
    "Trying to force-terminate remaining Docker/WSL processes..." | Out-File $logFile -Append -Encoding utf8
    Get-Process | Where-Object { $_.Name -match 'docker|wsl' } | ForEach-Object {
        "  Killing: $($_.Name) (PID $($_.Id))" | Out-File $logFile -Append -Encoding utf8
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 5
}

# Run diskpart
"Running diskpart..." | Out-File $logFile -Append -Encoding utf8
$dpScript = "select vdisk file=`"$vhdxPath`"`ncompact vdisk`nexit"
$dpResult = $dpScript | diskpart 2>&1
$dpResult | Out-String | Out-File $logFile -Append -Encoding utf8

$sizeAfter = (Get-Item $vhdxPath).Length / 1GB
"Size after: $([math]::Round($sizeAfter, 2)) GB" | Out-File $logFile -Append -Encoding utf8
"Saved: $([math]::Round($sizeBefore - $sizeAfter, 2)) GB" | Out-File $logFile -Append -Encoding utf8

# Restart Docker Desktop
"Restarting Docker Desktop..." | Out-File $logFile -Append -Encoding utf8
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
"Done." | Out-File $logFile -Append -Encoding utf8