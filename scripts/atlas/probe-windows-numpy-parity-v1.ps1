# Read-only NumPy environment probe. Does not create an environment or install packages.
[CmdletBinding()]
param([string]$Python = "")
$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
if (-not $Python) {
  $candidates = @(
    (Join-Path $repo ".venv-numpy-parity/Scripts/python.exe"),
    (Join-Path $repo ".venv/Scripts/python.exe")
  )
  $Python = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $Python) {
  Write-Host "No configured interpreter selected. Try: py -0p"
  Write-Host "Then run: .\scripts\atlas\probe-windows-numpy-parity-v1.ps1 -Python C:\path\to\python.exe"
  exit 2
}
if (-not (Test-Path $Python)) { Write-Error "PYTHON_NOT_FOUND: $Python"; exit 2 }
$code = @'
import json, sys, importlib.util, platform
record = {"schema":"atlas.numpy-runtime-probe.v1","python":sys.executable,"python_version":sys.version.split()[0],"platform":platform.platform(),"read_only":True}
try:
 import numpy as np
 record["numpy_version"] = np.__version__
 record["numpy_path"] = np.__file__
 from numpy.linalg import norm
 a=np.array([[1,0,0],[0,1,0]], dtype=np.float32)
 record["cpu_dot_sanity"] = float(a[0] @ a[1]) == 0.0
 record["status"]="READY" if record["cpu_dot_sanity"] else "INVALID_RESULT"
except Exception as ex:
 record["status"]="NUMPY_UNAVAILABLE"
 record["error"]=type(ex).__name__ + ": " + str(ex)
print(json.dumps(record, sort_keys=True))
sys.exit(0 if record["status"]=="READY" else 3)
'@
& $Python -c $code
exit $LASTEXITCODE
