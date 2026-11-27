"""MRL (768/512/256/128) + NestedCodeAE (256/128/64) + PyTorch bytea/MsgPack codec (v1).

Proposal/candidate helpers only (`canonicalAuthority=False`). Keeps PG18 semantic_768
canonical and enforces exact little-endian f16/f32 bytea round-trip parity and
archive-gate thresholds before retiring raw 768-D snapshots to SeaweedFS/docs/archive.
"""

from __future__ import annotations

import struct
from typing import Any

try:
    import msgpack as _msgpack  # type: ignore
except ImportError:
    _msgpack = None

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F


def _mp_pack(obj: Any) -> bytes:
    if obj is None:
        return b"\xc0"
    if isinstance(obj, bool):
        return b"\xc3" if obj else b"\xc2"
    if isinstance(obj, int):
        if 0 <= obj <= 0x7F:
            return bytes([obj])
        if -32 <= obj < 0:
            return bytes([obj & 0xFF])
        if 0 <= obj <= 0xFFFFFFFF:
            return b"\xce" + struct.pack(">I", obj)
        return b"\xd3" + struct.pack(">q", obj)
    if isinstance(obj, bytes):
        n = len(obj)
        if n <= 0xFF:
            return b"\xc4" + bytes([n]) + obj
        if n <= 0xFFFF:
            return b"\xc5" + struct.pack(">H", n) + obj
        return b"\xc6" + struct.pack(">I", n) + obj
    if isinstance(obj, str):
        raw = obj.encode("utf-8")
        n = len(raw)
        if n <= 31:
            return bytes([0xA0 | n]) + raw
        if n <= 0xFF:
            return b"\xd9" + bytes([n]) + raw
        if n <= 0xFFFF:
            return b"\xda" + struct.pack(">H", n) + raw
        return b"\xdb" + struct.pack(">I", n) + raw
    if isinstance(obj, (list, tuple)):
        n = len(obj)
        hdr = bytes([0x90 | n]) if n <= 15 else (b"\xdc" + struct.pack(">H", n) if n <= 0xFFFF else b"\xdd" + struct.pack(">I", n))
        return hdr + b"".join(_mp_pack(v) for v in obj)
    if isinstance(obj, dict):
        n = len(obj)
        hdr = bytes([0x80 | n]) if n <= 15 else (b"\xde" + struct.pack(">H", n) if n <= 0xFFFF else b"\xdf" + struct.pack(">I", n))
        return hdr + b"".join(_mp_pack(str(k)) + _mp_pack(v) for k, v in obj.items())
    raise TypeError(f"UNSUPPORTED_MSGPACK_TYPE:{type(obj).__name__}")


def _mp_unpack_at(buf: memoryview, pos: int) -> tuple[Any, int]:
    b = buf[pos]
    pos += 1
    if b <= 0x7F:
        return b, pos
    if b >= 0xE0:
        return b - 256, pos
    if b == 0xC0:
        return None, pos
    if b == 0xC2:
        return False, pos
    if b == 0xC3:
        return True, pos
    if b == 0xCE:
        return struct.unpack_from(">I", buf, pos)[0], pos + 4
    if b == 0xD3:
        return struct.unpack_from(">q", buf, pos)[0], pos + 8
    if b in (0xC4, 0xC5, 0xC6):
        sz_len = {0xC4: 1, 0xC5: 2, 0xC6: 4}[b]
        n = int.from_bytes(buf[pos : pos + sz_len], "big")
        pos += sz_len
        return bytes(buf[pos : pos + n]), pos + n
    if 0xA0 <= b <= 0xBF:
        n = b & 0x1F
        return bytes(buf[pos : pos + n]).decode("utf-8"), pos + n
    if b in (0xD9, 0xDA, 0xDB):
        sz_len = {0xD9: 1, 0xDA: 2, 0xDB: 4}[b]
        n = int.from_bytes(buf[pos : pos + sz_len], "big")
        pos += sz_len
        return bytes(buf[pos : pos + n]).decode("utf-8"), pos + n
    if 0x90 <= b <= 0x9F or b in (0xDC, 0xDD):
        if 0x90 <= b <= 0x9F:
            n = b & 0x0F
        else:
            sz_len = 2 if b == 0xDC else 4
            n = int.from_bytes(buf[pos : pos + sz_len], "big")
            pos += sz_len
        out = []
        for _ in range(n):
            v, pos = _mp_unpack_at(buf, pos)
            out.append(v)
        return out, pos
    if 0x80 <= b <= 0x8F or b in (0xDE, 0xDF):
        if 0x80 <= b <= 0x8F:
            n = b & 0x0F
        else:
            sz_len = 2 if b == 0xDE else 4
            n = int.from_bytes(buf[pos : pos + sz_len], "big")
            pos += sz_len
        out_d: dict[Any, Any] = {}
        for _ in range(n):
            k, pos = _mp_unpack_at(buf, pos)
            v, pos = _mp_unpack_at(buf, pos)
            out_d[k] = v
        return out_d, pos
    raise ValueError(f"UNSUPPORTED_MSGPACK_BYTE:0x{b:02x}")

