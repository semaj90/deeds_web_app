Write-Host "=== DOCKER DISK AUDIT ==="
Write-Host ""

# WSL2 virtual disks
$wslPath = "C:\Users\james\AppData\Local\Docker\wsl"
if (Test-Path $wslPath) {
    Write-Host "--- Docker WSL2 Virtual Disks ---"
    Get-ChildItem $wslPath -Recurse -File -Filter "*.vhdx" -ErrorAction SilentlyContinue | ForEach-Object {
        Write-Host "  $($_.FullName): $([math]::Round($_.Length/1GB,2)) GB"
    }
}

# Docker data root
$dataPath = "C:\Users\james\AppData\Local\Docker"
if (Test-Path $dataPath) {
    $total = (Get-ChildItem $dataPath -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    Write-Host ""
    Write-Host "Docker total (AppData\Local\Docker): $([math]::Round($total/1GB,2)) GB"
}

# WSL distros
Write-Host ""
Write-Host "--- WSL2 Distros ---"
wsl --list --verbose 2>$null

# WSL disk sizes
Write-Host ""
Write-Host "--- All WSL2 vhdx files ---"
$wslBase = "C:\Users\james\AppData\Local\Packages"
Get-ChildItem $wslBase -Recurse -Filter "ext4.vhdx" -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "  $($_.Directory.Parent.Parent.Name): $([math]::Round($_.Length/1GB,2)) GB"
}

# Docker Desktop cache/logs
$logPath = "C:\Users\james\AppData\Roaming\Docker Desktop"
if (Test-Path $logPath) {
    $logSize = (Get-ChildItem $logPath -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    Write-Host ""
    Write-Host "Docker Desktop logs/config: $([math]::Round($logSize/1MB,0)) MB"
}
