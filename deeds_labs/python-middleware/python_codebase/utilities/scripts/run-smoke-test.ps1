param(
    [string]$RepoPath = "C:\Users\james\Videos\deeds-web-app",
    [string]$Image = "nvcr.io/nvidia/tensorrt-llm/release:latest",
    [string]$ContainerWorkdir = "/workspace/smoke-test"
)

Write-Host "Running smoke-test in container $Image" -ForegroundColor Cyan

$dockerArgs = @(
    'run','--rm','-it',
    '--gpus','all',
    '--ipc=host',
    '--ulimit','memlock=-1',
    '--ulimit','stack=67108864',
    '-v', "${RepoPath}:/workspace",
    '-w', '/workspace',
    $Image,
    'bash','-lc', "cd $ContainerWorkdir && chmod +x build.sh && ./build.sh"
)

Write-Host "Executing: docker $($dockerArgs -join ' ')" -ForegroundColor Yellow

# Start docker process
$proc = Start-Process -FilePath 'docker' -ArgumentList $dockerArgs -NoNewWindow -Wait -PassThru
if ($proc.ExitCode -ne 0) {
    Write-Host "Docker run exited with code $($proc.ExitCode)" -ForegroundColor Red
    exit $proc.ExitCode
}

Write-Host "Smoke-test container finished." -ForegroundColor Green
