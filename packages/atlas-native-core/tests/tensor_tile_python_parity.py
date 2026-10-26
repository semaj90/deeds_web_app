from __future__ import annotations

import subprocess
import sys
import hashlib
from pathlib import Path

repo_root = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(repo_root / "python" / "atlas_corpus_lib"))

from atlas_corpus_lib import TensorTileDescriptorV1, encode_tensor_tile_v1


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("NATIVE_SMOKE_EXECUTABLE_REQUIRED")
    native_hex = subprocess.check_output(
        [sys.argv[1], "--emit-tensor-tile-v1-fixture"], text=True
    ).strip()
    tile = TensorTileDescriptorV1(
        workspace_revision=f"sha256:{'1' * 64}",
        source_snapshot_digest=f"sha256:{'2' * 64}",
        ordinal_map_digest=f"sha256:{'3' * 64}",
        representation_revision="fixture-repr.v1",
        logical_dimension=128,
        quantization=2,
        layout=2,
        payload_hex="\\x" + bytes(range(32)).hex(),
        payload_sha256=f"sha256:{hashlib.sha256(bytes(range(32))).hexdigest()}",
        candidate_ordinal=7,
        proposal_only=True,
    )
    python_hex = encode_tensor_tile_v1(tile).hex()
    if native_hex != python_hex:
        raise AssertionError(
            f"TENSOR_TILE_PROTOBUF_BYTE_PARITY_MISMATCH native={native_hex} python={python_hex}"
        )
    print(f"C++ ↔ Python TensorTileV1 wire parity PASS ({len(bytes.fromhex(native_hex))} bytes)")


if __name__ == "__main__":
    main()
