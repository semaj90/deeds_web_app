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
  Write-Host "Then pass its executable with -Python. This probe never creates environments or installs packages."
  exit 2
}
if (-not (Test-Path $Python -PathType Leaf)) {
  Write-Error "PYTHON_NOT_FOUND: $Python"
  exit 2
}

$code = @'
import json, platform, sys
record = {"schema": "atlas.numpy-runtime-probe.v1", "python": sys.executable, "python_version": sys.version.split()[0], "platform": platform.platform(), "read_only": True}
try:
    import numpy as np
    vectors = np.array([[1, 0, 0], [0, 1, 0]], dtype=np.float32)
    record.update({"numpy_version": np.__version__, "numpy_path": np.__file__, "cpu_dot_sanity": float(vectors[0] @ vectors[1]) == 0.0})
    record["status"] = "READY" if record["cpu_dot_sanity"] else "INVALID_RESULT"
except Exception as error:
    record["status"] = "NUMPY_UNAVAILABLE"
    record["error"] = type(error).__name__ + ": " + str(error)
print(json.dumps(record, sort_keys=True))
sys.exit(0 if record["status"] == "READY" else 3)
'@

& $Python -c $code
exit $LASTEXITCODE
