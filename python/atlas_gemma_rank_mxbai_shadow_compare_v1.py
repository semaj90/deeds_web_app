"""Compare the exported untrained AtlasGemma rank head with captured mxbai order.

This is a read-only structural baseline.  It measures agreement with the live
mxbai receipt but cannot establish relevance quality because the AtlasGemma rank
head is still randomly initialized and the cohort is not canonical-ordinal proof.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import torch
from safetensors import safe_open
from transformers import Gemma4ForCausalLM, Gemma4TextConfig, PreTrainedTokenizerFast


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ARTIFACT = ROOT / "models" / "atlas-gemma-rank-v1" / "standalone-init-bf16"
DEFAULT_TEACHER = ROOT / "docs" / "reports" / "atlas-gemma-rank-mxbai-teacher-corpus-v1.json"
SCHEMA = "atlas.gemma-rank-mxbai-shadow-compare.v1"


def file_checksum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return "sha256:" + digest.hexdigest()


def stable_json_checksum(value: Any) -> str:
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return "sha256:" + hashlib.sha256(raw).hexdigest()


def rank_order(rows: list[dict[str, Any]], score_key: str) -> list[dict[str, Any]]:
    return sorted(rows, key=lambda row: (-float(row[score_key]), str(row["candidateId"])))


def spearman(rank_a: dict[str, int], rank_b: dict[str, int]) -> float:
    ids = sorted(rank_a)
    if len(ids) < 2:
        return 1.0
    n = len(ids)
    squared = sum((rank_a[candidate_id] - rank_b[candidate_id]) ** 2 for candidate_id in ids)
    return 1.0 - (6.0 * squared) / (n * (n * n - 1))


def load_student(artifact_dir: Path) -> tuple[Gemma4ForCausalLM, PreTrainedTokenizerFast, torch.nn.Module, str]:
    weights_path = artifact_dir / "model.safetensors"
    config = Gemma4TextConfig.from_pretrained(str(artifact_dir), local_files_only=True)
    model = Gemma4ForCausalLM(config).eval().to(dtype=torch.bfloat16)
    with safe_open(str(weights_path), framework="pt", device="cpu") as handle:
        state = model.state_dict()
        for name in handle.keys():
            if name in state and list(handle.get_tensor(name).shape) == list(state[name].shape):
                with torch.no_grad():
                    state[name].copy_(handle.get_tensor(name).to(dtype=state[name].dtype))
        rank_weight = handle.get_tensor("atlas.rank_head.weight").to(dtype=torch.bfloat16)
        rank_bias = handle.get_tensor("atlas.rank_head.bias").to(dtype=torch.bfloat16)
    head = torch.nn.Linear(config.hidden_size, 1, bias=True, dtype=torch.bfloat16).eval()
    with torch.no_grad():
        head.weight.copy_(rank_weight)
        head.bias.copy_(rank_bias)
    tokenizer = PreTrainedTokenizerFast(tokenizer_file=str(artifact_dir / "tokenizer.json"))
    return model, tokenizer, head, file_checksum(weights_path)


def compare(artifact_dir: Path, teacher_path: Path) -> dict[str, Any]:
    teacher = json.loads(teacher_path.read_text(encoding="utf-8"))
    model, tokenizer, head, artifact_checksum = load_student(artifact_dir)
    query_reports: list[dict[str, Any]] = []
    started = time.perf_counter()
    for query_row in teacher["queries"]:
        observations = query_row["observations"]
        texts = [f"[QUERY] {query_row['query']} [DOCUMENT] {observation['candidateText']}" for observation in observations]
        encoded_rows = tokenizer(texts, padding=False, truncation=True, max_length=512)["input_ids"]
        max_length = max(len(row) for row in encoded_rows)
        input_ids = torch.zeros((len(encoded_rows), max_length), dtype=torch.long)
        attention_mask = torch.zeros_like(input_ids)
        for row_index, token_ids in enumerate(encoded_rows):
            length = len(token_ids)
            input_ids[row_index, :length] = torch.tensor(token_ids, dtype=torch.long)
            attention_mask[row_index, :length] = 1
        encoded = {"input_ids": input_ids, "attention_mask": attention_mask}
        with torch.inference_mode():
            output = model.model(input_ids=encoded["input_ids"], attention_mask=encoded["attention_mask"])
            lengths = encoded["attention_mask"].sum(dim=1).to(dtype=torch.long) - 1
            hidden = output.last_hidden_state[torch.arange(len(texts)), lengths]
            student_scores = head(hidden).squeeze(-1).to(dtype=torch.float32).tolist()
        rows = [
            {
                "candidateId": observation["candidateId"],
                "sourceRevision": observation["sourceRevision"],
                "workspaceRevision": observation["workspaceRevision"],
                "teacherScore": float(observation["score"]),
                "teacherRank": int(observation["rank"]),
                "studentRawScore": float(student_score),
            }
            for observation, student_score in zip(observations, student_scores, strict=True)
        ]
        teacher_order = rank_order(rows, "teacherScore")
        student_order = rank_order(rows, "studentRawScore")
        teacher_ranks = {row["candidateId"]: index for index, row in enumerate(teacher_order)}
        student_ranks = {row["candidateId"]: index for index, row in enumerate(student_order)}
        for row in rows:
            row["studentRank"] = student_ranks[row["candidateId"]]
        top_k = 3
        teacher_top = {row["candidateId"] for row in teacher_order[:top_k]}
        student_top = {row["candidateId"] for row in student_order[:top_k]}
        query_reports.append(
            {
                "query": query_row["query"],
                "candidateCount": len(rows),
                "top1Agreement": teacher_order[0]["candidateId"] == student_order[0]["candidateId"],
                "top3Overlap": len(teacher_top & student_top) / top_k,
                "spearmanRankCorrelation": spearman(teacher_ranks, student_ranks),
                "teacherOrder": [row["candidateId"] for row in teacher_order],
                "studentOrder": [row["candidateId"] for row in student_order],
                "rows": rows,
            }
        )
    all_scores = [row["studentRawScore"] for query in query_reports for row in query["rows"]]
    result: dict[str, Any] = {
        "schema": SCHEMA,
        "status": "STRUCTURAL_SHADOW_ORDERING_PROVEN_QUALITY_UNPROVEN",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "artifactDir": str(artifact_dir),
        "artifactWeightsChecksum": artifact_checksum,
        "teacherReceipt": str(teacher_path.relative_to(ROOT)).replace("\\", "/"),
        "teacherReceiptChecksum": teacher.get("receiptChecksum"),
        "teacherModelId": teacher.get("modelId"),
        "studentScoreSemantics": "untrained_raw_rank_head_logit",
        "teacherScoreSemantics": teacher.get("scoreSemantics"),
        "candidateIdentityQualified": bool(teacher.get("candidateIdentityQualified")),
        "canonicalOrdinalMapProven": bool(teacher.get("canonicalOrdinalMapProven")),
        "rankingQualityProven": False,
        "trainingPerformed": False,
        "quantizationPerformed": False,
        "cudaAllocated": False,
        "queryCount": len(query_reports),
        "candidateCount": sum(query["candidateCount"] for query in query_reports),
        "allStudentScoresFinite": all(math.isfinite(score) for score in all_scores),
        "top1AgreementCount": sum(query["top1Agreement"] for query in query_reports),
        "meanTop3Overlap": sum(query["top3Overlap"] for query in query_reports) / len(query_reports),
        "meanSpearmanRankCorrelation": sum(query["spearmanRankCorrelation"] for query in query_reports) / len(query_reports),
        "studentCpuElapsedMs": round((time.perf_counter() - started) * 1000, 3),
        "interpretation": "Untrained-head agreement is a baseline only; no relevance, parity, promotion, or distillation claim follows.",
        "queries": query_reports,
    }
    result["receiptChecksum"] = stable_json_checksum(result)
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact-dir", type=Path, default=DEFAULT_ARTIFACT)
    parser.add_argument("--teacher-receipt", type=Path, default=DEFAULT_TEACHER)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = compare(args.artifact_dir, args.teacher_receipt)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: value for key, value in result.items() if key != "queries"}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
