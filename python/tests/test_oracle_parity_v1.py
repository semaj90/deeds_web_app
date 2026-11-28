"""Cross-check existing Parent Atlas native & Python owners against the vendored test-only oracle."""

from __future__ import annotations

import json
import hashlib
import os
import pathlib
import subprocess
from typing import Any

import numpy as np
import pytest
import torch

from python.atlas_graph_runtime.mrl_ae_bytea_codec_v1 import (
    NestedCodeAEV1,
    ae_train_loss_v1,
    bytea_to_tensor_v1,
    mrl_slice_l2_v1,
    tensor_to_bytea_v1,
)
from python.tests.oracles import atlas_reference_v1 as oracle

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
BRIDGE_NODE = pathlib.Path(os.environ.get(
    "ATLAS_ADDON_PATH",
    str(REPO_ROOT / "simd-bridge" / "cpp" / "build-x64-cuda" / "Release" / "tensorrt_bridge.node"),
)).resolve()


def test_reference_oracle_is_versioned_test_only_dependency() -> None:
    manifest_path = REPO_ROOT / "python" / "tests" / "oracles" / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    oracle_path = REPO_ROOT / "python" / "tests" / "oracles" / "atlas_reference_v1.py"
    actual_sha256 = hashlib.sha256(oracle_path.read_bytes()).hexdigest()

    assert manifest["oracleId"] == oracle.ORACLE_ID
    assert manifest["version"] == oracle.ORACLE_VERSION
    assert manifest["scope"] == oracle.ORACLE_SCOPE == "test-only"
    assert manifest["sourceFile"] == "atlas_reference_v1.py"
    assert manifest["sourceSha256"] == actual_sha256


def test_nested_code_ae_finite_difference_gradients() -> None:
    """Verify NestedCodeAEV1 autograd matches central finite differences."""
    torch.manual_seed(7)
    model = NestedCodeAEV1(in_dim=16, latents=(8, 4)).double()
    x = torch.randn(4, 16, dtype=torch.float64)
    x = x / torch.linalg.norm(x, dim=-1, keepdim=True)

    zs, recons = model(x)
    loss = ae_train_loss_v1(x, zs, recons)
    model.zero_grad()
    loss.backward()

    eps = 1e-6
    for name, param in model.named_parameters():
        assert param.grad is not None, f"missing grad for {name}"
        grad_snap = param.grad.detach().clone()
        flat_p = param.data.view(-1)
        flat_g = grad_snap.view(-1)
        for idx in range(min(8, flat_p.numel())):
            old = float(flat_p[idx])
            with torch.no_grad():
                flat_p[idx] = old + eps
                zs_hi, recons_hi = model(x)
                hi = ae_train_loss_v1(x, zs_hi, recons_hi)
                flat_p[idx] = old - eps
                zs_lo, recons_lo = model(x)
                lo = ae_train_loss_v1(x, zs_lo, recons_lo)
                flat_p[idx] = old
            fd = (float(hi) - float(lo)) / (2.0 * eps)
            assert abs(fd - float(flat_g[idx])) < 1e-5, f"{name}[{idx}] fd={fd} grad={float(flat_g[idx])}"


