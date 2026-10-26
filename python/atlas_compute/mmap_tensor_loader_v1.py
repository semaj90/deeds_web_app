#!/usr/bin/env python3
"""mmap_tensor_loader_v1.py — Reference loader for memory-mapped contiguous tensor blocks.

Implements TENSOR-MMAP-01 contract:
  torch.from_file(filename, shared=False, size=N * dim, dtype=torch.float32).view(N, dim)

Key constraints:
  1. device: CPU only (mmap backed host virtual address space).
  2. pin_memory: Must be False (PyTorch enforces this for file-backed storage).
  3. shared: False (MAP_PRIVATE copy-on-write) to protect canonical snapshots from disk corruption.
  4. size: Total element count (N * dim). File byte length must satisfy >= size * sizeof(dtype).
  5. Fallback: If PyTorch is unavailable, falls back to stdlib mmap + array/memoryview with identical
     candidate gather semantics.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, List, Optional, Tuple, Union

try:
    import torch
    HAVE_TORCH = True
except ImportError:
    torch = None  # type: ignore
    HAVE_TORCH = False


def load_mmap_tensor(
    filename: Union[str, Path],
    n_rows: int,
    dim: int,
    shared: bool = False,
    dtype: Any = None,
) -> Any:
    """Load a contiguous row-major float32 matrix backed by a memory-mapped file.

    Args:
        filename: Path to flat binary file (e.g. .f32bin).
        n_rows: Number of rows (candidates/chunks).
        dim: Number of columns (e.g. 768 for semantic_768).
        shared: Must be False for read-only snapshots (MAP_PRIVATE).
        dtype: PyTorch dtype (defaults to torch.float32 if PyTorch is present).

    Returns:
        torch.Tensor of shape [n_rows, dim] on CPU, or a MmapArrayFallback if torch is not installed.
    """
    path = Path(filename)
    if not path.is_file():
        raise FileNotFoundError(f"MMap tensor file does not exist: {path}")

    total_elements = n_rows * dim
    elem_bytes = 4  # float32 = 4 bytes
    required_bytes = total_elements * elem_bytes
    file_bytes = path.stat().st_size

    if file_bytes < required_bytes:
        raise ValueError(
            f"File size too small: {file_bytes} bytes, required {required_bytes} bytes "
            f"for shape [{n_rows}, {dim}]"
        )

    if HAVE_TORCH:
        if dtype is None:
            dtype = torch.float32
        # torch.from_file creates a 1D tensor of length `size`
        flat = torch.from_file(
            str(path),
            shared=shared,
            size=total_elements,
            dtype=dtype,
            device=torch.device("cpu"),
            pin_memory=False,
        )
        return flat.view(n_rows, dim)

    # Standard library fallback (zero extra dependencies)
    import mmap
    with path.open("rb") as f:
        mapped = mmap.mmap(f.fileno(), length=required_bytes, access=mmap.ACCESS_READ)
        return MmapArrayFallback(mapped, n_rows, dim)


class MmapArrayFallback:
    """Stdlib zero-copy wrapper for environments without PyTorch."""

    def __init__(self, mapped: Any, n_rows: int, dim: int):
        self._mapped = mapped
        self.shape = (n_rows, dim)
        self.n_rows = n_rows
        self.dim = dim
        self._mv = memoryview(mapped).cast("f")

    def index_select(self, dim: int, indices: List[int]) -> List[List[float]]:
        if dim != 0:
            raise NotImplementedError("Only dim=0 gather is supported in fallback")
        results = []
        for idx in indices:
            if not 0 <= idx < self.n_rows:
                raise IndexError(f"Ordinal out of bounds: {idx} (total rows: {self.n_rows})")
            start = idx * self.dim
            end = start + self.dim
            results.append(list(self._mv[start:end]))
        return results

    def close(self) -> None:
        if hasattr(self, "_mv") and self._mv is not None:
            self._mv.release()
            self._mv = None
        if hasattr(self, "_mapped") and self._mapped is not None and hasattr(self._mapped, "close"):
            self._mapped.close()
            self._mapped = None


def gather_candidate_batch(
    tensor: Any,
    candidate_ordinals: List[int],
    target_device: Optional[str] = None,
) -> Any:
    """Gather candidate rows by ordinal and optionally transfer to GPU device.

    Args:
        tensor: MMap tensor from load_mmap_tensor.
        candidate_ordinals: List of row indices to gather.
        target_device: Optional device (e.g. 'cuda:0') to transfer only the gathered slice.
    """
    if HAVE_TORCH and isinstance(tensor, torch.Tensor):
        idx_tensor = torch.tensor(candidate_ordinals, dtype=torch.long, device=tensor.device)
        batch = torch.index_select(tensor, 0, idx_tensor)
        if target_device is not None:
            return batch.to(target_device, non_blocking=True)
        return batch

    if isinstance(tensor, MmapArrayFallback):
        return tensor.index_select(0, candidate_ordinals)

    raise TypeError(f"Unsupported tensor type: {type(tensor)}")


if __name__ == "__main__":
    import array
    import tempfile

    print("=== Testing TENSOR-MMAP-01 Loader ===")
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir) / "test_matrix.f32bin"
        N_TEST, DIM_TEST = 16, 768

        # Create sample raw float32 file
        arr = array.array("f")
        for r in range(N_TEST):
            for c in range(DIM_TEST):
                arr.append(float(r * 1000 + c))
        tmp_path.write_bytes(arr.tobytes())

        # Load via loader
        mmap_t = load_mmap_tensor(tmp_path, N_TEST, DIM_TEST, shared=False)
        print(f"Loaded successfully. Type: {type(mmap_t)}, Shape: {mmap_t.shape}")

        # Gather ordinals [0, 5, 15]
        candidates = [0, 5, 15]
        gathered = gather_candidate_batch(mmap_t, candidates)

        if HAVE_TORCH and isinstance(gathered, torch.Tensor):
            assert gathered.shape == (3, 768), f"Unexpected shape {gathered.shape}"
            assert float(gathered[0, 0]) == 0.0
            assert float(gathered[1, 0]) == 5000.0
            assert float(gathered[2, 0]) == 15000.0
            print("[OK] PyTorch torch.from_file + candidate index_select verified!")
        else:
            assert len(gathered) == 3 and len(gathered[0]) == 768
            assert gathered[0][0] == 0.0
            assert gathered[1][0] == 5000.0
            assert gathered[2][0] == 15000.0
            print("[OK] Stdlib mmap fallback + candidate gather verified!")

        if hasattr(mmap_t, "close"):
            mmap_t.close()
        del mmap_t
        del gathered

    print("[OK] TENSOR-MMAP-01 Loader verification complete!")
