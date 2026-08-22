"""In-process CUDA residency for CandidateFeatureGpuPackV1.

This module owns live PyTorch CUDA tensors behind opaque buffer IDs. It does not
export raw device pointers or CUDA IPC handles, does not own canonical identity,
and does not mutate Postgres/Qdrant/Neo4j/Valkey.

The durable/canonical lineage remains the FEAT-03D pack checksums. A resident
lease is only an execution-time cache of those exact physical buffers.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
import secrets
from typing import Any, Literal

BufferKind = Literal[
    "FEATURE_VALUES",
    "FEATURE_PRESENCE",
    "VALID_MASK",
    "LANE_MASK_U16",
    "DEGRADED_IDENTITY",
]
StagingMode = Literal["PAGEABLE_SYNC", "PINNED_ASYNC"]

BUFFER_KINDS: tuple[BufferKind, ...] = (
    "FEATURE_VALUES",
    "FEATURE_PRESENCE",
    "VALID_MASK",
    "LANE_MASK_U16",
    "DEGRADED_IDENTITY",
)


class GpuResidentLeaseError(RuntimeError):
    pass


def _require_sha256(value: Any, name: str) -> str:
    text = str(value or "").lower()
    if len(text) != 64 or any(ch not in "0123456789abcdef" for ch in text):
        raise GpuResidentLeaseError(f"FEATURE_GPU_RESIDENT_{name}_INVALID")
    return text


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _f32_le(values: list[float]) -> bytes:
    import struct
    return b"".join(struct.pack("<f", float(value)) for value in values)


def _u16_le(values: list[int]) -> bytes:
    import struct
    return b"".join(struct.pack("<H", int(value)) for value in values)


def verify_pack_source_checksums(pack: dict[str, Any]) -> None:
    values = [float(v) for v in pack["featureValues"]]
    presence = bytes(int(v) for v in pack["featurePresence"])
    valid = bytes(int(v) for v in pack["validMask"])
    lane = _u16_le([int(v) for v in pack["laneMaskU16"]])
    degraded = bytes(int(v) for v in pack["degradedIdentity"])

    checks = {
        "featureValuesChecksum": _sha256_bytes(_f32_le(values)),
        "featurePresenceChecksum": _sha256_bytes(presence),
        "validMaskChecksum": _sha256_bytes(valid),
        "laneMaskChecksum": _sha256_bytes(lane),
        "degradedIdentityChecksum": _sha256_bytes(degraded),
    }
    for field, actual in checks.items():
        expected = _require_sha256(pack.get(field), field.upper())
        if actual != expected:
            raise GpuResidentLeaseError(f"FEATURE_GPU_RESIDENT_{field.upper()}_MISMATCH")


@dataclass
class ResidentBuffers:
    feature_values: Any
    feature_presence: Any
    valid_mask: Any
    lane_mask_u16: Any
    degraded_identity: Any


@dataclass
class ResidentLease:
    lease_id: str
    lease_epoch: int
    device_id: int
    staging_mode: StagingMode
    gpu_pack_checksum: str
    created_at: str
    expires_at: str
    buffer_ids: dict[BufferKind, str]
    buffers: ResidentBuffers
    released: bool = False


class CandidateFeatureGpuResidentStore:
    def __init__(self, device_id: int = 0):
        self.device_id = int(device_id)
        self._leases: dict[str, ResidentLease] = {}
        self._next_epoch = 1

    @staticmethod
    def _torch():
        try:
            import torch  # type: ignore
        except Exception as exc:
            raise GpuResidentLeaseError(f"PYTORCH_IMPORT_FAILED:{type(exc).__name__}:{exc}") from exc
        if not torch.cuda.is_available():
            raise GpuResidentLeaseError("CUDA_NOT_AVAILABLE")
        return torch

    @staticmethod
    def _parse_time(value: str) -> datetime:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)

    def create(
        self,
        *,
        pack: dict[str, Any],
        lease_id: str,
        created_at: str,
        expires_at: str,
        staging_mode: StagingMode,
    ) -> ResidentLease:
        if not lease_id or lease_id in self._leases:
            raise GpuResidentLeaseError("FEATURE_GPU_RESIDENT_LEASE_ID_INVALID_OR_DUPLICATE")
        if staging_mode not in ("PAGEABLE_SYNC", "PINNED_ASYNC"):
            raise GpuResidentLeaseError("FEATURE_GPU_RESIDENT_STAGING_MODE_INVALID")
        if self._parse_time(expires_at) <= self._parse_time(created_at):
            raise GpuResidentLeaseError("FEATURE_GPU_RESIDENT_EXPIRY_INVALID")

        verify_pack_source_checksums(pack)
        torch = self._torch()
        device = torch.device(f"cuda:{self.device_id}")
        physical_rows = int(pack["physicalRows"])
        feature_count = int(pack["featureCount"])

        cpu_values = torch.tensor(pack["featureValues"], dtype=torch.float32).reshape(physical_rows, feature_count)
        cpu_presence = torch.tensor(pack["featurePresence"], dtype=torch.uint8).reshape(physical_rows, feature_count)
        cpu_valid = torch.tensor(pack["validMask"], dtype=torch.uint8)
        # PyTorch has no uint16 tensor dtype. Keep the exact u16 source checksum,
        # then represent values losslessly as int32 on device for gather kernels.
        cpu_lane = torch.tensor(pack["laneMaskU16"], dtype=torch.int32)
        cpu_degraded = torch.tensor(pack["degradedIdentity"], dtype=torch.uint8)

        host = [cpu_values, cpu_presence, cpu_valid, cpu_lane, cpu_degraded]
        non_blocking = staging_mode == "PINNED_ASYNC"
        if non_blocking:
            host = [tensor.pin_memory() for tensor in host]

        stream = torch.cuda.Stream(device=device) if non_blocking else None
        if stream is None:
            gpu = [tensor.to(device, non_blocking=False) for tensor in host]
            torch.cuda.synchronize(device)
        else:
            with torch.cuda.stream(stream):
                gpu = [tensor.to(device, non_blocking=True) for tensor in host]
            stream.synchronize()

        buffer_ids: dict[BufferKind, str] = {
            kind: f"gpu:{self.device_id}:{lease_id}:{kind.lower()}:{secrets.token_hex(8)}"
            for kind in BUFFER_KINDS
        }
        lease = ResidentLease(
            lease_id=lease_id,
            lease_epoch=self._next_epoch,
            device_id=self.device_id,
            staging_mode=staging_mode,
            gpu_pack_checksum=_require_sha256(pack.get("gpuPackChecksum"), "GPU_PACK_CHECKSUM"),
            created_at=created_at,
            expires_at=expires_at,
            buffer_ids=buffer_ids,
            buffers=ResidentBuffers(*gpu),
        )
        self._next_epoch += 1
        self._leases[lease_id] = lease
        return lease

    def require_active(self, lease_id: str, *, now: str) -> ResidentLease:
        lease = self._leases.get(lease_id)
        if lease is None:
            raise GpuResidentLeaseError("FEATURE_GPU_RESIDENT_LEASE_NOT_FOUND")
        if lease.released:
            raise GpuResidentLeaseError("FEATURE_GPU_RESIDENT_LEASE_RELEASED")
        if self._parse_time(now) >= self._parse_time(lease.expires_at):
            raise GpuResidentLeaseError("FEATURE_GPU_RESIDENT_LEASE_EXPIRED")
        return lease

    def gather(self, lease_id: str, selected_ordinals: list[int], *, now: str) -> dict[str, Any]:
        lease = self.require_active(lease_id, now=now)
        torch = self._torch()
        logical_rows = int(lease.buffers.valid_mask.sum().item())
        if len(set(selected_ordinals)) != len(selected_ordinals):
            raise GpuResidentLeaseError("FEATURE_GPU_RESIDENT_DUPLICATE_ORDINAL")
        if any(value < 0 or value >= logical_rows for value in selected_ordinals):
            raise GpuResidentLeaseError("FEATURE_GPU_RESIDENT_ORDINAL_OUT_OF_RANGE")

        device = torch.device(f"cuda:{lease.device_id}")
        ordinals = torch.tensor(selected_ordinals, dtype=torch.int64, device=device)
        gathered_values = torch.index_select(lease.buffers.feature_values, 0, ordinals)
        gathered_presence = torch.index_select(lease.buffers.feature_presence, 0, ordinals)
        gathered_valid = torch.index_select(lease.buffers.valid_mask, 0, ordinals)
        gathered_lane = torch.index_select(lease.buffers.lane_mask_u16, 0, ordinals)
        gathered_degraded = torch.index_select(lease.buffers.degraded_identity, 0, ordinals)
        torch.cuda.synchronize(device)

        if any(int(value) != 1 for value in gathered_valid.cpu().tolist()):
            raise GpuResidentLeaseError("FEATURE_GPU_RESIDENT_SELECTED_INVALID_ROW")

        result = {
            "selectedOrdinals": selected_ordinals,
            "featureValues": gathered_values.cpu().reshape(-1).tolist(),
            "featurePresence": [int(v) for v in gathered_presence.cpu().reshape(-1).tolist()],
            "laneMaskU16": [int(v) for v in gathered_lane.cpu().tolist()],
            "degradedIdentity": [int(v) for v in gathered_degraded.cpu().tolist()],
        }
        result["observedChecksum"] = hashlib.sha256(
            json.dumps(result, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()
        return result

    def release(self, lease_id: str) -> ResidentLease:
        lease = self._leases.get(lease_id)
        if lease is None:
            raise GpuResidentLeaseError("FEATURE_GPU_RESIDENT_LEASE_NOT_FOUND")
        if lease.released:
            raise GpuResidentLeaseError("FEATURE_GPU_RESIDENT_LEASE_ALREADY_RELEASED")
        lease.released = True
        # Drop the only strong references to the CUDA tensors held by this store.
        lease.buffers = ResidentBuffers(None, None, None, None, None)
        return lease
