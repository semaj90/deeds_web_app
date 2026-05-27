param(
    [string]$ImageName = 'deeds-atlas-phases:latest',
    [string]$VendorWheels = '.\vendor\wheels',
    [switch]$NoCache
)

Write-Host "Building Docker image: $ImageName"
$noCacheArg = ''
if ($NoCache) { $noCacheArg = '--no-cache' }

# Resolve repository root relative to script location
$scriptDir = $PSScriptRoot
$repoRoot = (Resolve-Path (Join-Path $scriptDir '..\..\..')).Path
Write-Host "Repo root: $repoRoot"

# Prepare a minimal build context to avoid large unwanted files in the Docker context
$buildDir = Join-Path $repoRoot "sveltekit-frontend\.docker-build"
if (Test-Path $buildDir) { Remove-Item -Recurse -Force $buildDir }
New-Item -ItemType Directory -Path $buildDir | Out-Null

# Copy necessary files into build context
Copy-Item -Recurse -Force -Path (Join-Path $repoRoot 'sveltekit-frontend\package.json') -Destination $buildDir
if (Test-Path (Join-Path $repoRoot 'sveltekit-frontend\package-lock.json')) {
    Copy-Item -Force (Join-Path $repoRoot 'sveltekit-frontend\package-lock.json') -Destination $buildDir
}
Copy-Item -Recurse -Force -Path (Join-Path $repoRoot 'sveltekit-frontend\scripts\atlas') -Destination (Join-Path $buildDir 'scripts\atlas')
# Ensure Dockerfile and expected docker path exist in build context
New-Item -ItemType Directory -Path (Join-Path $buildDir 'sveltekit-frontend\docker') -Force | Out-Null
Copy-Item -Force (Join-Path $repoRoot 'sveltekit-frontend\docker\entrypoint.sh') -Destination (Join-Path $buildDir 'sveltekit-frontend\docker\entrypoint.sh')
Copy-Item -Force (Join-Path $repoRoot 'sveltekit-frontend\docker\atlas.Dockerfile') -Destination (Join-Path $buildDir 'Dockerfile')
if (Test-Path (Join-Path $repoRoot 'sveltekit-frontend\vendor\wheels')) {
    Copy-Item -Recurse -Force -Path (Join-Path $repoRoot 'sveltekit-frontend\vendor\wheels') -Destination (Join-Path $buildDir 'vendor\wheels')
}

$dockerBuildCmd = "docker build -f $buildDir\Dockerfile -t $ImageName $noCacheArg $buildDir"
Write-Host $dockerBuildCmd
Invoke-Expression $dockerBuildCmd

$pwd = (Resolve-Path 'sveltekit-frontend').Path
$vendorFull = $null
try { $vendorFull = (Resolve-Path $VendorWheels -ErrorAction Stop).Path } catch { }

if ($vendorFull) {
    $dockerRunCmd = "docker run --rm -v `"${pwd}:/work`" -v `"${vendorFull}:/vendor/wheels`" -w /work $ImageName"
} else {
    $dockerRunCmd = "docker run --rm -v `"${pwd}:/work`" -w /work $ImageName"
}

Write-Host "Running container: $dockerRunCmd"
Invoke-Expression $dockerRunCmd
