# python/parent_atlas_tensor/tiered_prefill_dag_cache.py
import os
import mmap
import torch
from pathlib import Path
from typing import Optional

class TieredPrefillDAGCache:
    """
    3-Tier Residency Cache for Prefill KV / DAG Synthesis:
      - Tier 1: GPU VRAM (RTX TensorRT / CUDA stream resident)
      - Tier 2: Pinned Host RAM (Zero-copy DMA transfer via pin_memory)
      - Tier 3: NVMe SSD (Memory-mapped binary tensor store)
    """
    def __init__(self, ssd_dir: str = "/tmp/atlas_prefill_ssd", max_vram_items: int = 32, max_ram_items: int = 128):
        self.ssd_path = Path(ssd_dir)
        self.ssd_path.mkdir(parents=True, exist_ok=True)
        self.max_vram_items = max_vram_items
        self.max_ram_items = max_ram_items

        self.tier1_vram: dict[str, torch.Tensor] = {}
        self.tier2_pinned_ram: dict[str, torch.Tensor] = {}
        self.stream = torch.cuda.Stream() if torch.cuda.is_available() else None

    def _make_revision_bound_key(self, handoff: dict) -> str:
        # Gate enforcement: refuse to cache or retrieve without a qualified revision + admission receipt
        required = ("canonicalId", "workspaceRevision", "packetKey", "admissionReceiptId")
        for req in required:
            if not handoff.get(req):
                raise PermissionError(f"DAG Cache rejected: missing {req} in TaskEvidenceHandoffV1")
        return f"{handoff['canonicalId']}@{handoff['workspaceRevision']}::{handoff['packetKey']}"

    def put(self, handoff: dict, tensor: torch.Tensor) -> str:
        key = self._make_revision_bound_key(handoff)
        safe_filename = key.replace("/", "_").replace(":", "_") + ".pt"

        # Evict oldest VRAM entry to Tier 2 Pinned RAM if full
        if len(self.tier1_vram) >= self.max_vram_items:
            evict_k, evict_t = next(iter(self.tier1_vram.items()))
            del self.tier1_vram[evict_k]
            self.tier2_pinned_ram[evict_k] = evict_t.detach().to("cpu", non_blocking=True).pin_memory()

        # Evict oldest RAM entry to Tier 3 NVMe SSD if full
        if len(self.tier2_pinned_ram) >= self.max_ram_items:
            evict_k, evict_ram_t = next(iter(self.tier2_pinned_ram.items()))
            del self.tier2_pinned_ram[evict_k]
            torch.save(evict_ram_t, self.ssd_path / (evict_k.replace("/", "_").replace(":", "_") + ".pt"))

        # Insert into Tier 1 GPU VRAM
        device = "cuda" if torch.cuda.is_available() else "cpu"
        self.tier1_vram[key] = tensor.to(device, non_blocking=True)
        # Persist through to SSD asynchronously
        torch.save(tensor.cpu(), self.ssd_path / safe_filename)
        return key

    def get_to_vram(self, handoff: dict) -> Optional[torch.Tensor]:
        key = self._make_revision_bound_key(handoff)
        if key in self.tier1_vram:
            return self.tier1_vram[key]

        # Promote Tier 2 (Pinned RAM) -> Tier 1 (GPU VRAM) via async CUDA stream
        if key in self.tier2_pinned_ram:
            pinned = self.tier2_pinned_ram.pop(key)
            if torch.cuda.is_available() and self.stream is not None:
                with torch.cuda.stream(self.stream):
                    gpu_t = pinned.to("cuda", non_blocking=True)
                self.tier1_vram[key] = gpu_t
                return gpu_t
            return pinned

        # Promote Tier 3 (NVMe SSD) -> Tier 2 (Pinned RAM) -> Tier 1 (GPU VRAM)
        ssd_file = self.ssd_path / (key.replace("/", "_").replace(":", "_") + ".pt")
        if ssd_file.exists():
            cpu_t = torch.load(ssd_file, map_location="cpu", weights_only=True)
            if torch.cuda.is_available():
                cpu_t = cpu_t.pin_memory()
                gpu_t = cpu_t.to("cuda", non_blocking=True)
                self.tier1_vram[key] = gpu_t
                return gpu_t
            return cpu_t

        return None
