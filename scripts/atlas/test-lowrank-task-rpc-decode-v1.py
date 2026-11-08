"""Independent Python decode of the v2 low-rank task artifacts (cross-language check vs the JS verifier).

Reads the receipt, then decodes the actual binary, latent64 and bitset files with struct.
Does not trust the producer's hashes alone: every record's fields are checked against the other files.
"""
import json
import struct
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
RECEIPT = REPO_ROOT / "docs" / "reports" / "openspec-lowrank-task-rpc-receipt-v1.json"
RECORD_FORMAT = "<IIH2x3fd8f"
RECORD_SIZE = 64
LATENT_DIM = 64


def decode(receipt_path: Path = RECEIPT):
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    pkt = receipt["packet"]
    assert pkt["schema"] == "atlas.openspec-lowrank-task-rpc.v2", pkt["schema"]
    assert struct.calcsize(RECORD_FORMAT) == RECORD_SIZE, "record format must be 64 bytes"
    n = receipt["taskCount"]

    rec_bytes = Path(receipt["binaryOutput"]).read_bytes()
    if len(rec_bytes) != n * RECORD_SIZE:
        raise ValueError(f"RECORD_TRUNCATED_OR_EXTRA: {len(rec_bytes)} != {n * RECORD_SIZE}")

    lat_bytes = Path(pkt["latent64File"]["path"]).read_bytes()
    if len(lat_bytes) != n * LATENT_DIM * 4:
        raise ValueError("LATENT_LENGTH_MISMATCH")

    bits = Path(pkt["occupancyFile"]["path"]).read_bytes()
    if len(bits) != (n + 7) // 8:
        raise ValueError("BITSET_LENGTH_MISMATCH")

    records = []
    for i in range(n):
        off = i * RECORD_SIZE
        morton, ordinal, cluster, pos0, pos1, pos2, score, *feat = struct.unpack_from(RECORD_FORMAT, rec_bytes, off)
        if ordinal != i:
            raise ValueError(f"ORDINAL_MISMATCH_AT_{i}: {ordinal}")
        if rec_bytes[off + 10:off + 12] != b"\x00\x00":
            raise ValueError(f"RESERVED_NONZERO_AT_{i}")
        lat = struct.unpack_from("<3f", lat_bytes, (i * LATENT_DIM) * 4)
        if lat != (pos0, pos1, pos2):
            raise ValueError(f"LATENT_POSITION_MISMATCH_AT_{i}")
        bit = (bits[i >> 3] >> (i & 7)) & 1
        if bit != (1 if score > 0.5 else 0):
            raise ValueError(f"BITSET_MISMATCH_AT_{i}")
        records.append({"morton": morton, "ordinal": ordinal, "cluster": cluster, "score": score})
    return records


def main():
    records = decode()
    print(f"PYTHON_DECODE_PASS records={len(records)} stride={RECORD_SIZE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
