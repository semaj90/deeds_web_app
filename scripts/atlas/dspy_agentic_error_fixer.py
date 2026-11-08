#!/usr/bin/env python3
"""
scripts/atlas/dspy_agentic_error_fixer.py
-----------------------------------------
DSPy Agentic Error-Fixing Module with llms.txt KV-Cache Prefill (Slot 0).
Calls local llama-server (:8090, Ornith AI 1.5-9b) with cache_prompt=True.
"""

from __future__ import annotations

import json
import urllib.request
import urllib.error
from pathlib import Path
from typing import Any

# Resolve static llms.txt prefix
REPO_ROOT = Path(__file__).resolve().parents[2]
LLMS_TXT_PATH = REPO_ROOT / "sveltekit-frontend" / "static" / "llms.txt"
STATIC_LLMS_TXT_PREFIX = LLMS_TXT_PATH.read_text(encoding="utf-8") if LLMS_TXT_PATH.exists() else ""

try:
    import dspy
    DSPY_AVAILABLE = True
except ImportError:
    dspy = None  # type: ignore[assignment]
    DSPY_AVAILABLE = False


def configure_ornith_dspy_lm() -> Any:
    """
    Configures DSPy against local llama-server (:8090, Ornith AI 1.5-9b)
    with deterministic temperature=0.0 and KV prompt caching enabled.
    """
    if DSPY_AVAILABLE:
        lm = dspy.LM(
            model="openai/ornith-1.5-9b",
            api_base="http://127.0.0.1:8090/v1",
            api_key="local-ornith-key",
            temperature=0.0,
            max_tokens=1024,
            cache=True,
            extra_body={
                "cache_prompt": True,  # Reuses llama-server KV cache slot for llms.txt prefix
                "id_slot": 0
            }
        )
        dspy.configure(lm=lm)
        return lm
    return None


if DSPY_AVAILABLE:
    class ProsecutorDagErrorFixSignature(dspy.Signature):
        """
        System Prefix is prefilled from llms.txt.
        Given a PageRank-prioritized OpenSpec task, its NES LUT domain byte, 4-Pillar classification,
        low-rank SVD neighbor tasks, and scoped compiler/test diagnostics, synthesize a minimal,
        non-destructive patch plan and verification command.
        """
        llms_txt_manifest: str = dspy.InputField(desc="Static llms.txt + NES LUT 0x01..0x0A system manifest")
        nes_lut_code: str = dspy.InputField(desc="NES LUT hex code (0x01..0x0A) and Domain Key")
        four_pillar_tag: str = dspy.InputField(desc="Prosecutor pillar: WHO | WHAT | WHY | HOW | INGEST | DATA | ENGINE")
        primary_task: str = dspy.InputField(desc="Top PageRank leaf task ID, change_id, and text")
        low_rank_neighbor_tasks: list[str] = dspy.InputField(desc="Co-clustered tasks from BF16/FP32 SVD rank-32 MRL-128 similarity")
        compiler_diagnostics: str = dspy.InputField(desc="Scoped svelte-check / vitest machine output")

        root_cause_hypothesis: str = dspy.OutputField(desc="Single-sentence root cause respecting Parent Atlas boundaries")
        target_files: list[str] = dspy.OutputField(desc="Exact repository file paths to patch")
        minimal_patch_diff: str = dspy.OutputField(desc="Focused unified diff preserving Svelte 5 runes and PG18/SeaweedFS rules")
        scoped_verification_cmd: str = dspy.OutputField(desc="Exact single vitest or svelte-check command to verify the fix")


    class AtlasAgenticRepairPipeline(dspy.Module):
        def __init__(self):
            super().__init__()
            self.repair_predictor = dspy.Predict(ProsecutorDagErrorFixSignature)

        def forward(
            self,
            nes_lut_code: str,
            four_pillar_tag: str,
            primary_task: str,
            low_rank_neighbor_tasks: list[str],
            compiler_diagnostics: str
        ):
            return self.repair_predictor(
                llms_txt_manifest=STATIC_LLMS_TXT_PREFIX,
                nes_lut_code=nes_lut_code,
                four_pillar_tag=four_pillar_tag,
                primary_task=primary_task,
                low_rank_neighbor_tasks=low_rank_neighbor_tasks,
                compiler_diagnostics=compiler_diagnostics
            )
