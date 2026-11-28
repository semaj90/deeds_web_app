"""Compile and replay the validated EG2 ONNX graph as a local RTX EPContext."""

import argparse
from collections import Counter
import gc
import hashlib
import json
from pathlib import Path
import runpy
import subprocess
import sys
import time

import numpy as np
import onnx
import onnxruntime as ort
import onnxruntime_ep_nv_tensorrt_rtx as rtx
from tokenizers import Tokenizer


def sha(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def require_hash(path, expected):
    digest = sha(path)
    if digest != expected:
        raise ValueError(f"SHA256_MISMATCH:{path.name}")
    return digest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rewrite-receipt", type=Path, required=True)
    parser.add_argument("--receipt-sha256", required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    output = args.output_dir.resolve()
    output.mkdir(parents=True, exist_ok=False)
    receipt = {
        "schema": "atlas.eg2-rtx-ep-context.v1",
        "command": subprocess.list2cmdline([sys.executable, *sys.argv]),
        "commit": subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip(),
        "scriptSha256": sha(Path(__file__)),
        "canonicalAuthority": False,
        "writesPerformed": False,
        "ortVersion": ort.__version__,
    }
    phase = "provenance"
    try:
        receipt["rewriteReceiptSha256"] = require_hash(args.rewrite_receipt, args.receipt_sha256)
        prior = json.loads(args.rewrite_receipt.read_bytes())
        provider = rtx.get_ep_name()
        if (
            prior.get("schema") != "atlas.eg2-onnx-rtx-rewrite.v1"
            or prior.get("graphCheck") != "PASS" or prior.get("status") != "PASS"
            or prior.get("strictRtxRequested") is not True
            or set(prior["strictRtx"]["providerEvents"]) != {provider}
        ):
            raise ValueError("STRICT_VALIDATED_REWRITE_RECEIPT_REQUIRED")
        graph = Path(prior["outputModel"])
        weights = graph.with_name("model.onnx_data")
        tokenizer = graph.parent.parent / "tokenizer.json"
        receipt["source"] = {"path": str(graph), "sha256": require_hash(graph, prior["outputSha256"])}
        receipt["weightsSha256"] = require_hash(weights, prior["weightSha256"])
        receipt["tokenizerSha256"] = require_hash(tokenizer, prior["tokenizerSha256"])
        onnx.checker.check_model(graph, full_check=True)

        phase = "compile"
        lib = Path(rtx.get_library_path())
        receipt["providerLibrary"] = {"path": str(lib), "sha256": sha(lib)}
        ort.register_execution_provider_library(provider, str(lib))
        devices = [device for device in ort.get_ep_devices()
                   if device.ep_name == provider and device.device.type == ort.OrtHardwareDeviceType.GPU]
        if len(devices) != 1:
            raise RuntimeError(f"Expected one RTX device, got {len(devices)}")
        receipt["gpuBefore"] = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=name,memory.free,driver_version", "--format=csv,noheader"], text=True
        ).strip()
        options = ort.SessionOptions()
        options.add_session_config_entry("session.disable_cpu_ep_fallback", "1")
        options.add_provider_for_devices(devices, {})
        context = output / "model_trt_ctx.onnx"
        flags = ort.OrtCompileApiFlags.ERROR_IF_NO_NODES_COMPILED | ort.OrtCompileApiFlags.ERROR_IF_OUTPUT_FILE_EXISTS
        started = time.perf_counter()
        ort.ModelCompiler(options, graph, flags=flags).compile_to_file(context)
        receipt["compileMs"] = round(1000 * (time.perf_counter() - started), 2)
        compiled = onnx.load(context, load_external_data=False)
        nodes = [(n.domain, n.op_type) for n in compiled.graph.node]
        if nodes != [("com.microsoft", "EPContext")]:
            raise ValueError(f"Expected a single EPContext node, got {nodes}")
        receipt["contextNodes"] = nodes

        phase = "replay"
        fixture = runpy.run_path(str(Path(__file__).with_name("rewrite-eg2-onnx-for-rtx-v1.py")))
        feed = next(fixture["probe_inputs"](Tokenizer.from_file(str(tokenizer))))
        reference = fixture["run_model"](graph, [feed], {})
        gc.collect()
        replay = ort.SessionOptions()
        replay.add_session_config_entry("session.disable_cpu_ep_fallback", "1")
        replay.graph_optimization_level = ort.GraphOptimizationLevel.ORT_DISABLE_ALL
        replay.enable_profiling = True
        replay.profile_file_prefix = str(output / "ep-context")
        cache_dir = output / "runtime-cache"
        cache_dir.mkdir()
        replay.add_provider_for_devices(devices, {"nv_runtime_cache_path": str(cache_dir)})
        started = time.perf_counter()
        session = ort.InferenceSession(context, sess_options=replay, enable_fallback=False)
        session.disable_fallback()
        receipt["sessionMs"] = round(1000 * (time.perf_counter() - started), 2)
        try:
            timings = []
            for _ in range(2):
                started = time.perf_counter()
                vector = session.run(["sentence_embedding"], feed)[0]
                timings.append(round(1000 * (time.perf_counter() - started), 2))
                if vector.shape != (1, 768) or not np.isfinite(vector).all():
                    raise ValueError("INVALID_EP_CONTEXT_EMBEDDING")
                metrics = fixture["compare"](reference, [vector])
                if metrics["minCosine"] < 0.99999 or metrics["maxAbsError"] > 1e-4:
                    raise ValueError(f"EP_CONTEXT_PARITY_FAILED:{metrics}")
            receipt.update(parity=metrics, inputShape=list(feed["input_ids"].shape), inferenceMs=timings)
        finally:
            profile = Path(session.end_profiling())
        events = Counter(e["args"]["provider"] for e in json.loads(profile.read_bytes())
                         if e.get("cat") == "Node" and e.get("args", {}).get("provider"))
        receipt["providerEvents"] = dict(events)
        if dict(events) != {provider: 2}:
            raise RuntimeError(f"STRICT_RTX_REPLAY_NOT_PROVEN:{events}")
        receipt.update(status="PASS", exitCode=0)
    except Exception as error:
        receipt.update(status="FAIL", exitCode=1, phase=phase, errorType=type(error).__name__, error=str(error))
    receipt["artifacts"] = [
        {"path": str(path.relative_to(output)), "bytes": path.stat().st_size, "sha256": sha(path)}
        for path in sorted(output.rglob("*")) if path.is_file()
    ]
    report = output / "receipt.json"
    report.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    digest = sha(report)
    report.with_suffix(".json.sha256").write_text(f"{digest}  receipt.json\n", encoding="ascii")
    print(receipt["status"], report, digest, receipt.get("error", ""), flush=True)
    return receipt["exitCode"]


if __name__ == "__main__":
    raise SystemExit(main())
