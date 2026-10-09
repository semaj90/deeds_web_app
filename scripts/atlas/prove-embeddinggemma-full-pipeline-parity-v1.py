#!/usr/bin/env python3
"""Compare local SentenceTransformer and ONNX EmbeddingGemma pipelines."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
import time
from pathlib import Path
from importlib.metadata import PackageNotFoundError, version

import numpy as np


ROOT = Path(__file__).resolve().parents[2]
SOURCE_MODEL = ROOT / "models" / "embeddinggemma_300m"
ONNX_DIR = ROOT / "sveltekit-frontend" / "static" / "embeddinggemma_300m_onnx"
DIMENSIONS = 768
MAX_LENGTH = 512
MIN_FREE_MEMORY_BYTES = 2_500_000_000
INPUTS = [
    ("exact-a", "task: sentence similarity | query: PostgreSQL stores chunk vectors with source and workspace revision metadata."),
    ("exact-b", "task: sentence similarity | query: PostgreSQL stores chunk vectors with source and workspace revision metadata."),
    ("paraphrase", "task: sentence similarity | query: Chunk embeddings are persisted in PostgreSQL alongside source and workspace revision information."),
    ("related", "task: sentence similarity | query: A cosine HNSW index retrieves similar document chunks from pgvector."),
    ("unrelated-legal", "task: sentence similarity | query: The court clerk schedules hearings and files signed notices with the case docket."),
    ("unrelated-garden", "task: sentence similarity | query: A sunflower grows toward sunlight in a garden during spring."),
]


def sha256_bytes(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return "sha256:" + digest.hexdigest()


def canonical_json(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def free_memory_bytes() -> int:
    if os.name == "nt":
        import ctypes

        class MemoryStatus(ctypes.Structure):
            _fields_ = [
                ("dwLength", ctypes.c_ulong),
                ("dwMemoryLoad", ctypes.c_ulong),
                ("ullTotalPhys", ctypes.c_ulonglong),
                ("ullAvailPhys", ctypes.c_ulonglong),
                ("ullTotalPageFile", ctypes.c_ulonglong),
                ("ullAvailPageFile", ctypes.c_ulonglong),
                ("ullTotalVirtual", ctypes.c_ulonglong),
                ("ullAvailVirtual", ctypes.c_ulonglong),
                ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
            ]

        status = MemoryStatus()
        status.dwLength = ctypes.sizeof(status)
        if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
            raise RuntimeError("MEMORY_PREFLIGHT_UNAVAILABLE")
        return int(status.ullAvailPhys)
    try:
        pages = os.sysconf("SC_AVPHYS_PAGES")
        page_size = os.sysconf("SC_PAGE_SIZE")
        return int(pages * page_size)
    except (AttributeError, ValueError, OSError) as error:
        raise RuntimeError("MEMORY_PREFLIGHT_UNAVAILABLE") from error


def vector_checksum(vector: np.ndarray) -> str:
    canonical = np.asarray(vector, dtype="<f4").reshape(-1)
    return sha256_bytes(canonical.tobytes())


def cosine(left: np.ndarray, right: np.ndarray) -> float:
    denominator = float(np.linalg.norm(left) * np.linalg.norm(right))
    if denominator == 0 or not math.isfinite(denominator):
        raise RuntimeError("ZERO_OR_NONFINITE_VECTOR_NORM")
    return float(np.dot(left, right) / denominator)


def pairwise(vectors: list[np.ndarray]) -> list[list[float]]:
    return [[cosine(left, right) for right in vectors] for left in vectors]


def tensor_stage_summary(features: dict[str, object]) -> dict[str, object]:
    result = {}
    for key, value in features.items():
        if hasattr(value, "detach"):
            tensor = value.detach().cpu().float().numpy()
            result[key] = {
                "shape": list(tensor.shape),
                "sha256": vector_checksum(tensor),
                "finite": bool(np.isfinite(tensor).all()),
            }
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=None)
    args = parser.parse_args()

    required = [
        SOURCE_MODEL / "model.safetensors",
        SOURCE_MODEL / "modules.json",
        SOURCE_MODEL / "1_Pooling" / "config.json",
        SOURCE_MODEL / "2_Dense" / "model.safetensors",
        SOURCE_MODEL / "3_Dense" / "model.safetensors",
        ONNX_DIR / "model.onnx",
        ONNX_DIR / "tokenizer.json",
    ]
    missing = [str(path.relative_to(ROOT)) for path in required if not path.is_file()]
    if missing:
        raise RuntimeError("REQUIRED_LOCAL_ARTIFACT_MISSING:" + ",".join(missing))

    free_before = free_memory_bytes()
    if free_before < MIN_FREE_MEMORY_BYTES:
        raise RuntimeError(f"INSUFFICIENT_FREE_MEMORY:{free_before}<{MIN_FREE_MEMORY_BYTES}")

    import onnxruntime as ort
    import torch
    from sentence_transformers import SentenceTransformer
    from transformers import AutoTokenizer

    model_config = json.loads((SOURCE_MODEL / "config_sentence_transformers.json").read_text(encoding="utf-8"))
    expected_versions = model_config.get("__version__", {})
    installed_versions = {}
    for package in ("sentence-transformers", "transformers", "torch", "onnxruntime"):
        try:
            installed_versions[package] = version(package)
        except PackageNotFoundError:
            installed_versions[package] = None
    version_matches = all(
        not expected_versions.get(key)
        or installed_versions.get(package) == expected_versions[key]
        for key, package in (("sentence_transformers", "sentence-transformers"), ("transformers", "transformers"), ("pytorch", "torch"))
    )

    torch.set_num_threads(min(4, max(1, os.cpu_count() or 1)))
    model = SentenceTransformer(
        str(SOURCE_MODEL),
        device="cpu",
        local_files_only=True,
        model_kwargs={"low_cpu_mem_usage": True},
    )
    model.max_seq_length = MAX_LENGTH
    model.eval()
    sentence_tokenizer = model[0].tokenizer
    onnx_tokenizer = AutoTokenizer.from_pretrained(ONNX_DIR, local_files_only=True)

    onnx_session = ort.InferenceSession(
        str(ONNX_DIR / "model.onnx"),
        providers=["CPUExecutionProvider"],
        sess_options=ort.SessionOptions(),
    )
    onnx_inputs = {entry.name for entry in onnx_session.get_inputs()}
    onnx_output_name = onnx_session.get_outputs()[0].name
    full_vectors: list[np.ndarray] = []
    onnx_vectors: list[np.ndarray] = []
    onnx_projected_vectors: list[np.ndarray] = []
    comparisons = []
    module_names = list(model._modules.keys())

    with torch.inference_mode():
        for item_id, text in INPUTS:
            sentence_features = model.tokenize([text])
            sentence_ids = sentence_features["input_ids"].cpu().numpy()
            sentence_mask = sentence_features["attention_mask"].cpu().numpy()
            onnx_encoded = onnx_tokenizer(
                text,
                return_tensors="np",
                padding=True,
                truncation=True,
                max_length=MAX_LENGTH,
            )
            onnx_ids = onnx_encoded["input_ids"].astype(np.int64)
            onnx_mask = onnx_encoded["attention_mask"].astype(np.int64)
            same_ids = np.array_equal(sentence_ids, onnx_ids)
            same_mask = np.array_equal(sentence_mask, onnx_mask)
            if not same_ids or not same_mask:
                raise RuntimeError(f"TOKENIZER_MISMATCH:{item_id}:ids={same_ids}:mask={same_mask}")

            features = {key: value.to("cpu") if hasattr(value, "to") else value for key, value in sentence_features.items()}
            stages = []
            sentence_stage_vectors = {}
            for name, module in model._modules.items():
                features = module(features)
                if name in {"0", "1", "2", "3", "4"}:
                    stages.append({"module": name, "tensors": tensor_stage_summary(features)})
                if name in {"1", "2", "3", "4"} and "sentence_embedding" in features:
                    sentence_stage_vectors[name] = features["sentence_embedding"].detach().cpu().float().numpy().reshape(-1)
            full_vector = features["sentence_embedding"].detach().cpu().float().numpy().reshape(-1)

            feeds = {}
            if "input_ids" in onnx_inputs:
                feeds["input_ids"] = onnx_ids
            if "attention_mask" in onnx_inputs:
                feeds["attention_mask"] = onnx_mask
            if "token_type_ids" in onnx_inputs and "token_type_ids" in onnx_encoded:
                feeds["token_type_ids"] = onnx_encoded["token_type_ids"].astype(np.int64)
            hidden = onnx_session.run([onnx_output_name], feeds)[0]
            if hidden.ndim != 3 or hidden.shape[0] != 1 or hidden.shape[-1] != DIMENSIONS:
                raise RuntimeError(f"UNEXPECTED_ONNX_OUTPUT_SHAPE:{item_id}:{hidden.shape}")
            mask = onnx_mask[0].astype(np.float32)
            pooled = (hidden[0] * mask[:, None]).sum(axis=0) / max(float(mask.sum()), 1.0)
            pooled_norm = float(np.linalg.norm(pooled))
            if not math.isfinite(pooled_norm) or pooled_norm <= 0:
                raise RuntimeError(f"INVALID_ONNX_POOLED_NORM:{item_id}")
            onnx_vector = pooled / pooled_norm
            onnx_features = {
                "token_embeddings": torch.from_numpy(hidden),
                "attention_mask": torch.from_numpy(onnx_mask).long(),
            }
            onnx_projection_stages = []
            for name in ("1", "2", "3", "4"):
                onnx_features = model._modules[name](onnx_features)
                stage_vector = onnx_features["sentence_embedding"].detach().cpu().float().numpy().reshape(-1)
                reference_vector = sentence_stage_vectors[name]
                onnx_projection_stages.append({
                    "module": name,
                    "shape": list(stage_vector.shape),
                    "onnxChecksum": vector_checksum(stage_vector),
                    "sentenceTransformerChecksum": vector_checksum(reference_vector),
                    "crossCosine": cosine(reference_vector, stage_vector),
                })
            projected_vector = onnx_features["sentence_embedding"].detach().cpu().float().numpy().reshape(-1)
            full_norm = float(np.linalg.norm(full_vector))
            if not np.isfinite(full_vector).all() or full_norm <= 0:
                raise RuntimeError(f"INVALID_SENTENCE_TRANSFORMER_VECTOR:{item_id}")
            onnx_vectors.append(onnx_vector.astype(np.float32))
            onnx_projected_vectors.append(projected_vector.astype(np.float32))
            full_vectors.append(full_vector.astype(np.float32))
            comparisons.append({
                "id": item_id,
                "tokenCount": int(mask.sum()),
                "tokenizerIdsMatch": same_ids,
                "attentionMaskMatch": same_mask,
                "sentenceTransformerStages": stages,
                "sentenceTransformerVectorChecksum": vector_checksum(full_vector),
                "onnxMaskedMeanVectorChecksum": vector_checksum(onnx_vector),
                "sentenceTransformerNorm": full_norm,
                "onnxMaskedMeanNorm": float(np.linalg.norm(onnx_vector)),
                "crossCosine": cosine(full_vector, onnx_vector),
                "onnxReplayedSourceProjectionStages": onnx_projection_stages,
                "onnxReplayedSourceProjectionFinalChecksum": vector_checksum(projected_vector),
                "onnxReplayedSourceProjectionFinalNorm": float(np.linalg.norm(projected_vector)),
                "onnxReplayedSourceProjectionCrossCosine": cosine(full_vector, projected_vector),
            })

    full_matrix = pairwise(full_vectors)
    onnx_matrix = pairwise(onnx_vectors)
    onnx_projected_matrix = pairwise(onnx_projected_vectors)
    manifest = {
        "schema": "atlas.embeddinggemma-full-pipeline-parity.v1",
        "status": "DIAGNOSTIC_COMPLETE_NOT_ADMITTED",
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "sourceModel": {
            "path": str(SOURCE_MODEL.relative_to(ROOT)).replace("\\", "/"),
            "artifactSha256": sha256_file(SOURCE_MODEL / "model.safetensors"),
            "modulesSha256": sha256_file(SOURCE_MODEL / "modules.json"),
            "poolingConfigSha256": sha256_file(SOURCE_MODEL / "1_Pooling" / "config.json"),
            "denseProjectionSha256": {
                name: sha256_file(SOURCE_MODEL / name / "model.safetensors") for name in ("2_Dense", "3_Dense")
            },
        },
        "onnx": {
            "path": str((ONNX_DIR / "model.onnx").relative_to(ROOT)).replace("\\", "/"),
            "artifactSha256": sha256_file(ONNX_DIR / "model.onnx"),
            "tokenizerSha256": sha256_file(ONNX_DIR / "tokenizer.json"),
            "outputName": onnx_output_name,
            "outputShape": list(hidden.shape),
        },
        "recipe": {
            "device": "CPU",
            "maxSequenceLength": MAX_LENGTH,
            "inputsSha256": sha256_bytes(canonical_json(INPUTS)),
            "sentenceTransformerModules": module_names,
            "expectedFrameworkVersions": expected_versions,
            "installedFrameworkVersions": installed_versions,
            "frameworkVersionParity": "MATCH" if version_matches else "MISMATCH",
            "fullPipelineReferenceQualification": "VERSION_MATCHED" if version_matches else "MEASURED_WITH_FRAMEWORK_VERSION_MISMATCH",
            "onnxPooling": "masked mean over attention_mask then L2 normalization; this is the current runtime path",
            "sourceProjectionReplay": "diagnostic only: apply source SentenceTransformer modules 1..4 to ONNX hidden states; no model artifact is modified",
            "networkAccess": "disabled for model/tokenizer loading",
        },
        "freePhysicalMemoryBytesBefore": free_before,
        "comparison": {
            "inputs": comparisons,
            "sentenceTransformerPairwiseCosine": full_matrix,
            "onnxPairwiseCosine": onnx_matrix,
            "onnxWithSourceProjectionPairwiseCosine": onnx_projected_matrix,
            "minimumProjectedCrossCosine": min(row["onnxReplayedSourceProjectionCrossCosine"] for row in comparisons),
            "maximumProjectedCrossCosine": max(row["onnxReplayedSourceProjectionCrossCosine"] for row in comparisons),
            "minimumCrossCosine": min(row["crossCosine"] for row in comparisons),
            "maximumCrossCosine": max(row["crossCosine"] for row in comparisons),
            "tokenizerParity": all(row["tokenizerIdsMatch"] and row["attentionMaskMatch"] for row in comparisons),
        },
        "authority": {"canonicalAuthority": False, "writesPerformed": False, "admissionDecision": "NOT_MADE"},
    }
    output_path = Path(args.output) if args.output else ROOT / ".tmp" / "atlas" / f"embeddinggemma-full-pipeline-parity-v1-{time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())}.json"
    if not output_path.is_absolute():
        output_path = ROOT / output_path
    output_path.parent.mkdir(parents=True, exist_ok=True)
    payload = canonical_json(manifest)
    manifest["checksum"] = sha256_bytes(payload)
    output_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    readback = json.loads(output_path.read_text(encoding="utf-8"))
    checksum = readback.pop("checksum")
    if checksum != sha256_bytes(canonical_json(readback)):
        raise RuntimeError("RECEIPT_READBACK_CHECKSUM_MISMATCH")
    print(json.dumps({
        "status": manifest["status"],
        "receipt": str(output_path.relative_to(ROOT)).replace("\\", "/"),
        "checksum": checksum,
        "minimumCrossCosine": manifest["comparison"]["minimumCrossCosine"],
        "maximumCrossCosine": manifest["comparison"]["maximumCrossCosine"],
        "tokenizerParity": manifest["comparison"]["tokenizerParity"],
        "readback": "MATCH",
        "writesPerformed": False,
    }, indent=2))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        print(f"FAIL_CLOSED:{type(error).__name__}:{error}", file=sys.stderr)
        sys.exit(2)