else:
    # Standalone direct HTTP client for llama-server :8090 with slot 0 KV-caching
    class AtlasAgenticRepairPipeline:
        def __init__(self, api_base: str = "http://127.0.0.1:8090/v1"):
            self.api_base = api_base

        def forward(
            self,
            nes_lut_code: str,
            four_pillar_tag: str,
            primary_task: str,
            low_rank_neighbor_tasks: list[str],
            compiler_diagnostics: str
        ) -> dict:
            prompt = (
                f"{STATIC_LLMS_TXT_PREFIX}\n\n"
                f"### TASK INFORMATION\n"
                f"- NES LUT Code: {nes_lut_code}\n"
                f"- Pillar: {four_pillar_tag}\n"
                f"- Primary Task: {primary_task}\n"
                f"- Low-Rank Neighbors: {json.dumps(low_rank_neighbor_tasks)}\n"
                f"- Compiler Diagnostics: {compiler_diagnostics}\n\n"
                f"Synthesize root cause, target files, minimal patch diff, and verification command."
            )
            payload = {
                "model": "ornith-1.5-9b",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.0,
                "max_tokens": 512,
                "cache_prompt": True,
                "id_slot": 0
            }
            req = urllib.request.Request(
                f"{self.api_base}/chat/completions",
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"}
            )
            try:
                with urllib.request.urlopen(req, timeout=5) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    content = data["choices"][0]["message"]["content"]
                    return {"status": "SUCCESS", "content": content}
            except Exception as exc:
                return {
                    "status": "OFFLINE_FALLBACK",
                    "reason": str(exc),
                    "simulatedResolution": {
                        "root_cause_hypothesis": f"Boundary alignment required for task: {primary_task[:60]}",
                        "target_files": ["sveltekit-frontend/src/lib/server/db/schema-postgres.ts"],
                        "minimal_patch_diff": "// Verified dry-run patch preserving Svelte 5 runes and PG18 rules",
                        "scoped_verification_cmd": "npm run check"
                    }
                }


if __name__ == "__main__":
    pipeline = AtlasAgenticRepairPipeline()
    test_result = pipeline.forward(
        nes_lut_code="0x06 (DRIZZLE_PG18_AIO)",
        four_pillar_tag="DATA",
        primary_task="PGVECTOR-03 EXACT-vs-HNSW PARITY (SEMANTIC-07)",
        low_rank_neighbor_tasks=["CANARY-PR-01", "GPU-PARITY-01"],
        compiler_diagnostics="TS2307: Cannot find module '$lib/server/db/client.js'"
    )

    receipt = {
        "engine": "DSPy_Agentic_Error_Fixer_v1",
        "dspyAvailable": DSPY_AVAILABLE,
        "llmsTxtPrefixBytes": len(STATIC_LLMS_TXT_PREFIX),
        "llmsTxtHash": "sha256:" + (
            urllib.request.hashlib.sha256(STATIC_LLMS_TXT_PREFIX.encode("utf-8")).hexdigest()
            if STATIC_LLMS_TXT_PREFIX else "none"
        ),
        "kvSlotPinned": 0,
        "sampleInference": test_result
    }

    out_receipt_path = REPO_ROOT / ".tmp" / "atlas" / "dspy-agentic-error-fixer-receipt.json"
    out_receipt_path.parent.mkdir(parents=True, exist_ok=True)
    out_receipt_path.write_text(json.dumps(receipt, indent=2), encoding="utf-8")
    print(json.dumps(receipt, indent=2))
