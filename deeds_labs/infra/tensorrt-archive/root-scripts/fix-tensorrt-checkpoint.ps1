param(
  [string]$Container = "phase66-tensorrt-llm"
)

Write-Host "🔧 Fixing TensorRT-LLM rank0.safetensors" -ForegroundColor Cyan
Write-Host "Container: $Container"

Write-Host "== STEP 1: Validate original HF shards ==" -ForegroundColor Yellow
$validateShardsPy = @"
import os
from safetensors import safe_open

src = "/workspace/engines/gemma3-legal-production/checkpoint"
files = sorted([f for f in os.listdir(src) if f.endswith(".safetensors") and "model-" in f])

if not files:
    raise SystemExit("No shard files found in " + src)

print("Found shards:", files)
for fname in files:
    path = f"{src}/{fname}"
    print("Checking", path)
    with safe_open(path, framework="pt", device="cpu") as sf:
        keys = list(sf.keys())
        print("  ✅ OK:", len(keys), "tensors")

print("✅ All shards validated successfully.")
"@

docker exec $Container python3 -c $validateShardsPy
if ($LASTEXITCODE -ne 0) {
  Write-Error "Shard validation failed"
  exit 1
}

Write-Host "== STEP 2: Merge shards -> rank0.safetensors ==" -ForegroundColor Yellow
$mergePy = @"
from pathlib import Path
from safetensors import safe_open
from safetensors.torch import save_file
import os, shutil

SRC = Path("/workspace/engines/gemma3-legal-production/checkpoint")
DST = Path("/workspace/engines/gemma3-legal-production/checkpoint_trt")
DST.mkdir(parents=True, exist_ok=True)

merged = {}
total_bytes = 0

shards = sorted(
    f for f in os.listdir(SRC)
    if f.endswith(".safetensors") and "model-" in f
)

if not shards:
    raise SystemExit("No shard files found in " + str(SRC))

print("Merging shards:", shards)

for name in shards:
    path = SRC / name
    print("  Loading", path)
    with safe_open(str(path), framework="pt", device="cpu") as sf:
        for key in sf.keys():
            if key in merged:
                continue
            tensor = sf.get_tensor(key)
            merged[key] = tensor
            total_bytes += tensor.numel() * tensor.element_size()

print("Merged", len(merged), "tensors; approx GiB:", total_bytes / (1024**3))

rank0 = DST / "rank0.safetensors"
save_file(merged, str(rank0))
print("Wrote", rank0)

for name in ["config.json", "tokenizer.json", "tokenizer.model", "tokenizer_config.json"]:
    src_file = SRC / name
    if src_file.exists():
        dst_file = DST / name
        shutil.copy(str(src_file), str(dst_file))
        print("Copied", name, "->", dst_file)
"@

docker exec $Container python3 -c $mergePy
if ($LASTEXITCODE -ne 0) {
  Write-Error "Merge failed"
  exit 1
}

Write-Host "== STEP 3: Validate rank0.safetensors ==" -ForegroundColor Yellow
$validateRankPy = @"
from safetensors import safe_open
import os

path = "/workspace/engines/gemma3-legal-production/checkpoint_trt/rank0.safetensors"
print("Opening", path)

if not os.path.exists(path):
    raise SystemExit("rank0.safetensors not found at " + path)

with safe_open(path, framework="pt", device="cpu") as f:
    keys = list(f.keys())
    print("✅ OK rank0: tensors =", len(keys))
    print("First 5:", keys[:5])
    print("Last 5:", keys[-5:])
"@

docker exec $Container python3 -c $validateRankPy
if ($LASTEXITCODE -ne 0) {
  Write-Error "rank0.safetensors validation failed"
  exit 1
}

Write-Host "✅ rank0.safetensors fixed and validated." -ForegroundColor Green
