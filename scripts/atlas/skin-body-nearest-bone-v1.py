"""Add rigid-ish skin weights to an unskinned body mesh in a GLB (nearest J_Bip bone segments).

Why: `character_alice.glb` has a `Body` node (12 primitives, 8,432 vertices) with no skin, no JOINTS_0 and
no WEIGHTS_0, so no bone transform can deform it (only Hair and Face are skinned). This script writes a NEW
GLB (the input is never modified) where the Body node uses the existing skin 0 and every body vertex gets up
to two bone influences chosen by distance to the humanoid bone segments (`J_Bip_*`, no colliders/_end).

Assumes the Body node has an identity transform and shares the armature's bind-space coordinates (checked:
Body bounds x +-0.565, y 0..1.31 vs joints x +-0.55, y 0.04..1.13). Weights are a first approximation
(inverse-distance blend of the two nearest bone segments), not artist-quality; expect stretching at
shoulders, elbows and the dress/hips. Output is `canonicalAuthority: false` tooling evidence.

Usage: python scripts/atlas/skin-body-nearest-bone-v1.py IN.glb OUT.glb [--node Body]
"""
from __future__ import annotations

import json
import math
import struct
import sys
from pathlib import Path

COMPONENT_FLOAT = 5126
COMPONENT_USHORT = 5123
TARGET_ARRAY_BUFFER = 34962


def read_glb(path: Path):
    data = path.read_bytes()
    magic, version, _length = struct.unpack("<4sII", data[:12])
    if magic != b"glTF" or version != 2:
        raise ValueError("not a GLB v2 file")
    off, gltf, binary = 12, None, b""
    while off < len(data):
        clen, ctype = struct.unpack("<I4s", data[off:off + 8])
        chunk = data[off + 8:off + 8 + clen]
        if ctype == b"JSON":
            gltf = json.loads(chunk)
        elif ctype.startswith(b"BIN"):
            binary = chunk
        off += 8 + clen
    if gltf is None:
        raise ValueError("no JSON chunk")
    return gltf, binary


