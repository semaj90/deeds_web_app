from __future__ import annotations

import importlib.util
from pathlib import Path

import pyarrow.ipc as pa_ipc

REPO_ROOT = Path(__file__).resolve().parents[2]


def _load_builder():
    mod_path = REPO_ROOT / "scripts" / "atlas" / "build-feature-matrix-5-arrow-v1.py"
    spec = importlib.util.spec_from_file_location("build_feature_matrix_5_arrow_v1", mod_path)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_build_feature_matrix_5_arrow_writes_and_verifies_readback(tmp_path: Path):
    mod = _load_builder()
    records = [
        {
            "chunkId": "card:1",
            "sourceRef": "src/a.ts",
            "sourceRevision": "sha256:" + "a" * 64,
            "chunkSha256": "b" * 64,
            "text": "export async function run(x: number) { return x + 1; }",
            "scope": "repo:deeds",
            "pgReadbackStatus": "PROVEN",
            "admissionStatus": "INDEX_ELIGIBLE",
        },
        {
            "chunkId": "card:2",
            "sourceRef": "src/b.ts",
            "sourceRevision": "sha256:" + "c" * 64,
            "chunkSha256": "d" * 64,
            "text": "plain text without symbols",
            "scope": "other",
            "pgReadbackStatus": "PROVEN",
            "admissionStatus": "INDEX_ELIGIBLE",
        },
    ]
    arrow_out = tmp_path / "feature_matrix_5.arrow"
    receipt = mod.build_feature_matrix_5_arrow_v1(records, arrow_out)

    assert receipt["readbackVerified"] is True
    assert receipt["rowCount"] == 2
    assert receipt["executionUtilityMaskedCount"] == 2
    assert receipt["canonicalAuthority"] is False
    assert receipt["dbWritesPerformed"] is False

    with pa_ipc.open_file(arrow_out) as reader:
        tbl = reader.read_all()
        masks = tbl["presence_mask"].to_pylist()
        assert masks == [[1, 1, 1, 1, 0], [1, 1, 1, 1, 0]]
