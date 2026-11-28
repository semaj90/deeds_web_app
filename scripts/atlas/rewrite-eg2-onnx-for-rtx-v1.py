"""Rewrite the local EG2 FP32 export and verify it in an isolated ORT process."""

import argparse
from collections import Counter
import gc
import hashlib
from importlib.metadata import version
import json
from pathlib import Path
import subprocess
import sys
import time

import numpy as np
import onnx
from onnx import helper, numpy_helper
import onnxruntime as ort
from tokenizers import Tokenizer


RTX_PACKAGE = "onnxruntime-ep-nv-tensorrt-rtx-cu13"


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def rewrite(model):
    # The inspected export has one flat opset-21 graph. Refuse unfamiliar variants
    # rather than lowering a node with different rotation or normalization semantics.
    if {item.domain: item.version for item in model.opset_import} != {"": 21, "com.microsoft": 1}:
        raise ValueError("Expected the EG2 opset-21 export")
    inferred = onnx.shape_inference.infer_shapes(model)
    tensor_types = {
        info.name: info.type.tensor_type
        for info in [*inferred.graph.value_info, *inferred.graph.input]
    }
    initializers = {t.name: t for t in model.graph.initializer}
    nodes = []
    extra = []
    counts = Counter()
    for index, node in enumerate(model.graph.node):
        op = (node.domain, node.op_type)
        attrs = {a.name: helper.get_attribute_value(a) for a in node.attribute}
        inputs = list(node.input)
        outputs = list(node.output)
        if any(a.type in (onnx.AttributeProto.GRAPH, onnx.AttributeProto.GRAPHS) for a in node.attribute):
            raise ValueError(f"Unexpected nested graph: {node.name}")
        prefix = f"__atlas_eg2_rtx_v1_{index}_"

        def const(label, value, dtype):
            name = prefix + label
            extra.append(numpy_helper.from_array(np.asarray(value, dtype=dtype), name))
            return name

        def emit(kind, args, label, *, output=None, **attributes):
            name = output if output is not None else prefix + label
            nodes.append(helper.make_node(kind, args, [name], name=prefix + label, **attributes))
            return name

        if op == ("com.microsoft", "RotaryEmbedding"):
            x, position, cos, sin = inputs
            pos = initializers.get(position)
            x_type, cos_type, sin_type = (tensor_types[name] for name in (x, cos, sin))
            x_shape, cos_shape, sin_shape = (tensor.shape.dim for tensor in (x_type, cos_type, sin_type))
            # ORT's length-one position input is the starting position. In this
            # export it is zero and both cache rows already cover the sequence.
            if (
                attrs != {"interleaved": 0}
                or pos is None or pos.external_data or pos.data_type != onnx.TensorProto.INT64
                or list(pos.dims) != [1] or numpy_helper.to_array(pos).tolist() != [0]
                or len(x_shape) != 3 or len(cos_shape) != 2 or list(cos_shape) != list(sin_shape)
                or x_shape[1] != cos_shape[0]
                or any(t.elem_type != onnx.TensorProto.FLOAT for t in (x_type, cos_type, sin_type))
            ):
                raise ValueError(f"Unsupported rotary layout: {node.name}")
            width, half = x_shape[-1].dim_value, cos_shape[-1].dim_value
            if half <= 0 or width <= 0 or width % (2 * half):
                raise ValueError(f"Invalid rotary width: {node.name}")
            heads = width // (2 * half)
            shaped = emit("Reshape", [x, const("shape4", [0, 0, heads, 2 * half], np.int64)], "shaped")
            axes = const("broadcast_axes", [0, 2], np.int64)
            cos = emit("Unsqueeze", [cos, axes], "cos")
            sin = emit("Unsqueeze", [sin, axes], "sin")
            split = const("split_sizes", [half, half], np.int64)
            first, second = prefix + "first", prefix + "second"
            nodes.append(helper.make_node("Split", [shaped, split], [first, second], axis=-1))
            ac = emit("Mul", [first, cos], "ac")
            bs = emit("Mul", [second, sin], "bs")
            bc = emit("Mul", [second, cos], "bc")
            a_s = emit("Mul", [first, sin], "as")
            left = emit("Sub", [ac, bs], "left")
            right = emit("Add", [bc, a_s], "right")
            rotated = emit("Concat", [left, right], "rotated", axis=-1)
            emit("Reshape", [rotated, const("shape3", [0, 0, width], np.int64)], "restore", output=outputs[0])
        elif op in {("", "SimplifiedLayerNormalization"), ("com.microsoft", "SkipSimplifiedLayerNormalization")}:
            if op[0]:
                if len(inputs) != 3 or len(outputs) not in (1, 4) or any(outputs[1:3]) or set(attrs) != {"epsilon"}:
                    raise ValueError(f"Unsupported skip RMS normalization: {node.name}")
                x, residual, scale = inputs
                x = emit("Add", [x, residual], "sum", output=outputs[3] if len(outputs) == 4 and outputs[3] else None)
            else:
                if len(inputs) != 2 or len(outputs) != 1 or set(attrs) != {"epsilon", "axis", "stash_type"}:
                    raise ValueError(f"Unsupported RMS normalization: {node.name}")
                if attrs["axis"] != -1 or attrs["stash_type"] != onnx.TensorProto.FLOAT:
                    raise ValueError(f"Unsupported RMS normalization precision or axis: {node.name}")
                x, scale = inputs
            epsilon = attrs["epsilon"]
            if not np.isfinite(epsilon) or epsilon <= 0:
                raise ValueError(f"Invalid normalization epsilon: {node.name}")
            squared = emit("Mul", [x, x], "squared")
            mean = emit("ReduceMean", [squared, const("last_axis", [-1], np.int64)], "mean", keepdims=1)
            stabilized = emit("Add", [mean, const("epsilon", epsilon, np.float32)], "stabilized")
            denominator = emit("Sqrt", [stabilized], "denominator")
            normalized = emit("Div", [x, denominator], "normalized")
            emit("Mul", [normalized, scale], "scale", output=outputs[0])
        else:
            if node.domain or not onnx.defs.has(node.op_type, 21, ""):
                raise ValueError(f"Unexpected operator: {op}")
            nodes.append(node)
            continue
        counts[node.op_type] += 1
    if counts != {"RotaryEmbedding": 48, "SkipSimplifiedLayerNormalization": 48, "SimplifiedLayerNormalization": 98}:
        raise ValueError(f"Unexpected rewrite counts: {counts}")
    existing = set(initializers) | {o for n in model.graph.node for o in n.output}
    existing.update(v.name for v in model.graph.input)
    if any(name.startswith("__atlas_eg2_rtx_v1_") for name in existing):
        raise ValueError("Rewrite value namespace already exists")
    del model.graph.node[:]
    model.graph.node.extend(nodes)
    model.graph.initializer.extend(extra)
    del model.opset_import[1:]
    return dict(counts)


