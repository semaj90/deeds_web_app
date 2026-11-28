from __future__ import annotations

import json
import urllib.request

import torch

from python.atlas_graph_runtime.mrl_ae_bytea_codec_v1 import (
    NestedCodeAEV1,
    ae_train_loss_v1,
    bytea_to_tensor_v1,
    evaluate_archive_gate_v1,
    mrl_slice_l2_v1,
    pack_code_node_msgpack_v1,
    tensor_to_bytea_v1,
    unpack_code_node_msgpack_v1,
)


def test_bytea_f16_and_f32_roundtrip_parity() -> None:
    torch.manual_seed(7)
    t = torch.randn(768, dtype=torch.float32)
    b16 = tensor_to_bytea_v1(t, "f16")
    r16 = bytea_to_tensor_v1(b16)
    assert r16.dtype == torch.float16
    assert torch.equal(t.half(), r16)

    b32 = tensor_to_bytea_v1(t, "f32")
    r32 = bytea_to_tensor_v1(b32)
    assert r32.dtype == torch.float32
    assert torch.equal(t, r32)


def test_msgpack_code_node_roundtrip_and_ae_loss() -> None:
    torch.manual_seed(11)
    x = torch.nn.functional.normalize(torch.randn(8, 768), p=2, dim=-1)
    ae = NestedCodeAEV1()
    zs, recons = ae(x)
    ast_adj = torch.eye(8)
    loss = ae_train_loss_v1(x, zs, recons, ast_adj=ast_adj)
    assert torch.isfinite(loss) and loss.item() > 0.0

    mrl_vecs = {d: mrl_slice_l2_v1(x[0], d) for d in (768, 512, 256, 128)}
    latent_vecs = {d: zs[d][0] for d in (256, 128, 64)}
    blob = pack_code_node_msgpack_v1(
        node_id="fn:evaluate",
        filepath="scripts/atlas/evaluate.mjs",
        ast_kind="function_declaration",
        cst_span=(10, 120),
        source_revision="sha256:" + "a" * 64,
        workspace_revision="sha256:" + "b" * 64,
        mrl_vecs=mrl_vecs,
        latent_vecs=latent_vecs,
        dtype="f16",
    )
    unpacked = unpack_code_node_msgpack_v1(blob)
    assert unpacked["canonicalAuthority"] is False
    assert unpacked["cst_span"] == [10, 120]
    assert set(unpacked["mrl"].keys()) == {768, 512, 256, 128}
    assert set(unpacked["latent"].keys()) == {256, 128, 64}
    assert torch.equal(unpacked["mrl"][256], mrl_vecs[256].half())
    assert torch.equal(unpacked["latent"][64], latent_vecs[64].half())


def test_live_8094_mrl_slice_parity_and_archive_gate() -> None:
    req = urllib.request.Request(
        "http://127.0.0.1:8094/embed",
        data=json.dumps({
            "texts": ["export function handleRequest() { return 200; }"],
            "dims": [768, 512, 256, 128],
        }).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    emb_map = data["embeddings"]
    v768 = torch.tensor(emb_map["768"][0], dtype=torch.float32)
    for d in (512, 256, 128):
        v_server = torch.tensor(emb_map[str(d)][0], dtype=torch.float32)
        v_sliced = mrl_slice_l2_v1(v768, d)
        assert torch.allclose(v_server, v_sliced, atol=1e-4)

    ok = evaluate_archive_gate_v1(
        recall_at_10_coarse_to_rerank=0.97,
        cosine_recon_64=0.90,
        bytea_roundtrip_exact=True,
    )
    assert ok["status"] == "ARCHIVE_GATE_PASS"
    blocked = evaluate_archive_gate_v1(
        recall_at_10_coarse_to_rerank=0.91,
        cosine_recon_64=0.90,
        bytea_roundtrip_exact=True,
    )
    assert blocked["status"] == "ARCHIVE_GATE_BLOCKED"
