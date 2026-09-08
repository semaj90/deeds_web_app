"""AGMR-06: bounded breadth/tokenizer-stability test — 50 real, diverse text inputs through the
AtlasGemmaRank seed's real tokenizer + standalone backbone + (untrained) scalar rank head.

This is explicitly NOT a rank-quality evaluation. The rank head is Xavier-random-initialized
(never trained), so its scalar output is meaningless as a relevance judgment. What this DOES prove
(if it passes): the real tokenizer (not synthetic token IDs, unlike atlas_gemma_rank_forward_smoke_v1)
produces finite, stable hidden states and scores across 50 genuinely varied real-text inputs —
closing part of AGMR-04's own flagged gap ("does not prove ordered-token embedding alignment... or
tokenizer alignment"). No training, no CUDA, no checkpoint mutation, no model artifact written.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any

import torch
from safetensors import safe_open
from transformers import Gemma4ForCausalLM, PreTrainedTokenizerFast

from atlas_gemma_rank_load_init_proof_v1 import checksum, derived_text_config, file_checksum, initialize_parameter

SCHEMA = "atlas.gemma-rank-breadth-50.v1"
NEW_SUFFIXES = (
    ".self_attn.k_proj.weight",
    ".self_attn.v_proj.weight",
    ".self_attn.k_norm.weight",
)

# 50 real, diverse strings: actual requirement titles, error messages, function names, and code
# fragments drawn from this session's own real work (not fabricated placeholder text). Deliberately
# varied in length, domain (TypeScript/Python/prose), and structure to stress tokenizer robustness.
QUERIES: list[str] = [
    "Which function sums duplicate-identity RRF scores instead of discarding them?",
    "export function assertExtractionBatchBounded(candidateCount) { if (candidateCount > CANDIDATE_EVIDENCE_EXTRACTION_MAX_BATCH) throw new Error(); }",
    "CandidateEvidenceCardV1 grounded-extraction contract",
    "Batch extraction only runs on a bounded, already-ranked candidate set",
    "Stage ownership is explicit and non-overlapping",
    "mxbai raw margin sigmoid once normalized [0,1]",
    "AtlasGemma CrossRankHead LateInteractionHead SpanHead RouteHead",
    "CANDIDATE_ORDINAL_MAP_ROW_COUNT_MISMATCH",
    "function clampLaneLimit(n int) int { if n <= 0 { return 40 } if n > 200 { return 200 } return n }",
    "def _positive_int(params, name, default, *, minimum=1): value = int(params.get(name, default))",
    "TextRelevanceObservationV2 scoreType rawScore normalizedScore normalization",
    "CalibrationIdentityV2 keyed on scoreType modelRevision adapterRevision domain",
    "localeCompare is ICU-driven and not guaranteed identical across Node builds",
    "compareUtf8 deterministic binary comparator UTF-8 byte comparison",
    "assertCandidateOrdinalMapIntegrityV1 rowCount candidates length mismatch",
    "entropy_norm byte-trigram Engram Laplace-smoothed Shannon entropy",
    "execution_utility trace_packet_events run_id packet_key event_type",
    "T6c RAPIDS KMeans centroids labels persisted with artifact lineage",
    "semantic_768 canonical MRL PCA latent topology vectors optional derived experiments",
    "Qdrant named vector name is a physical projection detail, not candidate identity",
    "ARROW-NESTED-01 remove JSON strings use true Arrow list struct columns",
    "TENSOR-MMAP-01 stop row-by-row Binary bytearray clone stack materialize contiguous tensor",
    "torch.from_file creates a CPU tensor backed directly by a memory-mapped file",
    "pgvector halfvec binary_quantize bit Hamming ANN rerank against original representation",
    "XGBoost rank:ndcg requires query groups through sorted qid group information",
    "dtrain.set_info(qid=qid_train) dval.set_info(qid=qid_val)",
    "COLLATERAL_REGRESSION an unrelated commit accidentally reverted a narrow correctness fix",
    "GpJSON constructs structural indexes in parallel and evaluates JSONPath using a GPU query engine",
    "CAPTURE ONCE NORMALIZE ONCE ENRICH ONCE PROJECT MANY WAYS",
    "the assistant checkpoint is BF16 not FP16 verified via safetensors header and config.json",
    "unsloth/gemma-4-E4B-it-unsloth-bnb-4bit NF4 bitsandbytes quantization config",
    "backbone_hidden_size 2560 matches E4B language model hidden size exactly",
    "AGMR-05 forward smoke produces finite BF16 hidden states shape [1,5,256]",
    "rankingQualityProven false trainingPerformed false checkpointMutated false",
    "SpanHead confident skip LangExtract call SpanHead uncertain call 8095 LangExtract",
    "RankHead confident skip mxbai call RankHead uncertain call mxbai",
    "AtlasFeatureInputV1 matrixSchema matrixRevision candidateOrdinal values presenceMask evidenceRefs",
    "readIfPresent returns null when presenceMask is false even if the section array is empty",
    "CodeEvidenceExtractionV1 grounded startByte endByte exactText confidence attributes",
    "extractDocumentNative legal-domain regex extractor citations statutes case names courts",
    "Every extraction must resolve to exact source bytes and preserve canonical candidate revision",
    "PHASE A mxbai served owner AtlasGemma late cross shadow LangExtract teacher fallback",
    "PHASE B AtlasGemma late AtlasGemma cross if needed mxbai low-confidence fallback",
    "PHASE C BitFrost cached late representations AtlasGemma late 32 64 128 LOD",
    "HyperGraphRAG becomes a DAG expansion helper emitting typed actions not arbitrary JSON",
    "QueryPacketV1 CandidatePacketV1 RankObservationV1 EvidenceCardV1 DagDecisionV1 ExecutionReceiptV1",
    "Headroom CacheAligner is a detector off by default not a live request rewriter",
    "ContextPrefixIdentityV1 STABLE PREFIX system schemas tool definitions frozen evidence",
    "prefixReuseRatio prefixDriftBytes cachedPrefillTokens newPrefillTokens",
    "Transformers.js v4 rewritten WebGPU runtime runs directly in Node Bun and Deno",
    "one canonical runtime owner per capability zero uncoordinated peer owners",
]


def run_breadth(checkpoint_dir: Path, *, seed: int = 17) -> dict[str, Any]:
    config_path = checkpoint_dir / "config.json"
    weights_path = checkpoint_dir / "model.safetensors"
    tokenizer_path = checkpoint_dir / "tokenizer.json"
    for p in (config_path, weights_path, tokenizer_path):
        if not p.is_file():
            raise FileNotFoundError(p)

    raw = json.loads(config_path.read_text(encoding="utf-8"))
    source_checksum_before = file_checksum(weights_path)
    config = derived_text_config(raw)
    torch.manual_seed(seed)
    model = Gemma4ForCausalLM(config)
    if hasattr(model, "lm_head"):
        del model.lm_head
    model = model.to(dtype=torch.bfloat16).eval()
    state = model.state_dict()

    loaded: list[str] = []
    with safe_open(str(weights_path), framework="pt", device="cpu") as handle:
        for name in sorted(handle.keys()):
            if name not in state:
                continue
            source = handle.get_tensor(name)
            target = state[name]
            if list(source.shape) != list(target.shape):
                continue
            with torch.no_grad():
                target.copy_(source.to(dtype=target.dtype))
            loaded.append(name)

    new_attention = [name for name in state if name.endswith(NEW_SUFFIXES)]
    for name in new_attention:
        initialize_parameter(name, state[name])

    rank_head = torch.nn.Linear(config.hidden_size, 1, bias=True, dtype=torch.bfloat16).eval()
    with torch.no_grad():
        torch.nn.init.xavier_uniform_(rank_head.weight)
        rank_head.bias.zero_()

    tokenizer = PreTrainedTokenizerFast(tokenizer_file=str(tokenizer_path))

    per_query: list[dict[str, Any]] = []
    for i, text in enumerate(QUERIES):
        encoded = tokenizer(text, return_tensors="pt")
        input_ids = encoded["input_ids"]
        attention_mask = encoded.get("attention_mask", torch.ones_like(input_ids))
        t0 = datetime.now(timezone.utc)
        with torch.inference_mode():
            output = model.model(input_ids=input_ids, attention_mask=attention_mask)
            hidden = output.last_hidden_state
            score = rank_head(hidden[:, -1, :])
        latency_ms = (datetime.now(timezone.utc) - t0).total_seconds() * 1000
        finite = bool(torch.isfinite(hidden).all().item() and torch.isfinite(score).all().item())
        per_query.append({
            "index": i,
            "tokenCount": int(input_ids.shape[1]),
            "textLength": len(text),
            "hiddenFinite": bool(torch.isfinite(hidden).all().item()),
            "scoreFinite": bool(torch.isfinite(score).all().item()),
            "finite": finite,
            "rawScore": float(score.item()),
            "latencyMs": round(latency_ms, 3),
        })

    source_checksum_after = file_checksum(weights_path)
    all_finite = all(r["finite"] for r in per_query)
    inherited = [n for n in loaded if not n.endswith(NEW_SUFFIXES)]
    scores = [r["rawScore"] for r in per_query]
    latencies = [r["latencyMs"] for r in per_query]

    status = (
        "BREADTH_STABILITY_PROVEN"
        if len(per_query) == len(QUERIES)
        and all_finite
        and len(inherited) == 46
        and source_checksum_before == source_checksum_after
        else "BLOCKED_BREADTH_TEST"
    )

    result = {
        "schema": SCHEMA,
        "status": status,
        "checkpointDir": str(checkpoint_dir),
        "queryCount": len(QUERIES),
        "allFinite": all_finite,
        "loadedInheritedTensorCount": len(inherited),
        "rankHeadTrained": False,
        "rankingQualityProven": False,
        "trainingPerformed": False,
        "cudaAllocated": False,
        "checkpointMutated": source_checksum_before != source_checksum_after,
        "weightsMutated": False,
        "canonicalAuthority": False,
        "scoreDistribution": {
            "min": min(scores),
            "max": max(scores),
            "mean": sum(scores) / len(scores),
        },
        "latencyMsDistribution": {
            "min": min(latencies),
            "max": max(latencies),
            "mean": sum(latencies) / len(latencies),
        },
        "perQuery": per_query,
        "sourceWeightsChecksumBefore": source_checksum_before,
        "sourceWeightsChecksumAfter": source_checksum_after,
        "runtimeInstantiation": "IN_MEMORY_ONLY",
        "observedAt": datetime.now(timezone.utc).isoformat(),
    }
    result["receiptChecksum"] = checksum(result)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=17)
    args = parser.parse_args()

    result = run_breadth(args.checkpoint_dir, seed=args.seed)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in result.items() if k != "perQuery"}, indent=2))
    return 0 if result["status"] == "BREADTH_STABILITY_PROVEN" else 1


if __name__ == "__main__":
    raise SystemExit(main())
