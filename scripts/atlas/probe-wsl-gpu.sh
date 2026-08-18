#!/usr/bin/env bash
set -euo pipefail

json_escape() { python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'; }

NVIDIA_SMI="$(nvidia-smi --query-gpu=name,pci.device_id,uuid,driver_version,memory.total,memory.free,compute_cap --format=csv,noheader,nounits 2>&1 || true)"
NVCC="$(nvcc --version 2>&1 || true)"
UNAME="$(uname -a 2>&1 || true)"
DISTRO="$(. /etc/os-release 2>/dev/null && printf '%s %s' "${NAME:-unknown}" "${VERSION_ID:-unknown}" || printf 'unknown')"
LIBCUDA="$(ldconfig -p 2>/dev/null | grep -m1 'libcuda.so' || true)"
LINUX_DRIVER_PACKAGES="$(dpkg-query -W -f='${Package}\n' 'nvidia-driver-*' 'cuda-drivers*' 2>/dev/null || true)"
CUDA_VERSION="$(printf '%s' "$NVCC" | sed -nE 's/.*release ([0-9]+\.[0-9]+).*/\1/p' | head -n1)"

PYTORCH="$(python3 - <<'PY' 2>/dev/null || true
try:
 import torch
 print(f"{torch.__version__}|cuda={torch.version.cuda}|available={torch.cuda.is_available()}")
except Exception as e:
 print(f"UNAVAILABLE:{e}")
PY
)"
TRTLLM="$(python3 - <<'PY' 2>/dev/null || true
try:
 import tensorrt_llm
 print(getattr(tensorrt_llm, '__version__', 'installed-version-unknown'))
except Exception as e:
 print(f"UNAVAILABLE:{e}")
PY
)"
RAPIDS="$(python3 - <<'PY' 2>/dev/null || true
mods=['cugraph','cuvs','cudf','cupy']
for name in mods:
 try:
  m=__import__(name)
  print(f"{name}={getattr(m,'__version__','installed-version-unknown')}")
 except Exception as e:
  print(f"{name}=UNAVAILABLE:{e}")
PY
)"

if [[ -n "$LINUX_DRIVER_PACKAGES" ]]; then
  STATUS="DEGRADED"
  DRIVER_NOTE="Linux NVIDIA display/driver packages detected inside WSL; canonical CUDA-on-WSL proof must fail until removed."
elif [[ -z "$LIBCUDA" || -z "$NVIDIA_SMI" ]]; then
  STATUS="UNAVAILABLE"
  DRIVER_NOTE="Windows-driver CUDA bridge not proven."
else
  STATUS="DEGRADED"
  DRIVER_NOTE="WSL driver bridge visible; individual executor libraries still require version/capability proof."
fi

python3 - <<PY
import json
receipt = {
  "schema": "atlas.gpu-environment-receipt.v1",
  "runtime": "wsl2",
  "status": ${STATUS@Q},
  "os": "linux-wsl2",
  "distro": ${DISTRO@Q},
  "kernelRevision": ${UNAME@Q},
  "nvidiaSmi": ${NVIDIA_SMI@Q},
  "cudaToolkitRevision": ${CUDA_VERSION@Q} or None,
  "libcudaBridge": ${LIBCUDA@Q},
  "linuxDriverPackages": ${LINUX_DRIVER_PACKAGES@Q},
  "driverBridgeNote": ${DRIVER_NOTE@Q},
  "pytorch": ${PYTORCH@Q},
  "tensorrtLlm": ${TRTLLM@Q},
  "rapids": ${RAPIDS@Q},
  "expectedCurrentTensorRtLlmToolkit": "13.1",
  "notes": [
    "Do not install a Linux NVIDIA display driver inside WSL2; the Windows driver is exposed as libcuda.so.",
    "TODO(TEST-LATER): mark PROVEN only after exact TensorRT-LLM/RAPIDS/PyTorch versions and GPU execution are verified.",
    "TODO(TEST-LATER): parse nvidia-smi into stable device identity shared with the Windows environment receipt."
  ],
  "producerRevision": "probe-wsl-gpu-v1"
}
print(json.dumps(receipt, sort_keys=True))
PY