SUPPORTED_MRL_DIMS = (768, 512, 256, 128)
SUPPORTED_LATENT_DIMS = (256, 128, 64)
_DTYPE_MAP = {
    "f16": (1, np.float16),
    "f32": (2, np.float32),
}


def mrl_slice_l2_v1(emb_768: torch.Tensor, dim: int) -> torch.Tensor:
    """Truncate EmbeddingGemma 2 768-D tensor to native MRL dim and L2 re-normalize."""
    if dim not in SUPPORTED_MRL_DIMS:
        raise ValueError(f"UNSUPPORTED_MRL_DIM:{dim}")
    if emb_768.shape[-1] < dim:
        raise ValueError(f"EMBEDDING_DIM_TOO_SMALL:{emb_768.shape[-1]}<{dim}")
    return F.normalize(emb_768[..., :dim].float(), p=2, dim=-1)


def tensor_to_bytea_v1(t: torch.Tensor, dtype: str = "f16") -> bytes:
    """Pack 1D/2D tensor into deterministic little-endian `<HBB` header + raw bytes."""
    if dtype not in _DTYPE_MAP:
        raise ValueError(f"UNSUPPORTED_BYTEA_DTYPE:{dtype}")
    code, np_dt = _DTYPE_MAP[dtype]
    arr = np.ascontiguousarray(t.detach().cpu().numpy().astype(np_dt, copy=False))
    if arr.ndim not in (1, 2):
        raise ValueError(f"UNSUPPORTED_TENSOR_NDIM:{arr.ndim}")
    dim = int(arr.shape[-1])
    if dim <= 0 or dim > 65535:
        raise ValueError(f"UNSUPPORTED_TENSOR_DIM:{dim}")
    header = struct.pack("<HBB", dim, code, 0)
    return header + arr.tobytes()


def bytea_to_tensor_v1(raw: bytes | memoryview, device: str = "cpu") -> torch.Tensor:
    """Unpack `<HBB` little-endian bytea back to a PyTorch tensor."""
    mv = memoryview(raw)
    if len(mv) < 4:
        raise ValueError("BYTEA_HEADER_TRUNCATED")
    dim, code, _ = struct.unpack("<HBB", mv[:4])
    if code == 1:
        np_dt = np.dtype("<f2")
    elif code == 2:
        np_dt = np.dtype("<f4")
    else:
        raise ValueError(f"UNKNOWN_BYTEA_DTYPE_CODE:{code}")
    payload = mv[4:]
    if dim == 0 or (len(payload) % (dim * np_dt.itemsize)) != 0:
        raise ValueError("BYTEA_PAYLOAD_ALIGNMENT_INVALID")
    arr = np.frombuffer(payload, dtype=np_dt).copy()
    if arr.size > dim:
        arr = arr.reshape(-1, dim)
    return torch.from_numpy(arr).to(device)


def pack_code_node_msgpack_v1(
    *,
    node_id: str,
    filepath: str,
    ast_kind: str,
    cst_span: tuple[int, int],
    source_revision: str,
    workspace_revision: str,
    mrl_vecs: dict[int, torch.Tensor],
    latent_vecs: dict[int, torch.Tensor],
    dtype: str = "f16",
    model_id: str = "onnx-community/embeddinggemma2-q8",
) -> bytes:
    """Pack AST/CST node metadata + MRL/latent bytea vectors into canonical MessagePack."""
    if cst_span[0] < 0 or cst_span[1] <= cst_span[0]:
        raise ValueError(f"INVALID_CST_SPAN:{cst_span}")
    payload = {
        "v": 1,
        "canonicalAuthority": False,
        "model": model_id,
        "id": node_id,
        "path": filepath,
        "ast_kind": ast_kind,
        "cst_span": [int(cst_span[0]), int(cst_span[1])],
        "source_revision": source_revision,
        "workspace_revision": workspace_revision,
        "mrl": {str(int(k)): tensor_to_bytea_v1(v, dtype) for k, v in sorted(mrl_vecs.items())},
        "latent": {str(int(k)): tensor_to_bytea_v1(v, dtype) for k, v in sorted(latent_vecs.items())},
    }
    return _msgpack.packb(payload, use_bin_type=True) if _msgpack else _mp_pack(payload)


