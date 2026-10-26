from __future__ import annotations

import math
import struct
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

extension_directory = Path(sys.argv[1]).resolve()
repository_root = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(extension_directory))
sys.path.insert(0, str(repository_root / "python" / "atlas_corpus_lib"))

import _atlas_native_core as native
sys.modules["atlas_corpus_lib._atlas_native_core"] = native
from atlas_corpus_lib import asymmetric_dot_4bit, assemble_lod_texture_block_128b, pack_turbovec_mrl128_bytes, radix_sort_som_candidates


vectors = [
    [float(index) for index in range(128)],
    [-1.0 if index % 2 == 0 else 1.0 for index in range(128)],
    [math.sin(index * 0.37) for index in range(128)],
    [float((index * 37) % 101 - 50) for index in range(128)],
]

for vector in vectors:
    native_payload = native.pack_turbovec_mrl128(vector)
    python_4bit = pack_turbovec_mrl128_bytes(vector, 4)
    python_2bit = pack_turbovec_mrl128_bytes(vector, 2)
    assert native_payload["bytea_4bit"] == bytes.fromhex(python_4bit.bytea_hex[2:])
    assert native_payload["bytea_2bit"] == bytes.fromhex(python_2bit.bytea_hex[2:])
    assert native_payload["sign_bitset_128"] == bytes.fromhex(python_4bit.sign_bitset_128_hex[2:])
    assert native_payload["sign_bitset_128_bit_string"] == python_4bit.sign_bitset_128_bit_string

threaded_inputs = vectors * 8
with ThreadPoolExecutor(max_workers=4) as executor:
    threaded_payloads = list(executor.map(native.pack_turbovec_mrl128, threaded_inputs))
for vector, payload in zip(threaded_inputs, threaded_payloads, strict=True):
    expected = pack_turbovec_mrl128_bytes(vector, 4)
    assert payload["bytea_4bit"] == bytes.fromhex(expected.bytea_hex[2:])
    assert payload["sign_bitset_128_bit_string"] == expected.sign_bitset_128_bit_string

batch_ordinals = [91, 14, 52, 37]
batch_som_cells = [1, 17, 205, 399]
batch_clusters = [3, 2, 5, 1]
batch_vectors = vectors * (len(batch_ordinals) // len(vectors))
batch_bytes = native.assemble_lod_texture_blocks_v1(
    [value for vector in batch_vectors for value in vector],
    len(batch_vectors),
    128,
    batch_ordinals,
    batch_som_cells,
    batch_clusters,
    4,
)
assert len(batch_bytes) == 128 * len(batch_vectors)
for index, vector in enumerate(batch_vectors):
    expected_block = native.assemble_lod_texture_block_v1(
        vector, batch_ordinals[index], batch_som_cells[index], batch_clusters[index]
    )
    assert batch_bytes[index * 128 : (index + 1) * 128] == expected_block

try:
    native.assemble_lod_texture_blocks_v1(
        [value for vector in batch_vectors for value in vector],
        len(batch_vectors),
        128,
        batch_ordinals[:-1],
        batch_som_cells,
        batch_clusters,
        2,
    )
except ValueError as error:
    assert "LOD_TILE_BATCH_SHAPE_INVALID" in str(error)
else:
    raise AssertionError("native tile batch accepted metadata arrays with different lengths")

invalid_batch_vectors = [value for vector in batch_vectors for value in vector]
invalid_batch_vectors[128] = float("nan")
try:
    native.assemble_lod_texture_blocks_v1(
        invalid_batch_vectors,
        len(batch_vectors),
        128,
        batch_ordinals,
        batch_som_cells,
        batch_clusters,
        2,
    )
except ValueError as error:
    assert "LOD_TILE_BATCH_VECTOR_INVALID_AT_ROW_1" in str(error)
else:
    raise AssertionError("native tile batch accepted a non-finite vector")

assert native.detect_rfc_or_language_proposal("detect RFC7519")["authority"] == "PROPOSAL_ONLY"

left = bytes([0b11000000]) + bytes(15)
right = bytes([0b10100000]) + bytes(15)
assert abs(native.bitset128_jaccard_similarity(left, right) - (1.0 / 3.0)) < 1e-6
int2_fixture = bytes([0b00011011]) + bytes(31)
assert native.asymmetric_dot_2bit([1.0] * 128, int2_fixture, 0.0, 0.5) == 3.0
int4_fixture = bytes([0x12]) + bytes(63)
query_4bit = [1.0] * 128
assert native.asymmetric_dot_4bit(query_4bit, int4_fixture, 0.0, 0.5) == asymmetric_dot_4bit(
    query_4bit, "\\x" + int4_fixture.hex(), 0.0, 0.5
)
pgvector_wire = struct.pack(">HH768f", 768, 0, 1.0, -2.5, *([0.0] * 766))
pgvector_values = native.unpack_pgvector_binary_768(pgvector_wire)
assert len(pgvector_values) == 768
assert pgvector_values[:3] == [1.0, -2.5, 0.0]

radix_rows = [
    {"kmeans_cluster_id": 1, "som_bmu_id": 2, "candidate_ordinal": 4, "payload": "a"},
    {"kmeans_cluster_id": 0, "som_bmu_id": 9, "candidate_ordinal": 8, "payload": "b"},
    {"kmeans_cluster_id": 1, "som_bmu_id": 2, "candidate_ordinal": 1, "payload": "c"},
]
native_calls = []
native_radix_sort = native.radix_sort_som_candidate_indices


def tracked_native_radix_sort(*args):
    native_calls.append(True)
    return native_radix_sort(*args)


native.radix_sort_som_candidate_indices = tracked_native_radix_sort
native_indices = native.radix_sort_som_candidate_indices(
    [row["kmeans_cluster_id"] for row in radix_rows],
    [row["som_bmu_id"] for row in radix_rows],
    [row["candidate_ordinal"] for row in radix_rows],
)
native_sorted_rows = [radix_rows[index] for index in native_indices]
native_calls.clear()
assert native_sorted_rows == radix_sort_som_candidates(radix_rows)
assert native_calls == [True]
try:
    native.radix_sort_som_candidate_indices([1], [400], [1])
except ValueError as error:
    assert "SOM_RADIX_KEY_OUT_OF_RANGE" in str(error)
else:
    raise AssertionError("native SOM radix accepted a cell outside the 20x20 codebook")

if len(sys.argv) > 2:
    cxx_fixture = bytes.fromhex(subprocess.check_output(
        [sys.argv[2], "--emit-lod-texture-block-v1-fixture"], text=True
    ).strip())
    python_fixture, _, _ = assemble_lod_texture_block_128b(
        mrl128_values=[float(index) for index in range(128)],
        candidate_ordinal=91,
        som_bmu_id=13,
        kmeans_cluster_id=5,
    )
    assert cxx_fixture == python_fixture
    pybind_fixture = native.assemble_lod_texture_block_v1(
        [float(index) for index in range(128)], 91, 13, 5
    )
    assert pybind_fixture == cxx_fixture == python_fixture
    try:
        native.assemble_lod_texture_block_v1([float("nan")] + [0.0] * 127, 91, 13, 5)
    except ValueError as error:
        assert "TURBOVEC_VECTOR_VALUES_MUST_BE_FINITE" in str(error)
    else:
        raise AssertionError("pybind LOD serializer accepted a non-finite vector")
