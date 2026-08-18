param(
  [string]$TensorRtxRoot = $env:TENSORRT_RTX_ROOT,
  [string]$LibTorchRoot = $env:LIBTORCH_ROOT
)

$ErrorActionPreference = 'Stop'

function Try-Command([string]$Command, [string[]]$Args = @()) {
  try {
    $output = & $Command @Args 2>&1 | Out-String
    return @{ ok = $LASTEXITCODE -eq 0; output = $output.Trim() }
  } catch {
    return @{ ok = $false; output = $_.Exception.Message }
  }
}

$nvidiaSmi = Try-Command 'nvidia-smi' @('--query-gpu=name,pci.device_id,uuid,driver_version,memory.total,memory.free,compute_cap','--format=csv,noheader,nounits')
$nvcc = Try-Command 'nvcc' @('--version')
$trtExe = if ($TensorRtxRoot) { Join-Path $TensorRtxRoot 'bin\tensorrt_rtx.exe' } else { 'tensorrt_rtx.exe' }
$tensorrtRtx = Try-Command $trtExe @('--help')

$cudaVersion = $null
if ($nvcc.output -match 'release\s+([0-9]+\.[0-9]+)') { $cudaVersion = $Matches[1] }
$trtCudaCompatible = $cudaVersion -in @('12.9','13.4')

$receipt = [ordered]@{
  schema = 'atlas.gpu-environment-receipt.v1'
  runtime = 'windows-native'
  status = if ($nvidiaSmi.ok) { 'DEGRADED' } else { 'UNAVAILABLE' }
  os = [System.Environment]::OSVersion.VersionString
  windowsBuild = [System.Environment]::OSVersion.Version.Build.ToString()
  nvidiaSmi = $nvidiaSmi
  nvcc = $nvcc
  cudaToolkitRevision = $cudaVersion
  tensorrtRtx = @{
    root = $TensorRtxRoot
    executableProbe = $tensorrtRtx
    cudaPackageCompatible = $trtCudaCompatible
    expectedCudaFamiliesForCurrent1_6 = @('12.9 Update 1','13.4')
  }
  libtorch = @{
    root = $LibTorchRoot
    exists = [bool]($LibTorchRoot -and (Test-Path $LibTorchRoot))
  }
  notes = @(
    'TODO(TEST-LATER): parse GPU identity into pciDeviceId/deviceUuid/computeCapability fields.',
    'TODO(TEST-LATER): probe cublas/cublasLt/cusolver DLL versions from the selected CUDA toolkit.',
    'TODO(TEST-LATER): mark PROVEN only when the requested executor library and version are verified.',
    'TensorRT-RTX 1.6 is not admitted when the local CUDA toolkit is outside 12.9 Update 1 or 13.4.'
  )
  observedAt = [DateTime]::UtcNow.ToString('o')
  producerRevision = 'probe-windows-native-gpu-v1'
}

$receipt | ConvertTo-Json -Depth 8
