"""Rewrite com.microsoft::RotaryEmbedding in EmbeddingGemma2 FP32 ONNX to standard ai.onnx ops.

Reuses the existing external weights file (model.onnx_data) in-place without
duplicating the 1.08 GB weights. Verifies CPU numerical parity against model.onnx
and tests strict NvTensorRTRTXExecutionProvider compilation with
session.disable_cpu_ep_fallback=1.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import onnx
from onnx import TensorProto, helper
import onnxruntime as ort
import onnxruntime_ep_nv_tensorrt_rtx as trt_ep

REPO_ROOT = Path(__file__).resolve().parents[2]
ONNX_DIR = REPO_ROOT / "models" / "embeddinggemma2" / "onnx-trt-rtx" / "onnx"
SRC_MODEL = ONNX_DIR / "model.onnx"
DST_MODEL = ONNX_DIR / "model_trt.onnx"
PROBE_MODEL = ONNX_DIR / "model_probe.onnx"
CACHE_DIR = REPO_ROOT / "models" / "embeddinggemma2" / "onnx-trt-rtx" / "cache" / "sm86" / "convert-verify"


def convert_rotary_to_standard_ops() -> dict:
    if PROBE_MODEL.exists():
        PROBE_MODEL.unlink()

    model = onnx.load(str(SRC_MODEL), load_external_data=False)
    graph = model.graph

    # Shared constants for standard RoPE rewrite (dynamic head_dim = cos_dim * 2, interleaved=0)
    const_axes_02 = helper.make_tensor("rope_std_axes_02", TensorProto.INT64, [2], [0, 2])
    const_neg_one = helper.make_tensor("rope_std_neg_one", TensorProto.INT64, [1], [-1])
    const_two = helper.make_tensor("rope_std_two", TensorProto.INT64, [1], [2])
    const_slice_0 = helper.make_tensor("rope_std_slice_0", TensorProto.INT64, [1], [0])
    const_slice_1 = helper.make_tensor("rope_std_slice_1", TensorProto.INT64, [1], [1])
    const_slice_2 = helper.make_tensor("rope_std_slice_2", TensorProto.INT64, [1], [2])
    graph.initializer.extend([const_axes_02, const_neg_one, const_two, const_slice_0, const_slice_1, const_slice_2])

    # Pre-unsqueeze each unique (cos, sin) pair once and compute dynamic head_dim = Shape(cos)[1] * 2
    cos_sin_unsqueezed: dict[str, str] = {}
    cos_head_dim: dict[str, str] = {}
    new_nodes = []
    replaced = 0

    for idx, node in enumerate(graph.node):
        if node.op_type != "RotaryEmbedding":
            new_nodes.append(node)
            continue

        replaced += 1
        x_name, _pos_ids, cos_name, sin_name = node.input
        out_name = node.output[0]
        prefix = f"/rope_std_{idx}"

        for tensor_name in (cos_name, sin_name):
            if tensor_name not in cos_sin_unsqueezed:
                u_name = f"{prefix}/unsq_{len(cos_sin_unsqueezed)}"
                new_nodes.append(
                    helper.make_node(
                        "Unsqueeze",
                        inputs=[tensor_name, "rope_std_axes_02"],
                        outputs=[u_name],
                        name=f"{prefix}_unsq_{len(cos_sin_unsqueezed)}",
                    )
                )
                cos_sin_unsqueezed[tensor_name] = u_name

        if cos_name not in cos_head_dim:
            c_shape = f"{prefix}/c_shape"
            c_half = f"{prefix}/c_half"
            c_full = f"{prefix}/c_full"
            new_nodes.extend([
                helper.make_node("Shape", inputs=[cos_name], outputs=[c_shape], name=f"{prefix}_c_shape"),
                helper.make_node("Slice", inputs=[c_shape, "rope_std_slice_1", "rope_std_slice_2"], outputs=[c_half], name=f"{prefix}_c_half"),
                helper.make_node("Mul", inputs=[c_half, "rope_std_two"], outputs=[c_full], name=f"{prefix}_c_full"),
            ])
            cos_head_dim[cos_name] = c_full

        cos_u = cos_sin_unsqueezed[cos_name]
        sin_u = cos_sin_unsqueezed[sin_name]
        head_dim_t = cos_head_dim[cos_name]

        # Dynamic reshape: [B, S, num_heads * head_dim] -> [B, S, -1, head_dim]
        x_shape = f"{prefix}/x_shape"
        bs_shape = f"{prefix}/bs_shape"
        target_shape = f"{prefix}/target_shape"
        x_4d = f"{prefix}/x_4d"
        x1 = f"{prefix}/x1"
        x2 = f"{prefix}/x2"
        x1_cos = f"{prefix}/x1_cos"
        x2_sin = f"{prefix}/x2_sin"
        y1 = f"{prefix}/y1"
        x2_cos = f"{prefix}/x2_cos"
        x1_sin = f"{prefix}/x1_sin"
        y2 = f"{prefix}/y2"
        y_4d = f"{prefix}/y_4d"

        new_nodes.extend([
            helper.make_node("Shape", inputs=[x_name], outputs=[x_shape], name=f"{prefix}_shape"),
            helper.make_node(
                "Slice",
                inputs=[x_shape, "rope_std_slice_0", "rope_std_slice_2"],
                outputs=[bs_shape],
                name=f"{prefix}_slice_bs",
            ),
            helper.make_node("Concat", inputs=[bs_shape, "rope_std_neg_one", head_dim_t], outputs=[target_shape], axis=0, name=f"{prefix}_concat_shape"),
            helper.make_node("Reshape", inputs=[x_name, target_shape], outputs=[x_4d], name=f"{prefix}_reshape_4d"),
            helper.make_node("Split", inputs=[x_4d], outputs=[x1, x2], axis=-1, num_outputs=2, name=f"{prefix}_split"),
            helper.make_node("Mul", inputs=[x1, cos_u], outputs=[x1_cos], name=f"{prefix}_mul_x1_cos"),
            helper.make_node("Mul", inputs=[x2, sin_u], outputs=[x2_sin], name=f"{prefix}_mul_x2_sin"),
            helper.make_node("Sub", inputs=[x1_cos, x2_sin], outputs=[y1], name=f"{prefix}_sub_y1"),
            helper.make_node("Mul", inputs=[x2, cos_u], outputs=[x2_cos], name=f"{prefix}_mul_x2_cos"),
            helper.make_node("Mul", inputs=[x1, sin_u], outputs=[x1_sin], name=f"{prefix}_mul_x1_sin"),
            helper.make_node("Add", inputs=[x2_cos, x1_sin], outputs=[y2], name=f"{prefix}_add_y2"),
            helper.make_node("Concat", inputs=[y1, y2], outputs=[y_4d], axis=-1, name=f"{prefix}_concat_y"),
            helper.make_node("Reshape", inputs=[y_4d, x_shape], outputs=[out_name], name=f"{prefix}_reshape_out"),
        ])

    del graph.node[:]
    graph.node.extend(new_nodes)

    # Remove unused com.microsoft opset if no com.microsoft nodes remain
    remaining_contrib = sorted({(n.domain, n.op_type) for n in graph.node if n.domain not in ("", "ai.onnx")})
    onnx.save(model, str(DST_MODEL))

    return {
        "replacedRotaryNodes": replaced,
        "remainingContribOps": remaining_contrib,
        "dstModel": str(DST_MODEL),
        "dstSha256": f"sha256:{hashlib.sha256(DST_MODEL.read_bytes()).hexdigest()}",
    }


def verify_cpu_and_trt_rtx() -> dict:
    empty = np.zeros((0, 512), dtype=np.float32)
    feeds = {
        "input_ids": np.array([[2, 100, 200, 300, 1], [2, 500, 600, 1, 0]], dtype=np.int64),
        "attention_mask": np.array([[1, 1, 1, 1, 1], [1, 1, 1, 1, 0]], dtype=np.int64),
        "image_features": empty,
        "video_features": empty,
        "audio_features": empty,
    }

    s_ref = ort.InferenceSession(str(SRC_MODEL), providers=["CPUExecutionProvider"])
    ref_emb = s_ref.run(["sentence_embedding"], feeds)[0]

    s_std = ort.InferenceSession(str(DST_MODEL), providers=["CPUExecutionProvider"])
    std_emb = s_std.run(["sentence_embedding"], feeds)[0]

    cpu_cos = float(np.min(np.sum(ref_emb * std_emb, axis=1)))
    cpu_max_diff = float(np.max(np.abs(ref_emb - std_emb)))

    # Now test TensorRT-RTX 1.7 with strict session.disable_cpu_ep_fallback=1
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    if trt_ep.get_ep_name() not in ort.get_available_providers():
        ort.register_execution_provider_library(trt_ep.get_ep_name(), trt_ep.get_library_path())

    so = ort.SessionOptions()
    so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    so.add_session_config_entry("session.disable_cpu_ep_fallback", "1")
    trt_status = "OK"
    trt_cos = None
    trt_error = None
    try:
        s_trt = ort.InferenceSession(
            str(DST_MODEL),
            so,
            providers=[(trt_ep.get_ep_name(), {"nv_runtime_cache_path": str(CACHE_DIR)})],
        )
        trt_emb = s_trt.run(["sentence_embedding"], feeds)[0]
        trt_cos = float(np.min(np.sum(ref_emb * trt_emb, axis=1)))
    except Exception as exc:
        trt_status = "FAILED"
        trt_error = f"{type(exc).__name__}: {exc}"

    return {
        "cpuParityMinCosine": round(cpu_cos, 7),
        "cpuParityMaxAbsDiff": cpu_max_diff,
        "trtRtxStrictStatus": trt_status,
        "trtRtxMinCosine": round(trt_cos, 7) if trt_cos is not None else None,
        "trtRtxError": trt_error,
    }


if __name__ == "__main__":
    conv = convert_rotary_to_standard_ops()
    ver = verify_cpu_and_trt_rtx()
    print(json.dumps({"conversion": conv, "verification": ver}, indent=2))