def write_glb(path: Path, gltf: dict, binary: bytes) -> None:
    js = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    js += b" " * ((4 - len(js) % 4) % 4)
    binary += b"\x00" * ((4 - len(binary) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(binary)
    path.write_bytes(
        struct.pack("<4sII", b"glTF", 2, total)
        + struct.pack("<I4s", len(js), b"JSON") + js
        + struct.pack("<I4s", len(binary), b"BIN\x00") + binary
    )


def node_matrix(n: dict):
    if "matrix" in n:
        m = n["matrix"]
        return [[m[c * 4 + r] for c in range(4)] for r in range(4)]
    t = n.get("translation", [0, 0, 0])
    x, y, z, w = n.get("rotation", [0, 0, 0, 1])
    s = n.get("scale", [1, 1, 1])
    r = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
         [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
         [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]
    return [[r[i][0] * s[0], r[i][1] * s[1], r[i][2] * s[2], t[i]] for i in range(3)] + [[0, 0, 0, 1]]


def matmul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def read_positions(gltf: dict, binary: bytes, accessor_index: int):
    acc = gltf["accessors"][accessor_index]
    if acc["componentType"] != COMPONENT_FLOAT or acc["type"] != "VEC3":
        raise ValueError("POSITION must be float VEC3")
    view = gltf["bufferViews"][acc["bufferView"]]
    base = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    stride = view.get("byteStride", 12)
    return [struct.unpack_from("<3f", binary, base + i * stride) for i in range(acc["count"])]


def seg_dist(p, a, b):
    ab = [b[i] - a[i] for i in range(3)]
    ap = [p[i] - a[i] for i in range(3)]
    denom = sum(v * v for v in ab)
    t = 0.0 if denom < 1e-12 else max(0.0, min(1.0, sum(ap[i] * ab[i] for i in range(3)) / denom))
    c = [a[i] + ab[i] * t for i in range(3)]
    return math.dist(p, c)


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        print(__doc__)
        return 2
    src, dst = Path(argv[1]), Path(argv[2])
    node_name = argv[argv.index("--node") + 1] if "--node" in argv else "Body"
    if src.resolve() == dst.resolve():
        raise SystemExit("refusing to overwrite the input GLB")
    gltf, binary = read_glb(src)
    nodes = gltf["nodes"]
    parent = {c: i for i, n in enumerate(nodes) for c in n.get("children", [])}
    cache: dict[int, list] = {}

    def world(i: int):
        if i not in cache:
            m = node_matrix(nodes[i])
            cache[i] = matmul(world(parent[i]), m) if i in parent else m
        return cache[i]

    body_idx = next(i for i, n in enumerate(nodes) if n.get("name") == node_name)
    body = nodes[body_idx]
    if body.get("skin") is not None:
        raise SystemExit(f"{node_name} already has skin {body['skin']}")
    if any(k in body for k in ("matrix", "translation", "rotation", "scale")) or body_idx in parent:
        raise SystemExit(f"{node_name} has a transform or a parent; this script assumes identity at the root")

    skin = gltf["skins"][0]
    joint_nodes = skin["joints"]
    joint_slot = {nid: s for s, nid in enumerate(joint_nodes)}
    pos = {nid: [world(nid)[r][3] for r in range(3)] for nid in joint_nodes}

    def usable(nid: int) -> bool:
        name = nodes[nid].get("name", "")
        return name.startswith("J_Bip_") and "Collider" not in name and not name.endswith("_end")

    segments = []  # (slot, a, b)
    for nid in joint_nodes:
        if not usable(nid):
            continue
        kids = [c for c in nodes[nid].get("children", []) if c in joint_slot and usable(c)]
        a = pos[nid]
        b = pos[kids[0]] if kids else a
        segments.append((joint_slot[nid], a, b))
    if not segments:
        raise SystemExit("no usable J_Bip joints")

    mesh = gltf["meshes"][body["mesh"]]
    new_binary = bytearray(binary)
    stats = {"vertices": 0, "single_influence": 0}
    for prim in mesh["primitives"]:
        points = read_positions(gltf, binary, prim["attributes"]["POSITION"])
        joints_buf, weights_buf = bytearray(), bytearray()
        for p in points:
            ranked = sorted(((seg_dist(p, a, b), slot) for slot, a, b in segments))[:2]
            raw = [1.0 / (d + 0.01) ** 3 for d, _ in ranked]
            total = sum(raw)
            w = [v / total for v in raw]
            if len(ranked) == 1 or w[1] < 0.02:
                w = [1.0, 0.0]
                stats["single_influence"] += 1
            slots = [ranked[0][1], ranked[1][1] if len(ranked) > 1 else 0]
            joints_buf += struct.pack("<4H", slots[0], slots[1], 0, 0)
            weights_buf += struct.pack("<4f", w[0], w[1], 0.0, 0.0)
            stats["vertices"] += 1
        for name, buf, ctype in (("JOINTS_0", joints_buf, COMPONENT_USHORT), ("WEIGHTS_0", weights_buf, COMPONENT_FLOAT)):
            while len(new_binary) % 4:
                new_binary.append(0)
            gltf["bufferViews"].append({"buffer": 0, "byteOffset": len(new_binary), "byteLength": len(buf), "target": TARGET_ARRAY_BUFFER})
            new_binary += buf
            gltf["accessors"].append({"bufferView": len(gltf["bufferViews"]) - 1, "componentType": ctype, "count": len(points), "type": "VEC4"})
            prim["attributes"][name] = len(gltf["accessors"]) - 1

    body["skin"] = 0
    gltf["buffers"][0]["byteLength"] = len(new_binary)
    write_glb(dst, gltf, bytes(new_binary))
    print(json.dumps({"input": str(src), "output": str(dst), "node": node_name, "primitives": len(mesh["primitives"]),
                      **stats, "bone_segments": len(segments), "skin": 0, "canonicalAuthority": False}))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
