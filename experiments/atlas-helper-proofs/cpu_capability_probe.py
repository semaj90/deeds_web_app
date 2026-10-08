"""Read-only module discovery; no native import, network call or GPU initialization."""
import importlib.util
from pathlib import Path
REPO_ROOT = Path(__file__).resolve().parents[2]
OWNER_FILES = {
    "simdjson_cpp": "simd-bridge/cpp/simdjson_bridge.cc",
    "simdjson_ts": "sveltekit-frontend/src/lib/server/gpu/simdjson-bridge.ts",
    "turbovec_proto": "proto/active/turbovec.proto",
    "turbovec_grpc_bridge": "scripts/sidecars/turbovec-grpc-bridge.mjs",
    "nlp_sidecar": "python/miniforge_nlp_sidecar.py",
    "symbol_writer": "scripts/atlas/symbol-reconciliation-writer-v1.mts",
}
def probe():
    return {"status": "STATIC_OWNER_DISCOVERY_ONLY",
            "files": {k: (REPO_ROOT / p).is_file() for k,p in OWNER_FILES.items()},
            "optional_python": {k: importlib.util.find_spec(k) is not None
                                for k in ("fastapi", "networkx", "torch")}}