def unpack_code_node_msgpack_v1(blob: bytes, device: str = "cpu") -> dict[str, Any]:
    """Unpack canonical MessagePack node payload and restore MRL/latent PyTorch tensors."""
    obj = _msgpack.unpackb(blob, raw=False) if _msgpack else _mp_unpack_at(memoryview(blob), 0)[0]
    obj["mrl"] = {int(k): bytea_to_tensor_v1(v, device) for k, v in obj["mrl"].items()}
    obj["latent"] = {int(k): bytea_to_tensor_v1(v, device) for k, v in obj["latent"].items()}
    return obj


class NestedCodeAEV1(nn.Module):
    """Matryoshka-style nested autoencoder producing latent256/128/64 in one pass."""

    def __init__(self, in_dim: int = 768, latents: tuple[int, ...] = SUPPORTED_LATENT_DIMS):
        super().__init__()
        self.latents = latents
        self.enc = nn.Sequential(
            nn.Linear(in_dim, 512),
            nn.LayerNorm(512),
            nn.GELU(),
            nn.Linear(512, max(latents)),
        )
        self.decoders = nn.ModuleDict(
            {
                str(d): nn.Sequential(
                    nn.Linear(d, 512),
                    nn.GELU(),
                    nn.Linear(512, in_dim),
                )
                for d in latents
            }
        )

    def encode_all(self, x: torch.Tensor) -> dict[int, torch.Tensor]:
        z_full = self.enc(x)
        return {d: F.normalize(z_full[:, :d], p=2, dim=-1) for d in self.latents}

    def forward(self, x: torch.Tensor) -> tuple[dict[int, torch.Tensor], dict[int, torch.Tensor]]:
        zs = self.encode_all(x)
        recons = {d: F.normalize(self.decoders[str(d)](z), p=2, dim=-1) for d, z in zs.items()}
        return zs, recons


def ae_train_loss_v1(
    x_768: torch.Tensor,
    zs: dict[int, torch.Tensor],
    recons: dict[int, torch.Tensor],
    ast_adj: torch.Tensor | None = None,
) -> torch.Tensor:
    """Cosine reconstruction + native MRL geometry preservation + optional AST/CST affinity."""
    loss = x_768.new_zeros(())
    for d, recon in recons.items():
        loss = loss + (1.0 - (recon * x_768).sum(dim=-1)).mean()
        z = zs[d]
        sim_z = z @ z.T
        if d in (256, 128):
            mrl_d = mrl_slice_l2_v1(x_768, d)
            loss = loss + 0.25 * F.mse_loss(sim_z, mrl_d @ mrl_d.T)
        if ast_adj is not None:
            loss = loss + 0.15 * F.mse_loss(sim_z * ast_adj, ast_adj)
    return loss


def evaluate_archive_gate_v1(
    *,
    recall_at_10_coarse_to_rerank: float,
    cosine_recon_64: float,
    bytea_roundtrip_exact: bool,
    min_recall: float = 0.95,
    min_recon: float = 0.88,
) -> dict[str, Any]:
    """Fail-closed gate before archiving raw 768-D snapshots to SeaweedFS/docs/archive."""
    passed = (
        recall_at_10_coarse_to_rerank >= min_recall
        and cosine_recon_64 >= min_recon
        and bytea_roundtrip_exact is True
    )
    return {
        "schema": "atlas.mrl-ae-archive-gate.v1",
        "status": "ARCHIVE_GATE_PASS" if passed else "ARCHIVE_GATE_BLOCKED",
        "passed": passed,
        "recallAt10CoarseToRerank": recall_at_10_coarse_to_rerank,
        "cosineRecon64": cosine_recon_64,
        "byteaRoundtripExact": bytea_roundtrip_exact,
        "canonicalAuthority": False,
    }
