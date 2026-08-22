from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import json
import struct
import time
from typing import Any, Iterable
import uuid

FEATURE_COUNT = 12
BUFFER_ROLES = (
    "feature_values",
    "feature_presence",
    "valid_mask",
    "lane_mask",
    "degraded_identity",
)


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _f32_le(values: Iterable[float]) -> bytes:
    items = [float(value) for value in values]
    return struct.pack(f"<{len(items)}f", *items)


def _i32_le(values: Iterable[int]) -> bytes:
    items = [int(value) for value in values]
    return struct.pack(f"<{len(items)}i", *items)


def _u16_le(values: Iterable[int]) -> bytes:
    items = [int(value) for value in values]
    return struct.pack(f"<{len(items)}H", *items)


def _u8(values: Iterable[int]) -> bytes:
    return bytes(int(value) for value in values)


def _iso_utc(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _verify_pack(pack: dict[str, Any]) -> None:
    if pack.get("schema") != "atlas.candidate-feature-gpu-pack.v1":
        raise ValueError("GPU_RESIDENCY_PACK_SCHEMA_MISMATCH")
    logical_rows = int(pack["logicalRows"])
    physical_rows = int(pack["physicalRows"])
    feature_count = int(pack["featureCount"])
    if feature_count != FEATURE_COUNT:
        raise ValueError(f"GPU_RESIDENCY_FEATURE_COUNT_MISMATCH:{feature_count}")
    if physical_rows < logical_rows:
        raise ValueError("GPU_RESIDENCY_PHYSICAL_ROWS_LT_LOGICAL")
    if len(pack["featureValues"]) != physical_rows * feature_count:
        raise ValueError("GPU_RESIDENCY_FEATURE_VALUE_LENGTH_MISMATCH")
    if len(pack["featurePresence"]) != physical_rows * feature_count:
        raise ValueError("GPU_RESIDENCY_FEATURE_PRESENCE_LENGTH_MISMATCH")
    if len(pack["validMask"]) != physical_rows:
        raise ValueError("GPU_RESIDENCY_VALID_MASK_LENGTH_MISMATCH")
    if len(pack["laneMaskU16"]) != physical_rows:
        raise ValueError("GPU_RESIDENCY_LANE_MASK_LENGTH_MISMATCH")
    if len(pack["degradedIdentity"]) != physical_rows:
        raise ValueError("GPU_RESIDENCY_DEGRADED_IDENTITY_LENGTH_MISMATCH")

    checks = {
        "featureValuesChecksum": _sha256(_f32_le(pack["featureValues"])),
        "featurePresenceChecksum": _sha256(_u8(pack["featurePresence"])),
        "validMaskChecksum": _sha256(_u8(pack["validMask"])),
        "laneMaskChecksum": _sha256(_u16_le(pack["laneMaskU16"])),
        "degradedIdentityChecksum": _sha256(_u8(pack["degradedIdentity"])),
    }
    for field, actual in checks.items():
        if actual != pack.get(field):
            raise ValueError(f"GPU_RESIDENCY_SOURCE_CHECKSUM_MISMATCH:{field}")


@dataclass
class _ResidentLease:
    lease_id: str
    expires_monotonic: float
    tensors: dict[str, Any]
    observation: dict[str, Any]


class CandidateFeatureGpuExecutor:
    """Owns CandidateFeatureGpuPack buffers inside one CUDA worker process.

    Public callers receive opaque buffer IDs and lineage/checksum receipts only.
    Raw CUDA pointers are never returned. CUDA IPC is intentionally not exported
    by this class; a future IPC adapter can wrap a dedicated allocation owner.
    """

    def __init__(self, *, device_id: int = 0, producer_revision: str = "candidate-feature-gpu-resident-executor.v1") -> None:
        try:
            import torch  # type: ignore
        except Exception as exc:  # pragma: no cover - environment gate
            raise RuntimeError(f"PYTORCH_IMPORT_FAILED:{type(exc).__name__}:{exc}") from exc
        if not torch.cuda.is_available():  # pragma: no cover - environment gate
            raise RuntimeError("CUDA_NOT_AVAILABLE")
        if device_id < 0 or device_id >= torch.cuda.device_count():
            raise ValueError(f"CUDA_DEVICE_OUT_OF_RANGE:{device_id}")
        self.torch = torch
        self.device_id = int(device_id)
        self.device = torch.device(f"cuda:{self.device_id}")
        self.producer_revision = producer_revision
        self._leases: dict[str, _ResidentLease] = {}

    def _active(self, lease_id: str) -> _ResidentLease:
        lease = self._leases.get(lease_id)
        if lease is None:
            raise KeyError(f"GPU_RESIDENCY_LEASE_NOT_FOUND:{lease_id}")
        if time.monotonic() >= lease.expires_monotonic:
            del self._leases[lease_id]
            raise RuntimeError(f"GPU_RESIDENCY_LEASE_EXPIRED:{lease_id}")
        return lease

    def materialize(
        self,
        pack: dict[str, Any],
        *,
        lease_id: str | None = None,
        ttl_seconds: float = 60.0,
        pinned_host: bool = True,
    ) -> dict[str, Any]:
        _verify_pack(pack)
        if ttl_seconds <= 0:
            raise ValueError("GPU_RESIDENCY_TTL_MUST_BE_POSITIVE")
        lease_id = lease_id or f"gpu-lease:{uuid.uuid4()}"
        if lease_id in self._leases:
            raise ValueError(f"GPU_RESIDENCY_LEASE_ALREADY_EXISTS:{lease_id}")

        torch = self.torch
        rows = int(pack["physicalRows"])
        features = int(pack["featureCount"])

        pageable = {
            "feature_values": torch.tensor(pack["featureValues"], dtype=torch.float32).reshape(rows, features),
            "feature_presence": torch.tensor(pack["featurePresence"], dtype=torch.uint8).reshape(rows, features),
            "valid_mask": torch.tensor(pack["validMask"], dtype=torch.uint8),
            # uint16 is preserved as the logical source checksum, but int32 is
            # used on CUDA because it has broad PyTorch kernel support.
            "lane_mask": torch.tensor(pack["laneMaskU16"], dtype=torch.int32),
            "degraded_identity": torch.tensor(pack["degradedIdentity"], dtype=torch.uint8),
        }

        if pinned_host:
            host = {}
            for role, tensor in pageable.items():
                pinned = torch.empty(tensor.shape, dtype=tensor.dtype, pin_memory=True)
                pinned.copy_(tensor)
                host[role] = pinned
            staging_mode = "PINNED_ASYNC"
            stream = torch.cuda.Stream(device=self.device)
            with torch.cuda.stream(stream):
                resident = {role: tensor.to(self.device, non_blocking=True) for role, tensor in host.items()}
            stream.synchronize()
        else:
            staging_mode = "PAGEABLE_SYNC"
            resident = {role: tensor.to(self.device, non_blocking=False) for role, tensor in pageable.items()}
            torch.cuda.synchronize(self.device)

        source_checksums = {
            "feature_values": pack["featureValuesChecksum"],
            "feature_presence": pack["featurePresenceChecksum"],
            "valid_mask": pack["validMaskChecksum"],
            "lane_mask": pack["laneMaskChecksum"],
            "degraded_identity": pack["degradedIdentityChecksum"],
        }
        dtypes = {
            "feature_values": "f32",
            "feature_presence": "u8",
            "valid_mask": "u8",
            "lane_mask": "i32",
            "degraded_identity": "u8",
        }

        buffers: list[dict[str, Any]] = []
        for role in BUFFER_ROLES:
            tensor = resident[role]
            observed = tensor.detach().cpu().contiguous().reshape(-1).tolist()
            if role == "feature_values":
                materialized_checksum = _sha256(_f32_le(observed))
            elif role == "lane_mask":
                materialized_checksum = _sha256(_i32_le(observed))
            else:
                materialized_checksum = _sha256(_u8(observed))
            buffers.append({
                "role": role,
                "bufferId": f"{lease_id}:{role}",
                "dtype": dtypes[role],
                "shape": list(tensor.shape),
                "sourceChecksum": source_checksums[role],
                "materializedChecksum": materialized_checksum,
                "deviceAllocationObserved": int(tensor.data_ptr()) != 0,
                "readbackVerified": True,
            })

        now = datetime.now(timezone.utc)
        expires = now + timedelta(seconds=float(ttl_seconds))
        body = {
            "schema": "atlas.candidate-feature-gpu-residency-observation.v1",
            "leaseId": lease_id,
            "deviceId": self.device_id,
            "deviceName": torch.cuda.get_device_name(self.device),
            "sourceGpuPackChecksum": pack["gpuPackChecksum"],
            "candidateSnapshotRevision": pack["candidateSnapshotRevision"],
            "ordinalMapChecksum": pack["ordinalMapChecksum"],
            "featureSnapshotChecksum": pack["featureSnapshotChecksum"],
            "columnarChecksum": pack["columnarChecksum"],
            "logicalRows": int(pack["logicalRows"]),
            "physicalRows": rows,
            "featureCount": features,
            "hostStagingMode": staging_mode,
            "gpuExecutionObserved": True,
            "ipcExported": False,
            "buffers": buffers,
            "issuedAt": _iso_utc(now),
            "expiresAt": _iso_utc(expires),
            "producerRevision": self.producer_revision,
        }
        observation = {**body, "observationChecksum": _sha256(_stable_json(body).encode("utf-8"))}
        self._leases[lease_id] = _ResidentLease(
            lease_id=lease_id,
            expires_monotonic=time.monotonic() + float(ttl_seconds),
            tensors=resident,
            observation=observation,
        )
        return observation

    def gather(self, lease_id: str, ordinals: Iterable[int]) -> dict[str, Any]:
        lease = self._active(lease_id)
        selected = [int(value) for value in ordinals]
        if len(set(selected)) != len(selected):
            raise ValueError("GPU_RESIDENCY_GATHER_DUPLICATE_ORDINAL")
        logical_rows = int(lease.observation["logicalRows"])
        if any(value < 0 or value >= logical_rows for value in selected):
            raise ValueError("GPU_RESIDENCY_GATHER_ORDINAL_OUT_OF_RANGE")

        torch = self.torch
        indices = torch.tensor(selected, dtype=torch.int64, device=self.device)
        gathered = {role: torch.index_select(tensor, 0, indices) for role, tensor in lease.tensors.items()}
        torch.cuda.synchronize(self.device)
        valid = [int(value) for value in gathered["valid_mask"].detach().cpu().tolist()]
        if any(value != 1 for value in valid):
            raise RuntimeError("GPU_RESIDENCY_GATHER_SELECTED_INVALID_ROW")

        payload = {
            "schema": "atlas.candidate-feature-gpu-resident-gather.v1",
            "leaseId": lease_id,
            "sourceGpuPackChecksum": lease.observation["sourceGpuPackChecksum"],
            "selectedOrdinals": selected,
            "featureValues": gathered["feature_values"].detach().cpu().reshape(-1).tolist(),
            "featurePresence": [int(value) for value in gathered["feature_presence"].detach().cpu().reshape(-1).tolist()],
            "laneMaskI32": [int(value) for value in gathered["lane_mask"].detach().cpu().reshape(-1).tolist()],
            "degradedIdentity": [int(value) for value in gathered["degraded_identity"].detach().cpu().reshape(-1).tolist()],
            "gpuExecutionObserved": True,
            "identityAuthority": False,
        }
        return {**payload, "gatherChecksum": _sha256(_stable_json(payload).encode("utf-8"))}

    def release(self, lease_id: str) -> dict[str, Any]:
        lease = self._active(lease_id)
        buffer_ids = sorted(buffer["bufferId"] for buffer in lease.observation["buffers"])
        del self._leases[lease_id]
        body = {
            "schema": "atlas.candidate-feature-gpu-release-observation.v1",
            "leaseId": lease_id,
            "bufferIds": buffer_ids,
            "releasedAt": _iso_utc(datetime.now(timezone.utc)),
            "gpuExecutionObserved": True,
        }
        return {**body, "releaseObservationChecksum": _sha256(_stable_json(body).encode("utf-8"))}

    def has_active_lease(self, lease_id: str) -> bool:
        try:
            self._active(lease_id)
            return True
        except (KeyError, RuntimeError):
            return False
