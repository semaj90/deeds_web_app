import hashlib
import json

import numpy as np
import pytest

from python.atlas_compute.rtx_tensor_rpc_loader_v1 import (
    RpcTensorError,
    cpu_parity_check_v1,
    load_rpc_tensor_v1,
)

ROWS, COLS = 3, 4
REV = "sha256:" + "a" * 64


def _write_fixture(root, values=None, offset=8):
    array = (np.arange(ROWS * COLS, dtype="<f4").reshape(ROWS, COLS) if values is None else values).astype("<f4")
    raw = b"\x00" * offset + array.tobytes()
    path = root / "tensors.f32le"
    path.write_bytes(raw)
    digest = "sha256:" + hashlib.sha256(array.tobytes()).hexdigest()
    descriptor = {
        "schema": "atlas.rpc-tensor-descriptor.v1",
        "packetKey": "packet:fixture-001",
        "sourceRevision": REV,
        "tensorRef": {
            "path": "tensors.f32le",
            "byteOffset": offset,
            "dtype": "float32le",
            "shape": [ROWS, COLS],
            "sha256": digest,
        },
    }
    return descriptor, array


def test_loads_exact_tensor_and_keeps_identity(tmp_path):
    descriptor, expected = _write_fixture(tmp_path)
    loaded = load_rpc_tensor_v1(descriptor, tmp_path)
    assert loaded.packet_key == "packet:fixture-001"
    assert loaded.source_revision == REV
    assert loaded.canonical_authority is False
    assert tuple(loaded.tensor.shape) == (ROWS, COLS)
    assert cpu_parity_check_v1(loaded, expected)


def test_parity_check_detects_a_different_array(tmp_path):
    descriptor, expected = _write_fixture(tmp_path)
    loaded = load_rpc_tensor_v1(descriptor, tmp_path)
    assert not cpu_parity_check_v1(loaded, expected + 1.0)


@pytest.mark.parametrize(
    ("mutate", "code"),
    [
        (lambda d: d.update(schema="atlas.other.v1"), "DESCRIPTOR_SCHEMA_UNSUPPORTED"),
        (lambda d: d.update(packetKey=""), "PACKET_KEY_INVALID"),
        (lambda d: d.update(sourceRevision="unknown"), "SOURCE_REVISION_NOT_SHA256"),
        (lambda d: d["tensorRef"].update(dtype="float16"), "DTYPE_UNSUPPORTED"),
        (lambda d: d["tensorRef"].update(shape=[0, 4]), "SHAPE_INVALID"),
        (lambda d: d["tensorRef"].update(byteOffset=-1), "BYTE_OFFSET_INVALID"),
        (lambda d: d["tensorRef"].update(path="/etc/passwd"), "PATH_NOT_RELATIVE_OR_ESCAPES_ROOT"),
        (lambda d: d["tensorRef"].update(path="../outside.bin"), "PATH_NOT_RELATIVE_OR_ESCAPES_ROOT"),
        (lambda d: d["tensorRef"].update(sha256="sha256:" + "0" * 63), "TENSOR_SHA256_NOT_SHA256"),
    ],
)
def test_refuses_invalid_descriptors(tmp_path, mutate, code):
    descriptor, _ = _write_fixture(tmp_path)
    mutate(descriptor)
    with pytest.raises(RpcTensorError, match=code):
        load_rpc_tensor_v1(descriptor, tmp_path)


def test_refuses_checksum_mismatch(tmp_path):
    descriptor, _ = _write_fixture(tmp_path)
    descriptor["tensorRef"]["sha256"] = "sha256:" + "b" * 64
    with pytest.raises(RpcTensorError, match="TENSOR_CHECKSUM_MISMATCH"):
        load_rpc_tensor_v1(descriptor, tmp_path)


def test_refuses_truncated_file(tmp_path):
    descriptor, _ = _write_fixture(tmp_path)
    (tmp_path / "tensors.f32le").write_bytes(b"\x00" * 8)
    with pytest.raises(RpcTensorError, match="BYTE_LENGTH_MISMATCH"):
        load_rpc_tensor_v1(descriptor, tmp_path)


def test_refuses_non_finite_values(tmp_path):
    values = np.arange(ROWS * COLS, dtype="<f4").reshape(ROWS, COLS)
    values[1, 1] = np.nan
    descriptor, _ = _write_fixture(tmp_path, values=values)
    with pytest.raises(RpcTensorError, match="NON_FINITE_VALUES"):
        load_rpc_tensor_v1(descriptor, tmp_path)


def test_descriptor_round_trips_as_json(tmp_path):
    descriptor, _ = _write_fixture(tmp_path)
    assert json.loads(json.dumps(descriptor)) == descriptor
