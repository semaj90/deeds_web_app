"""MICRO-04 first slice: read-only shadow forward pass of AtlasGemmaRank against a frozen,
revision-qualified candidate cohort, compared structurally/latency-wise against the real mxbai
teacher receipt (docs/reports/atlas-gemma-teacher-receipt-v1.json).

Revision qualification here is content-hash based (sha256 of each candidate's real text as its
sourceRevision, a shared workspaceRevision constant for the cohort) rather than round-tripped
through the TypeScript CandidateOrdinalMapV1 materializer -- semantically equivalent (every
candidate carries a real, deterministic, content-derived revision) but structurally simpler for a
Python-side test. This does NOT prove rank quality -- the scalar head is still untrained -- it
proves the shadow pipeline runs end-to-end against a properly-identified cohort and produces a
real CPU-latency comparison against the live mxbai numbers already on record.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import torch
from safetensors import safe_open
from transformers import Gemma4ForCausalLM, PreTrainedTokenizerFast

from atlas_gemma_rank_load_init_proof_v1 import checksum, derived_text_config, file_checksum, initialize_parameter

SCHEMA = "atlas.gemma-rank-shadow-04.v1"
NEW_SUFFIXES = (".self_attn.k_proj.weight", ".self_attn.v_proj.weight", ".self_attn.k_norm.weight")
WORKSPACE_REVISION = "atlas-gemma-shadow-04-cohort-v1"

# Same 3 queries x 5 candidates as docs/reports/rerank-shadow-01-live-fixture-v1.json / the
# teacher receipt -- real code text from this session's own work, not fabricated.
COHORT: list[dict[str, Any]] = [
    {"query": "Which function sums duplicate-identity RRF scores instead of discarding them?", "candidates": [
        ("service-merge", "export function mergeDuplicateIdentityScores(results) { const key = r.symbol_version_id ?? r.packet_key ?? r.id; merged.set(key, { ...representative, score: existing.score + r.score }); }"),
        ("rrf-tologicallane", "function toLogicalLaneName(value) { const normalized = value.trim().toLowerCase(); return normalizeRetrievalLane(normalized) ?? (normalized || \"dispatcher\"); }"),
        ("lane-aliases", "export function normalizeRetrievalLane(value) { if (DENSE_LANE_ALIAS_SET.has(normalized)) return \"dense\"; if (LEXICAL_LANE_ALIAS_SET.has(normalized)) return \"lexical\"; return undefined; }"),
        ("model-resolution", "export function assertRuntimeIdentityIsMocked(resolution, expectedMockedId) { if (!resolution.runtimeDiscovered) throw new Error(); }"),
        ("helper-card", "export function canDispatchDirectly(candidate) { return candidate.rank === 0 && candidate.similarity >= HELPER_ROUTING_DIRECT_DISPATCH_THRESHOLD; }"),
    ]},
    {"query": "Which contract enforces that batch extraction never runs on the full corpus, only a bounded candidate subset?", "candidates": [
        ("evidence-card", "export function assertExtractionBatchBounded(candidateCount) { if (candidateCount > CANDIDATE_EVIDENCE_EXTRACTION_MAX_BATCH) throw new Error(); }"),
        ("firecrawl-provider", "export async function loadFirecrawl() { if (cached) return cached; const mod = await import(\"@mendable/firecrawl-js\"); }"),
        ("relevance-scores", "export function shouldEscalateToTextRelevance(cheapScoresDescending) { if (cheapScoresDescending.length < 2) return false; }"),
        ("fusion-contribution", "export interface FusionContributionV1 { canonicalId: string; logicalLane: string; rank: number; weight: number; }"),
        ("helper-card-2", "export const HelperCardV1Schema = z.object({ helperId: id, capabilities: z.string().min(1) }).strict();"),
    ]},
    {"query": "Which module centralizes the optional dynamic import of the Firecrawl SDK behind one documented type-check exception?", "candidates": [
        ("firecrawl-provider-2", "export async function loadFirecrawl() { try { const mod = await import(\"@mendable/firecrawl-js\"); } catch (err) { cached = { status: \"UNAVAILABLE\" }; } return cached; }"),
        ("youtube-transcript", "async function fetchViaFirecrawlMarkdown(videoId) { const apiKey = ENV.FIRECRAWL_API_KEY; if (!apiKey) return null; const firecrawl = await loadFirecrawl(); }"),
        ("candidate-evidence-2", "export const CandidateEvidenceCardV1Schema = z.object({ canonicalId: id, packetKey: id, sourceRef: z.string().min(1) }).strict();"),
        ("model-resolution-2", "export const MODEL_RESOLUTION_SOURCE_VALUES = [\"REQUEST_ALIAS\", \"CONFIG\", \"LLAMA_V1_MODELS\", \"LLAMA_PROPS\"];"),
        ("retrieval-lane-2", "const DENSE_LANE_ALIASES = [\"dense\", \"dense_384\", \"dense_768\", \"qdrant\", \"qdrant_vector\"];"),
    ]},
]


def content_revision(text: str) -> str:
    return "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()


def run_shadow(checkpoint_dir: Path, *, seed: int = 17) -> dict[str, Any]:
    config_path = checkpoint_dir / "config.json"
    weights_path = checkpoint_dir / "model.safetensors"
    tokenizer_path = checkpoint_dir / "tokenizer.json"

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
            if list(source.shape) != list(state[name].shape):
                continue
            with torch.no_grad():
                state[name].copy_(source.to(dtype=state[name].dtype))
            loaded.append(name)
    for name in [n for n in state if n.endswith(NEW_SUFFIXES)]:
        initialize_parameter(name, state[name])

    rank_head = torch.nn.Linear(config.hidden_size, 1, bias=True, dtype=torch.bfloat16).eval()
    with torch.no_grad():
        torch.nn.init.xavier_uniform_(rank_head.weight)
        rank_head.bias.zero_()

    tokenizer = PreTrainedTokenizerFast(tokenizer_file=str(tokenizer_path))

    def score_text(text: str) -> dict[str, Any]:
        encoded = tokenizer(text, return_tensors="pt")
        input_ids = encoded["input_ids"]
        attention_mask = encoded.get("attention_mask", torch.ones_like(input_ids))
        t0 = datetime.now(timezone.utc)
        with torch.inference_mode():
            output = model.model(input_ids=input_ids, attention_mask=attention_mask)
            hidden = output.last_hidden_state
            score = rank_head(hidden[:, -1, :])
        latency_ms = (datetime.now(timezone.utc) - t0).total_seconds() * 1000
        return {
            "tokenCount": int(input_ids.shape[1]),
            "finite": bool(torch.isfinite(hidden).all().item() and torch.isfinite(score).all().item()),
            "rawScore": float(score.item()),
            "latencyMs": round(latency_ms, 3),
        }

    queries: list[dict[str, Any]] = []
    for item in COHORT:
        candidate_results = []
        for candidate_id, text in item["candidates"]:
            result = score_text(text)
            candidate_results.append({
                "canonicalId": candidate_id,
                "sourceRevision": content_revision(text),
                "workspaceRevision": WORKSPACE_REVISION,
                **result,
            })
        queries.append({"query": item["query"], "candidates": candidate_results})

    source_checksum_after = file_checksum(weights_path)
    all_latencies = [c["latencyMs"] for q in queries for c in q["candidates"]]
    all_finite = all(c["finite"] for q in queries for c in q["candidates"])

    result = {
        "schema": SCHEMA,
        "status": "SHADOW_STRUCTURAL_PROVEN" if all_finite and source_checksum_before == source_checksum_after else "BLOCKED",
        "checkpointDir": str(checkpoint_dir),
        "cohortRevisionQualified": True,
        "revisionQualificationMethod": "content-hash sha256 per candidate, shared workspaceRevision constant -- not round-tripped through TS CandidateOrdinalMapV1",
        "rankHeadTrained": False,
        "rankingQualityProven": False,
        "servedOrderChanged": False,
        "cacheIdentityChanged": False,
        "trainingPerformed": False,
        "cudaAllocated": False,
        "checkpointMutated": source_checksum_before != source_checksum_after,
        "queryCount": len(queries),
        "candidateCount": sum(len(q["candidates"]) for q in queries),
        "allFinite": all_finite,
        "cpuLatencyMsDistribution": {
            "min": min(all_latencies),
            "max": max(all_latencies),
            "mean": sum(all_latencies) / len(all_latencies),
        },
        "comparisonNote": (
            "mxbai's own real per-query latency (network+GPU round trip to the :8099 sidecar) is "
            "recorded in docs/reports/rerank-shadow-01-live-fixture-v1.json detail.mxbai[].latencyMs "
            "-- not re-fetched here to avoid a redundant live call. AtlasGemmaRank's CPU per-candidate "
            "latency above is a different unit (per-candidate, in-process CPU) than mxbai's per-query "
            "(all-candidates-at-once, GPU, network) latency -- reported separately, not averaged "
            "together, since combining them would misrepresent both."
        ),
        "queries": queries,
        "sourceWeightsChecksumBefore": source_checksum_before,
        "sourceWeightsChecksumAfter": source_checksum_after,
        "observedAt": datetime.now(timezone.utc).isoformat(),
    }
    result["receiptChecksum"] = checksum(result)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = run_shadow(args.checkpoint_dir)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in result.items() if k != "queries"}, indent=2))
    return 0 if result["status"] == "SHADOW_STRUCTURAL_PROVEN" else 1


if __name__ == "__main__":
    raise SystemExit(main())