def probe_inputs(tokenizer):
    texts = [
        "task: code retrieval | query: Where does Atlas validate workspace grants?",
        "title: search.ts | text: export function search(x) { return index.get(x); }",
        "title: utf8.ts | text: export const names = ['café', '検索', '🔎'];",
        "title: loops.py | text: " + "for item in rows: consume(item)\n" * 12,
    ]
    tokenizer.enable_padding()
    for batch in ([texts[0]], texts):
        encoded = tokenizer.encode_batch(batch)
        yield {
            "input_ids": np.array([e.ids for e in encoded], np.int64),
            "attention_mask": np.array([e.attention_mask for e in encoded], np.int64),
            **{name: np.zeros((0, 512), np.float32) for name in ("image_features", "video_features", "audio_features")},
        }


def run_model(path, feeds, output, *, rtx=False):
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    if rtx:
        import onnxruntime_ep_nv_tensorrt_rtx as plugin

        provider = plugin.get_ep_name()
        dll_path = Path(plugin.get_library_path())
        ort.register_execution_provider_library(provider, str(dll_path))
        output["requestedProvider"] = provider
        output["pluginLibrary"] = str(dll_path)
        options.add_session_config_entry("session.disable_cpu_ep_fallback", "1")
        options.enable_profiling = True
        options.profile_file_prefix = str(output["directory"] / "ort-rtx")
        # Keep the rewritten graph intact through provider partitioning.
        options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_DISABLE_ALL
        cache = output["directory"] / "runtime-cache"
        cache.mkdir()
        providers = [(provider, {"nv_runtime_cache_path": str(cache)})]
    else:
        providers = ["CPUExecutionProvider"]
    started = time.perf_counter()
    session = ort.InferenceSession(str(path), options, providers=providers, enable_fallback=False)
    session.disable_fallback()
    output["sessionMs"] = round((time.perf_counter() - started) * 1000, 2)
    output["registeredProviders"] = session.get_providers()
    results = []
    output["requests"] = []
    try:
        for feed in feeds:
            started = time.perf_counter()
            vector = session.run(["sentence_embedding"], feed)[0]
            if vector.shape != (feed["input_ids"].shape[0], 768) or not np.isfinite(vector).all():
                raise ValueError(f"Invalid embedding output: {vector.shape}")
            if not np.allclose(np.linalg.norm(vector, axis=1), 1.0, atol=1e-5):
                raise ValueError("Expected normalized embeddings")
            results.append(vector)
            output["requests"].append({
                "inputShape": list(feed["input_ids"].shape),
                "tokenCounts": feed["attention_mask"].sum(1).tolist(),
                "elapsedMs": round((time.perf_counter() - started) * 1000, 2),
            })
    finally:
        if rtx:
            profile = Path(session.end_profiling())
            counts = Counter(
                event["args"]["provider"]
                for event in json.loads(profile.read_bytes())
                if event.get("cat") == "Node" and event.get("args", {}).get("provider")
            )
            output["profile"] = str(profile)
            output["profileSha256"] = digest(profile)
            output["providerEvents"] = dict(counts)
    if rtx and (not counts[provider] or counts["CPUExecutionProvider"]):
        raise RuntimeError(f"Strict RTX operator placement was not proven: {dict(counts)}")
    return results


