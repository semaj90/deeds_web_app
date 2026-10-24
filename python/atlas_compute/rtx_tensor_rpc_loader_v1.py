"""RPC tensor descriptor loader (CPU reference; GPU copy is a separate, gated step).

A packet descriptor is JSON. It names a raw little-endian float32 file by relative path, plus
offset, shape and SHA-256. The bulk floats never travel inside JSON or MessagePack.

Authority: none. A loaded tensor is a derived value. `packetKey` and `sourceRevision` are carried
through unchanged, and the loader never invents or coerces them. Stage outputs (for example an
XGBoost label or leaf index) are bound to the same `packetKey` by the caller, not by this module.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import Any, Mapping

import numpy as np
import torch

DESCRIPTOR_SCHEMA = "atlas.rpc-tensor-descriptor.v1"
_SHA256 = re.compile(r"^sha256:[0-9a-f]{64}$")


class RpcTensorError(ValueError):
    """Fail-closed refusal with a stable code in the message."""


@dataclass(frozen=True)
class LoadedRpcTensor:
    packet_key: str
    source_revision: str
    tensor: torch.Tensor
    canonical_authority: bool = False


def _require_text(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise RpcTensorError(f"{label}_INVALID")
    return value.strip()


def _require_sha(value: Any, label: str) -> str:
    text = _require_text(value, label)
    if not _SHA256.match(text):
        raise RpcTensorError(f"{label}_NOT_SHA256")
    return text


def validate_descriptor_v1(descriptor: Mapping[str, Any]) -> dict[str, Any]:
    if descriptor.get("schema") != DESCRIPTOR_SCHEMA:
        raise RpcTensorError("DESCRIPTOR_SCHEMA_UNSUPPORTED")
    tensor_ref = descriptor.get("tensorRef")
    if not isinstance(tensor_ref, Mapping):
        raise RpcTensorError("TENSOR_REF_MISSING")
    if tensor_ref.get("dtype") != "float32le":
        raise RpcTensorError("DTYPE_UNSUPPORTED")
    shape = tensor_ref.get("shape")
    if (
        not isinstance(shape, list)
        or len(shape) != 2
        or not all(isinstance(d, int) and not isinstance(d, bool) and d > 0 for d in shape)
    ):
        raise RpcTensorError("SHAPE_INVALID")
    offset = tensor_ref.get("byteOffset")
    if not isinstance(offset, int) or isinstance(offset, bool) or offset < 0:
        raise RpcTensorError("BYTE_OFFSET_INVALID")
    path = _require_text(tensor_ref.get("path"), "PATH")
    # Reject POSIX and Windows absolute forms explicitly; Path() on Windows misses "/etc/x".
    if (
        path.startswith(("/", "\\"))
        or PureWindowsPath(path).drive
        or Path(path).is_absolute()
        or ".." in PureWindowsPath(path).parts
        or ".." in PurePosixPath(path).parts
    ):
        raise RpcTensorError("PATH_NOT_RELATIVE_OR_ESCAPES_ROOT")
    return {
        "packetKey": _require_text(descriptor.get("packetKey"), "PACKET_KEY"),
        "sourceRevision": _require_sha(descriptor.get("sourceRevision"), "SOURCE_REVISION"),
        "path": path,
        "byteOffset": offset,
        "shape": (shape[0], shape[1]),
        "sha256": _require_sha(tensor_ref.get("sha256"), "TENSOR_SHA256"),
    }


def load_rpc_tensor_v1(descriptor: Mapping[str, Any], root: Path) -> LoadedRpcTensor:
    spec = validate_descriptor_v1(descriptor)
    rows, cols = spec["shape"]
    byte_length = rows * cols * 4
    full = (root / spec["path"]).resolve()
    if root.resolve() not in full.parents:
        raise RpcTensorError("PATH_ESCAPES_ROOT")
    with full.open("rb") as handle:
        handle.seek(spec["byteOffset"])
        raw = handle.read(byte_length)
    if len(raw) != byte_length:
        raise RpcTensorError("BYTE_LENGTH_MISMATCH")
    if "sha256:" + hashlib.sha256(raw).hexdigest() != spec["sha256"]:
        raise RpcTensorError("TENSOR_CHECKSUM_MISMATCH")
    array = np.frombuffer(raw, dtype="<f4").reshape(rows, cols).copy()
    if not np.isfinite(array).all():
        raise RpcTensorError("NON_FINITE_VALUES")
    return LoadedRpcTensor(
        packet_key=spec["packetKey"],
        source_revision=spec["sourceRevision"],
        tensor=torch.from_numpy(array),
    )


def cpu_parity_check_v1(loaded: LoadedRpcTensor, expected: np.ndarray) -> bool:
    """CPU reference: the loaded tensor must equal the expected array exactly (float32)."""
    if tuple(loaded.tensor.shape) != tuple(expected.shape):
        return False
    return bool(np.array_equal(loaded.tensor.numpy(), expected.astype("<f4")))
