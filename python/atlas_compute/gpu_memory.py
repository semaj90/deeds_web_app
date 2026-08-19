"""GPU memory measurement helpers with explicit measurement provenance."""

from __future__ import annotations

from dataclasses import asdict, dataclass
import os
import threading
import time
from typing import Any


@dataclass(frozen=True)
class GpuMemoryReceipt:
    schema: str
    available: bool
    measurement_source: str
    measurement_scope: str
    baseline_bytes: int | None
    peak_bytes: int | None
    peak_delta_bytes: int | None
    sample_count: int
    note: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class GpuMemorySampler:
    """Poll NVML device-wide used memory; fall back to PyTorch allocator peak.

    NVML device usage includes other processes and is therefore deliberately
    labeled device-wide. This makes cuVS/CuPy allocations visible without
    pretending they belong exclusively to the current Python process.
    """

    def __init__(self, *, device_index: int = 0, interval_seconds: float = 0.02) -> None:
        self.device_index = device_index
        self.interval_seconds = interval_seconds
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._baseline: int | None = None
        self._peak: int | None = None
        self._samples = 0
        self._mode = "unavailable"
        self._nvml = None
        self._handle = None

    def _sample_nvml(self) -> None:
        assert self._nvml is not None and self._handle is not None
        while not self._stop.is_set():
            try:
                info = self._nvml.nvmlDeviceGetMemoryInfo(self._handle)
                used = int(info.used)
                self._samples += 1
                self._peak = used if self._peak is None else max(self._peak, used)
            except Exception:
                pass
            self._stop.wait(self.interval_seconds)

    def start(self) -> "GpuMemorySampler":
        try:
            import pynvml

            pynvml.nvmlInit()
            self._nvml = pynvml
            self._handle = pynvml.nvmlDeviceGetHandleByIndex(self.device_index)
            self._baseline = int(pynvml.nvmlDeviceGetMemoryInfo(self._handle).used)
            self._peak = self._baseline
            self._mode = "nvml_device_used"
            self._thread = threading.Thread(target=self._sample_nvml, daemon=True)
            self._thread.start()
            return self
        except Exception:
            pass

        try:
            import torch

            if torch.cuda.is_available():
                torch.cuda.reset_peak_memory_stats(self.device_index)
                self._baseline = int(torch.cuda.memory_allocated(self.device_index))
                self._mode = "pytorch_allocator"
        except Exception:
            self._mode = "unavailable"
        return self

    def stop(self) -> GpuMemoryReceipt:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=max(self.interval_seconds * 4, 0.1))
        if self._mode == "nvml_device_used":
            peak = self._peak
            if self._nvml is not None:
                try:
                    self._nvml.nvmlShutdown()
                except Exception:
                    pass
            return GpuMemoryReceipt(
                schema="atlas.gpu-memory-receipt.v1",
                available=peak is not None,
                measurement_source="nvml",
                measurement_scope="device_wide_used_memory_includes_other_processes",
                baseline_bytes=self._baseline,
                peak_bytes=peak,
                peak_delta_bytes=(peak - self._baseline) if peak is not None and self._baseline is not None else None,
                sample_count=self._samples,
                note="Useful for cuVS/CuPy-inclusive envelope; not process-exclusive.",
            )

        if self._mode == "pytorch_allocator":
            try:
                import torch

                peak = int(torch.cuda.max_memory_allocated(self.device_index))
                return GpuMemoryReceipt(
                    schema="atlas.gpu-memory-receipt.v1",
                    available=True,
                    measurement_source="pytorch",
                    measurement_scope="current_process_pytorch_allocator_only",
                    baseline_bytes=self._baseline,
                    peak_bytes=peak,
                    peak_delta_bytes=(peak - self._baseline) if self._baseline is not None else None,
                    sample_count=1,
                    note="Does not include cuVS/CuPy/native CUDA allocations outside PyTorch allocator.",
                )
            except Exception:
                pass

        return GpuMemoryReceipt(
            schema="atlas.gpu-memory-receipt.v1",
            available=False,
            measurement_source="none",
            measurement_scope="none",
            baseline_bytes=None,
            peak_bytes=None,
            peak_delta_bytes=None,
            sample_count=0,
            note="Install NVML bindings or run with CUDA-enabled PyTorch for memory telemetry.",
        )
