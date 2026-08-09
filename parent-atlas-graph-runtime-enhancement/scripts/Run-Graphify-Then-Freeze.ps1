param([string]$Repo="C:\Users\james\Videos\deeds-web-app")
$ErrorActionPreference="Stop"
$front=Join-Path $Repo "sveltekit-frontend"
Push-Location $front
try{
 npm run graphify:daily
 if($LASTEXITCODE-ne 0){throw "graphify:daily failed"}
 Write-Host "Refresh complete. Record workspaceRevision, graphRevision, nodeCount, edgeCount before promotion."
}finally{Pop-Location}