def test_tensorrt_bridge_masked_topk_matches_oracle() -> None:
    """Verify live N-API tensorrt_bridge.node batchCosineTopKMasked matches the scalar oracle."""
    if not BRIDGE_NODE.is_file():
        pytest.skip("tensorrt_bridge.node not built")

    rng = np.random.default_rng(42)
    n, d, k = 64, 16, 8
    mat = rng.normal(size=(n, d)).astype(np.float32)
    mat /= np.linalg.norm(mat, axis=1, keepdims=True)
    query = rng.normal(size=(d,)).astype(np.float32)
    query /= np.linalg.norm(query)
    mask_bool = (rng.random(n) > 0.35).tolist()

    oracle_res = oracle.masked_topk(query, mat, mask_bool, k, 16)

    # Pack mask into uint32 bitset for tensorrt_bridge.batchCosineTopKMasked
    words = [0] * ((n + 31) // 32)
    for i, m in enumerate(mask_bool):
        if m:
            words[i >> 5] |= 1 << (i & 31)

    js = f"""
    const addon = require({json.dumps(str(BRIDGE_NODE))});
    const mat = new Float32Array({json.dumps(mat.reshape(-1).tolist())});
    const q = new Float32Array({json.dumps(query.tolist())});
    const mask = new Uint32Array({json.dumps(words)});
    const out = addon.batchCosineTopKMasked(q, mat, {n}, {d}, {k}, mask);
    console.log(JSON.stringify({{ indices: Array.from(out.indices), scores: Array.from(out.scores), count: out.count }}));
    """
    out_raw = subprocess.check_output(["node", "-"], input=js, text=True, timeout=15)
    got = json.loads(out_raw.strip().splitlines()[-1])

    assert got["count"] == len(oracle_res)
    assert got["indices"][: got["count"]] == [idx for idx, _ in oracle_res]
    np.testing.assert_allclose(got["scores"][: got["count"]], [s for _, s in oracle_res], atol=1e-5)


def test_mrl_slice_l2_matches_oracle_norm() -> None:
    """Verify MRL prefix slicing + L2 renormalization matches oracle normalize."""
    rng = np.random.default_rng(11)
    vecs = rng.normal(size=(10, 768)).astype(np.float32)
    for dim in (768, 512, 256, 128):
        sliced = mrl_slice_l2_v1(torch.from_numpy(vecs), dim).numpy()
        expected = oracle.normalize_rows(vecs[:, :dim])
        np.testing.assert_allclose(sliced, expected, atol=1e-6)


def test_tensorrt_bridge_graph_bfs_matches_oracle() -> None:
    """Verify live N-API tensorrt_bridge.node graphBFSExtended matches oracle bounded_bfs + csr_from_edges."""
    if not BRIDGE_NODE.is_file():
        pytest.skip("tensorrt_bridge.node not built")

    n = 8
    edges = [(0, 1), (0, 2), (1, 3), (1, 4), (2, 5), (3, 6), (5, 7), (4, 6), (0, 0)]
    offsets, cols = oracle.csr_from_edges(n, edges)

    keys = [
        oracle.SourceKey("ws", "rev1", f"p{i}", f"ref{i}", f"sha{i}")
        for i in range(n)
    ]
    scope = oracle.Scope("task1", "ws", "rev1", frozenset(keys))
    neighbors: dict[Any, list[Any]] = {k: [] for k in keys}
    for u, v in edges:
        if u != v:
            neighbors[keys[u]].append(keys[v])

    oracle_bfs = oracle.bounded_bfs([keys[0]], neighbors, scope, max_depth=2, max_nodes=n, fanout=8)
    oracle_depths = {int(k.packet[1:]): depth for k, depth in oracle_bfs}

    js = f"""
    const addon = require({json.dumps(str(BRIDGE_NODE))});
    const rowPtr = new Int32Array({json.dumps(offsets.astype(np.int32).tolist())});
    const colIdx = new Int32Array({json.dumps(cols.astype(np.int32).tolist())});
    const out = addon.graphBFSExtended(rowPtr, colIdx, 0, 2, {n}, 1000);
    console.log(JSON.stringify({{
      visited: Array.from(out.visited),
      distances: Array.from(out.distances),
      truncated: out.truncated,
    }}));
    """
    out_raw = subprocess.check_output(["node", "-"], input=js, text=True, timeout=15)
    got = json.loads(out_raw.strip().splitlines()[-1])

    assert got["truncated"] == 1  # depth-3 nodes (6, 7) are bounded out at max_depth=2
    assert set(got["visited"]) == set(oracle_depths.keys())
    for node_id, depth in oracle_depths.items():
        assert got["distances"][node_id] == depth

    invalid_csr_js = f"""
    const addon = require({json.dumps(str(BRIDGE_NODE))});
    try {{
      addon.graphBFSExtended(new Int32Array([0, 1, 1]), new Int32Array([2]), 0, 1, 2, 8);
      console.log(JSON.stringify({{ rejected: false }}));
    }} catch (error) {{
      console.log(JSON.stringify({{ rejected: true, message: String(error.message) }}));
    }}
    """
    invalid_result = subprocess.check_output(
        ["node", "-"], input=invalid_csr_js, text=True, timeout=15
    )
    invalid_got = json.loads(invalid_result.strip().splitlines()[-1])
    assert invalid_got["rejected"] is True
    assert "corrupted CSR layout" in invalid_got["message"]


def test_tensorrt_bridge_nes_lut_mask_and_sharded_topk_merge() -> None:
    """Verify matchNesLutMask (scalar == AVX2) and sharded batchCosineTopKMasked + oracle.merge_topk."""
    if not BRIDGE_NODE.is_file():
        pytest.skip("tensorrt_bridge.node not built")

    rng = np.random.default_rng(99)
    n, d, k = 1280, 16, 10
    lut_bytes = rng.integers(0, 16, size=n, dtype=np.uint8)
    allowed_bytes = np.array([1, 3, 7, 12], dtype=np.uint8)
    expected_mask = np.isin(lut_bytes, allowed_bytes).tolist()

    mat = rng.normal(size=(n, d)).astype(np.float32)
    mat /= np.linalg.norm(mat, axis=1, keepdims=True)
    query = rng.normal(size=(d,)).astype(np.float32)
    query /= np.linalg.norm(query)

    oracle_full = oracle.masked_topk(query, mat, expected_mask, k, 256)

    mid = n // 2
    js = f"""
    const addon = require({json.dumps(str(BRIDGE_NODE))});
    const lut = new Uint8Array({json.dumps(lut_bytes.tolist())});
    const allowed = new Uint8Array({json.dumps(allowed_bytes.tolist())});
    const maskAvx2 = addon.matchNesLutMask(lut, allowed, 0);
    const maskScalar = addon.matchNesLutMask(lut, allowed, 1);

    const mat1 = new Float32Array({json.dumps(mat[:mid].reshape(-1).tolist())});
    const mat2 = new Float32Array({json.dumps(mat[mid:].reshape(-1).tolist())});
    const q = new Float32Array({json.dumps(query.tolist())});

    const m1 = addon.matchNesLutMask(lut.slice(0, {mid}), allowed, 0);
    const m2 = addon.matchNesLutMask(lut.slice({mid}), allowed, 0);
    const top1 = addon.batchCosineTopKMasked(q, mat1, {mid}, {d}, {k}, m1);
    const top2 = addon.batchCosineTopKMasked(q, mat2, {n - mid}, {d}, {k}, m2);

    console.log(JSON.stringify({{
      maskAvx2: Array.from(maskAvx2),
      maskScalar: Array.from(maskScalar),
      s1: Array.from(top1.indices).slice(0, top1.count).map((idx, i) => [idx, top1.scores[i]]),
      s2: Array.from(top2.indices).slice(0, top2.count).map((idx, i) => [idx + {mid}, top2.scores[i]]),
    }}));
    """
    out_raw = subprocess.check_output(["node", "-"], input=js, text=True, timeout=15)
    got = json.loads(out_raw.strip().splitlines()[-1])

    assert got["maskAvx2"] == got["maskScalar"]
    merged = oracle.merge_topk(
        [[(int(idx), float(score)) for idx, score in got["s1"]],
         [(int(idx), float(score)) for idx, score in got["s2"]]],
        k,
    )
    assert [idx for idx, _ in merged] == [idx for idx, _ in oracle_full]
    np.testing.assert_allclose([s for _, s in merged], [s for _, s in oracle_full], atol=1e-5)


def test_givens_rotation_preserves_mrl_cosine_and_ae_roundtrip() -> None:
    """Verify oracle Givens rotation preserves MRL cosines and f32 bytea roundtrip."""
    rng = np.random.default_rng(2026)
    x = rng.normal(size=(12, 768)).astype(np.float32)
    mrl_128 = mrl_slice_l2_v1(torch.from_numpy(x), 128)
    raw = tensor_to_bytea_v1(mrl_128, dtype="f32")
    restored = bytea_to_tensor_v1(raw).numpy()
    np.testing.assert_allclose(restored, mrl_128.numpy(), atol=1e-6)

    q = restored[:1]
    c = restored[1:]
    base_cos = c @ q[0]
    q_rot = oracle.givens_rotate(q, 3, 47, 0.73)
    c_rot = oracle.givens_rotate(c, 3, 47, 0.73)
    rot_cos = c_rot @ q_rot[0]
    np.testing.assert_allclose(rot_cos, base_cos, atol=1e-6)

    mean, basis, singular_values = oracle.fit_pca(restored, rank=4)
    assert mean.shape == (128,)
    assert basis.shape == (128, 4)
    assert singular_values[0] >= singular_values[-1]


def test_oracle_rejects_nan_inf_zero_norm_and_invalid_dims() -> None:
    """Verify fail-closed behavior for NaN/Inf, zero-norm, invalid dims, and invalid graph edges."""
    with pytest.raises(ValueError, match="INVALID_MATRIX"):
        oracle.normalize_rows(np.array([[1.0, np.nan], [0.0, 1.0]], dtype=np.float32))
    with pytest.raises(ValueError, match="INVALID_MATRIX"):
        oracle.normalize_rows(np.array([[1.0, np.inf], [0.0, 1.0]], dtype=np.float32))
    with pytest.raises(ValueError, match="ZERO_VECTOR"):
        oracle.normalize_rows(np.array([[0.0, 0.0], [1.0, 0.0]], dtype=np.float32))
    with pytest.raises(ValueError, match="UNSUPPORTED_MRL_DIM"):
        mrl_slice_l2_v1(torch.ones((2, 768)), 384)
    with pytest.raises(ValueError, match="EMBEDDING_DIM_TOO_SMALL"):
        mrl_slice_l2_v1(torch.ones((2, 64)), 128)
    with pytest.raises(ValueError, match="INVALID_EDGE_ENDPOINT"):
        oracle.csr_from_edges(4, [(0, 4)])
    with pytest.raises(ValueError, match="INVALID_SHARD_HIT"):
        oracle.merge_topk([[(0, float("nan"))]], 2)


def test_tensorrt_bridge_empty_mask_equal_ties_and_uneven_shards() -> None:
    """Verify empty mask, deterministic equal-score ties, and uneven shard merge parity."""
    if not BRIDGE_NODE.is_file():
        pytest.skip("tensorrt_bridge.node not built")

    rng = np.random.default_rng(314)
    # 1. All-false mask -> count=0
    n_empty, d, k = 32, 8, 5
    mat_e = rng.normal(size=(n_empty, d)).astype(np.float32)
    mat_e /= np.linalg.norm(mat_e, axis=1, keepdims=True)
    q_e = rng.normal(size=(d,)).astype(np.float32)
    q_e /= np.linalg.norm(q_e)
    assert oracle.masked_topk(q_e, mat_e, [False] * n_empty, k, 8) == []

    # 2. Equal-score ties (all rows identical) -> deterministic ascending indices
    n_tie = 12
    row = np.ones((d,), dtype=np.float32) / np.sqrt(d)
    mat_tie = np.tile(row, (n_tie, 1))
    mask_tie = [True] * n_tie
    oracle_tie = oracle.masked_topk(row, mat_tie, mask_tie, 4, 4)
    assert [idx for idx, _ in oracle_tie] == [0, 1, 2, 3]

    # 3. Uneven shards: 17, 63, 100
    sizes = [17, 63, 100]
    n_tot = sum(sizes)
    mat_u = rng.normal(size=(n_tot, d)).astype(np.float32)
    mat_u /= np.linalg.norm(mat_u, axis=1, keepdims=True)
    mask_u = (rng.random(n_tot) > 0.3).tolist()
    oracle_u = oracle.masked_topk(q_e, mat_u, mask_u, 8, 32)

    offsets = [0, 17, 80, 180]
    shards_js = []
    for idx_s, (a, b) in enumerate(zip(offsets[:-1], offsets[1:])):
        m_slice = mask_u[a:b]
        words = [0] * ((len(m_slice) + 31) // 32)
        for i, flag in enumerate(m_slice):
            if flag:
                words[i >> 5] |= 1 << (i & 31)
        shards_js.append(
            f"""(() => {{
                const m = new Float32Array({json.dumps(mat_u[a:b].reshape(-1).tolist())});
                const w = new Uint32Array({json.dumps(words)});
                const r = addon.batchCosineTopKMasked(q, m, {b - a}, {d}, 8, w);
                return Array.from(r.indices).slice(0, r.count).map((ix, j) => [ix + {a}, r.scores[j]]);
            }})()"""
        )

    js = f"""
    const addon = require({json.dumps(str(BRIDGE_NODE))});
    const q = new Float32Array({json.dumps(q_e.tolist())});
    const emptyMask = new Uint32Array([0]);
    const emptyOut = addon.batchCosineTopKMasked(
        q, new Float32Array({json.dumps(mat_e.reshape(-1).tolist())}),
        {n_empty}, {d}, {k}, emptyMask
    );
    const tieMask = new Uint32Array([{(1 << n_tie) - 1}]);
    const tieOut = addon.batchCosineTopKMasked(
        new Float32Array({json.dumps(row.tolist())}),
        new Float32Array({json.dumps(mat_tie.reshape(-1).tolist())}),
        {n_tie}, {d}, 4, tieMask
    );
    const shards = [{", ".join(shards_js)}];
    console.log(JSON.stringify({{
        emptyCount: emptyOut.count,
        tieIndices: Array.from(tieOut.indices).slice(0, tieOut.count),
        shards,
    }}));
    """
    out_raw = subprocess.check_output(["node", "-"], input=js, text=True, timeout=15)
    got = json.loads(out_raw.strip().splitlines()[-1])

    assert got["emptyCount"] == 0
    assert got["tieIndices"] == [0, 1, 2, 3]
    merged = oracle.merge_topk(
        [[(int(ix), float(sc)) for ix, sc in s] for s in got["shards"]],
        8,
    )
    assert [ix for ix, _ in merged] == [ix for ix, _ in oracle_u]
    np.testing.assert_allclose([sc for _, sc in merged], [sc for _, sc in oracle_u], atol=1e-5)


def test_tensorrt_bridge_rejects_invalid_norms_dimensions_and_overflow() -> None:
    """Keep native Top-K fail-closed for zero/non-finite vectors and lossy integer arguments."""
    if not BRIDGE_NODE.is_file():
        pytest.skip("tensorrt_bridge.node not built")

    js = f"""
    const addon = require({json.dumps(str(BRIDGE_NODE))});
    const corpus = new Float32Array([1, 0]);
    const active = new Uint32Array([1]);
    const inactive = new Uint32Array([0]);
    const cases = {{}};
    function refused(name, call) {{
      try {{ call(); cases[name] = {{ refused: false }}; }}
      catch (error) {{ cases[name] = {{ refused: true, message: String(error.message) }}; }}
    }}
    refused('zeroQuery', () => addon.batchCosineTopKMasked(new Float32Array([0,0]), corpus, 1, 2, 1, inactive));
    refused('nanQuery', () => addon.batchCosineTopKMasked(new Float32Array([NaN,0]), corpus, 1, 2, 1, active));
    refused('infiniteQuery', () => addon.batchCosineTopKMasked(new Float32Array([Infinity,0]), corpus, 1, 2, 1, active));
    refused('zeroCorpus', () => addon.batchCosineTopKMasked(new Float32Array([1,0]), new Float32Array([0,0]), 1, 2, 1, active));
    refused('nanCorpus', () => addon.batchCosineTopKMasked(new Float32Array([1,0]), new Float32Array([NaN,0]), 1, 2, 1, active));
    refused('zeroDim', () => addon.batchCosineTopKMasked(new Float32Array([1,0]), corpus, 1, 0, 1, active));
    refused('fractionalN', () => addon.batchCosineTopKMasked(new Float32Array([1,0]), corpus, 1.5, 2, 1, active));
    refused('fractionalK', () => addon.batchCosineTopKMasked(new Float32Array([1,0]), corpus, 1, 2, 1.5, active));
    refused('int32Overflow', () => addon.batchCosineTopKMasked(new Float32Array([1]), new Float32Array([1]), 2147483648, 1, 1, active));
    console.log(JSON.stringify(cases));
    """
    raw = subprocess.check_output(["node", "-"], input=js, text=True, timeout=15)
    got = json.loads(raw.strip().splitlines()[-1])
    assert all(case["refused"] for case in got.values())
    assert "non-zero norm" in got["zeroQuery"]["message"]
    assert "non-zero norm" in got["zeroCorpus"]["message"]
    assert "finite" in got["nanQuery"]["message"]
    assert "finite" in got["infiniteQuery"]["message"]


def test_tensorrt_bridge_offset_views_and_rrf_dedup_scope() -> None:
    """Verify subarray-offset TypedArray views in N-API and oracle.rrf dedup/scope filtering."""
    if not BRIDGE_NODE.is_file():
        pytest.skip("tensorrt_bridge.node not built")

    rng = np.random.default_rng(77)
    n, d, k = 16, 8, 4
    mat = rng.normal(size=(n, d)).astype(np.float32)
    mat /= np.linalg.norm(mat, axis=1, keepdims=True)
    q = rng.normal(size=(d,)).astype(np.float32)
    q /= np.linalg.norm(q)
    mask = [True] * n
    expected = oracle.masked_topk(q, mat, mask, k, 16)

    js = f"""
    const addon = require({json.dumps(str(BRIDGE_NODE))});
    const bigBuf = new ArrayBuffer((3 + {n * d} + {d} + 4) * 4);
    const matView = new Float32Array(bigBuf, 3 * 4, {n * d});
    matView.set({json.dumps(mat.reshape(-1).tolist())});
    const qView = new Float32Array(bigBuf, (3 + {n * d}) * 4, {d});
    qView.set({json.dumps(q.tolist())});
    const maskView = new Uint32Array(bigBuf, (3 + {n * d} + {d}) * 4, 1);
    maskView[0] = {(1 << n) - 1};
    const out = addon.batchCosineTopKMasked(qView, matView, {n}, {d}, {k}, maskView);
    console.log(JSON.stringify({{
        indices: Array.from(out.indices).slice(0, out.count),
        scores: Array.from(out.scores).slice(0, out.count),
    }}));
    """
    out_raw = subprocess.check_output(["node", "-"], input=js, text=True, timeout=15)
    got = json.loads(out_raw.strip().splitlines()[-1])
    assert got["indices"] == [ix for ix, _ in expected]
    np.testing.assert_allclose(got["scores"], [sc for _, sc in expected], atol=1e-5)

    # Duplicate identity + unauthorized foreign workspace rejection in oracle.rrf
    k1 = oracle.SourceKey("ws1", "rev1", "p1", "src/a.ts", "sha1")
    k2 = oracle.SourceKey("ws1", "rev1", "p2", "src/b.ts", "sha2")
    k_foreign = oracle.SourceKey("ws_other", "rev1", "p3", "src/c.ts", "sha3")
    scope = oracle.Scope("task1", "ws1", "rev1", frozenset([k1, k2]))
    fused = oracle.rrf(
        {"dense": [k1, k1, k_foreign, k2], "lexical": [k2, k1]},
        scope,
        k=5,
    )
    assert [key for key, _ in fused] == [k1, k2]
    assert abs(fused[0][1] - (1.0 / 61 + 1.0 / 62)) < 1e-12
    assert abs(fused[1][1] - (1.0 / 62 + 1.0 / 61)) < 1e-12