def compare(expected, actual):
    a, b = (np.concatenate(v).astype(np.float64) for v in (expected, actual))
    similarity = np.sum(a * b, axis=1) / (np.linalg.norm(a, axis=1) * np.linalg.norm(b, axis=1))
    return {"minCosine": float(similarity.min()), "maxAbsError": float(np.max(np.abs(a - b)))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--tokenizer", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True, help="New directory for the receipt and profile")
    parser.add_argument("--strict-rtx", action="store_true")
    args = parser.parse_args()
    model_path = args.model.resolve(strict=True)
    output = args.output_dir.resolve()
    output.mkdir(parents=True, exist_ok=False)
    receipt = {
        "schema": "atlas.eg2-onnx-rtx-rewrite.v1",
        "sourceCommit": subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip(),
        "command": subprocess.list2cmdline([sys.executable, *sys.argv]),
        "scriptSha256": digest(Path(__file__)),
        "source": str(model_path),
        "canonicalAuthority": False,
        "writesPerformed": False,
        "strictRtxRequested": args.strict_rtx,
    }
    phase = "rewrite"
    code = 1
    try:
        receipt["versions"] = {"onnx": onnx.__version__, "ort": ort.__version__}
        model = onnx.load(model_path, load_external_data=False)
        locations = {
            next(entry.value for entry in initializer.external_data if entry.key == "location")
            for initializer in model.graph.initializer if initializer.external_data
        }
        if locations != {"model.onnx_data"}:
            raise ValueError(f"Unexpected external data layout: {locations}")
        weights = model_path.with_name("model.onnx_data")
        receipt["sourceSha256"] = digest(model_path)
        receipt["weightSha256"] = digest(weights)
        receipt["weightBytes"] = weights.stat().st_size
        receipt["tokenizerSha256"] = digest(args.tokenizer)
        # Exercise rejection of an interleaved rotary layout before writing a graph.
        adversarial = onnx.ModelProto()
        adversarial.CopyFrom(model)
        rotary = next(n for n in adversarial.graph.node if n.op_type == "RotaryEmbedding")
        rotary.attribute[0].i = 1
        try:
            rewrite(adversarial)
        except ValueError as error:
            if "Unsupported rotary layout" not in str(error):
                raise
            receipt["interleavedRotaryRejected"] = str(error)
        else:
            raise RuntimeError("Interleaved rotary layout was accepted")
        del adversarial
        receipt["rewrittenOps"] = rewrite(model)
        # ONNX rejects hardlinked external tensors and disallows traversing up
        # from the graph directory. Keep the new graph beside its original weights.
        target = model_path.with_name(f"{model_path.stem}_trt_standard_v1.onnx")
        graph_bytes = model.SerializeToString()
        try:
            with target.open("xb") as stream:
                stream.write(graph_bytes)
        except FileExistsError:
            if target.read_bytes() != graph_bytes:
                raise
        del model
        onnx.checker.check_model(target)
        receipt["graphCheck"] = "PASS"
        receipt["outputModel"] = str(target)
        receipt["outputSha256"] = digest(target)
        receipt["outputBytes"] = target.stat().st_size
        receipt["sameWeightFile"] = (target.parent / weights.name).samefile(weights)

        phase = "cpu-parity"
        feeds = list(probe_inputs(Tokenizer.from_file(str(args.tokenizer))))
        receipt["sourceCpu"], receipt["rewrittenCpu"] = {}, {}
        reference = run_model(model_path, feeds, receipt["sourceCpu"])
        gc.collect()
        candidate = run_model(target, feeds, receipt["rewrittenCpu"])
        gc.collect()
        parity = receipt["cpuParity"] = compare(reference, candidate)
        if parity["minCosine"] < 0.99999 or parity["maxAbsError"] > 1e-4:
            raise ValueError(f"Rewrite CPU parity failed: {parity}")
        if args.strict_rtx:
            phase = "strict-rtx"
            receipt["versions"][RTX_PACKAGE] = version(RTX_PACKAGE)
            gpu = {"directory": output}
            receipt["strictRtx"] = gpu
            gpu["vramBefore"] = subprocess.check_output(
                ["nvidia-smi", "--query-gpu=name,memory.free,driver_version", "--format=csv,noheader"], text=True
            ).strip()
            gpu_result = run_model(target, feeds[:1], gpu, rtx=True)
            parity = gpu["parity"] = compare(reference[:1], gpu_result)
            if parity["minCosine"] < 0.99999:
                raise ValueError(f"RTX parity failed: {parity}")
        receipt["status"] = "PASS"
        code = 0
    except Exception as error:
        receipt.update(status="FAIL", failedPhase=phase, errorType=type(error).__name__, error=str(error))
    finally:
        receipt["exitCode"] = code
        path = output / "receipt.json"
        path.write_text(json.dumps(receipt, indent=2, default=str) + "\n", encoding="utf-8")
        sha = digest(path)
        path.with_suffix(".json.sha256").write_text(f"{sha}  {path.name}\n", encoding="ascii")
        print(f"{receipt['status']} {path} sha256:{sha}", flush=True)
        if code:
            print(receipt["error"], file=sys.stderr, flush=True)
    return code


if __name__ == "__main__":
    raise SystemExit(main())
