from __future__ import annotations

from dataclasses import dataclass, asdict
from pathlib import Path
import hashlib
import json
from typing import Iterable, Sequence

import numpy as np
import pyarrow as pa
import pyarrow.ipc as ipc


def fixed_f32(matrix: np.ndarray) -> pa.FixedSizeListArray:
    x = np.asarray(matrix, dtype=np.float32)
    if x.ndim != 2:
        raise ValueError("matrix must be rank-2")
    values = pa.array(x.reshape(-1), type=pa.float32())
    return pa.FixedSizeListArray.from_arrays(values, list_size=x.shape[1])


def feature_batch(packet_keys: Sequence[str], features: np.ndarray, topology4: np.ndarray | None = None) -> pa.RecordBatch:
    x = np.asarray(features, dtype=np.float32)
    if x.ndim != 2 or x.shape[1] != 5:
        raise ValueError("feature matrix must have shape [N,5]")
    if len(packet_keys) != x.shape[0]:
        raise ValueError("packet key count mismatch")
    cols = [pa.array(packet_keys, type=pa.string()), fixed_f32(x)]
    names = ["packet_key", "features5"]
    if topology4 is not None:
        z = np.asarray(topology4, dtype=np.float32)
        if z.shape != (x.shape[0], 4):
            raise ValueError("topology4 must have shape [N,4]")
        cols.append(fixed_f32(z))
        names.append("topology4")
    return pa.RecordBatch.from_arrays(cols, names)


def semantic_batch(packet_keys: Sequence[str], vectors: np.ndarray) -> pa.RecordBatch:
    x = np.asarray(vectors, dtype=np.float32)
    if x.ndim != 2 or x.shape[1] != 768:
        raise ValueError("semantic matrix must have shape [N,768]")
    return pa.RecordBatch.from_arrays([pa.array(packet_keys, type=pa.string()), fixed_f32(x)], ["packet_key", "semantic_768"])


def write_ipc_file(path: str | Path, batches: Sequence[pa.RecordBatch], compression: str | None = None) -> None:
    if not batches:
        raise ValueError("at least one record batch required")
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    options = ipc.IpcWriteOptions(compression=compression) if compression else ipc.IpcWriteOptions()
    with pa.OSFile(path, "wb") as sink:
        with ipc.new_file(sink, batches[0].schema, options=options) as writer:
            for batch in batches:
                if batch.schema != batches[0].schema:
                    raise ValueError("all batches must have the same schema")
                writer.write_batch(batch)


def open_mmap(path: str | Path) -> tuple[pa.MemoryMappedFile, ipc.RecordBatchFileReader]:
    source = pa.memory_map(str(path), "r")
    return source, ipc.open_file(source)


def batch_matrix(batch: pa.RecordBatch, column: str) -> np.ndarray:
    arr = batch.column(batch.schema.get_field_index(column))
    values = arr.values.to_numpy(zero_copy_only=False)
    return np.asarray(values, dtype=np.float32).reshape(len(arr), arr.type.list_size)


def sha256_file(path: str | Path) -> str:
    h = hashlib.sha256()
    with Path(path).open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()
