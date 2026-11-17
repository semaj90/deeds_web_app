#!/usr/bin/env python3
"""
scripts/atlas/dspy_agentic_error_fixer.py
-----------------------------------------
DSPy Agentic Error-Fixing Module with llms.txt KV-Cache Prefill (Slot 0).
Calls local llama-server (:8090, Ornith AI 1.5-9b) with cache_prompt=True.
Enforces reviewed T0 verifier commands, T2 diagnose-only gating, a 3-turn cap,
and forbidden-key sanitization for append-only turn ledger records.
"""

from __future__ import annotations

import hashlib
import json
import shlex
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

# Resolve static llms.txt prefix
REPO_ROOT = Path(__file__).resolve().parents[2]
LLMS_TXT_PATH = REPO_ROOT / "sveltekit-frontend" / "static" / "llms.txt"
STATIC_LLMS_TXT_PREFIX = LLMS_TXT_PATH.read_text(encoding="utf-8") if LLMS_TXT_PATH.exists() else ""

MAX_AGENTIC_TURNS = 3
FORBIDDEN_LEDGER_KEYS: tuple[str, ...] = ("hiddenThoughts", "chainOfThought", "kv_cache", "tensor")
ALLOWED_VERIFIER_PREFIXES: tuple[str, ...] = (
    "npm exec -- vitest run",
    "npx vitest run",
    "node scripts/atlas/verify-",
    "node scripts/atlas/audit-",
    "pytest",
    "ctest",
)
SHELL_METACHARACTERS: tuple[str, ...] = (";", "&&", "||", "|", ">", "<", "`", "$(", "\n", "\r")
PATH_PREFIXES: tuple[str, ...] = ("scripts/", "src/", "python/", "packages/", "sveltekit-frontend/")

try:
    import dspy
    DSPY_AVAILABLE = True
except ImportError:
    dspy = None  # type: ignore[assignment]
    DSPY_AVAILABLE = False


def validate_reviewed_verifier_cmd(verifier_cmd: str, repo_root: Path | None = None) -> dict[str, Any]:
    """Validate that a reviewed verifier command uses an allowlisted runner with no shell injection."""
    if not isinstance(verifier_cmd, str) or not verifier_cmd.strip():
        return {"valid": False, "reason": "EMPTY_VERIFIER_CMD"}

    normalized = verifier_cmd.strip()
    for bad in SHELL_METACHARACTERS:
        if bad in normalized:
            return {"valid": False, "reason": f"SHELL_METACHARACTERS_FORBIDDEN: {bad!r}"}

    matched_prefix = next((p for p in ALLOWED_VERIFIER_PREFIXES if normalized.startswith(p)), None)
    if matched_prefix is None:
        return {"valid": False, "reason": "VERIFIER_RUNNER_NOT_ALLOWLISTED"}

    if normalized.startswith(("node scripts/atlas/verify-", "node scripts/atlas/audit-")):
        pass
    elif len(normalized) > len(matched_prefix) and not normalized[len(matched_prefix)].isspace():
        return {"valid": False, "reason": "VERIFIER_RUNNER_NOT_ALLOWLISTED"}

    try:
        tokens = shlex.split(normalized, posix=True)
    except ValueError as exc:
        return {"valid": False, "reason": f"VERIFIER_PARSE_ERROR: {exc}"}

    for flag in ("-e", "--eval", "-c"):
        if flag in tokens:
            return {"valid": False, "reason": f"INLINE_EXEC_FLAG_FORBIDDEN: {flag}"}

    root = (repo_root or REPO_ROOT).resolve()
    checked_paths: list[str] = []
    for tok in tokens:
        clean_tok = tok.split("#", 1)[0]
        if clean_tok.startswith(PATH_PREFIXES):
            candidates = [root / clean_tok, root / "sveltekit-frontend" / clean_tok]
            if not any(c.exists() for c in candidates):
                return {"valid": False, "reason": f"VERIFIER_TARGET_MISSING: {clean_tok}"}
            checked_paths.append(clean_tok)

    return {
        "valid": True,
        "command": normalized,
        "prefix": matched_prefix,
        "tokens": tokens,
        "checkedPaths": checked_paths,
    }


def _scan_forbidden_keys(value: Any) -> str | None:
    if isinstance(value, dict):
        for k, v in value.items():
            if str(k) in FORBIDDEN_LEDGER_KEYS:
                return str(k)
            found = _scan_forbidden_keys(v)
            if found is not None:
                return found
    elif isinstance(value, (list, tuple)):
        for item in value:
            found = _scan_forbidden_keys(item)
            if found is not None:
                return found
    return None


def build_turn_ledger_entry_v1(
    *,
    task_key: str,
    turn: int,
    verifier_tier: str,
    signature: str,
    inputs_hash: str,
    proposal_hash: str,
    verifier_cmd: str,
    exit_code: int,
    reward: float,
    model_id: str,
    adapter_rev: str | None = None,
    extra_metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Construct a bounded, non-authoritative turn ledger record stripped of forbidden reasoning fields."""
    if not isinstance(turn, int) or turn < 1 or turn > MAX_AGENTIC_TURNS:
        raise ValueError(f"AGENTIC_TURN_CAP_EXCEEDED: turn={turn}, max={MAX_AGENTIC_TURNS}")
    if verifier_tier not in ("T0", "T1", "T2"):
        raise ValueError(f"INVALID_VERIFIER_TIER: {verifier_tier}")
    if extra_metadata is not None:
        bad_key = _scan_forbidden_keys(extra_metadata)
        if bad_key is not None:
            raise ValueError(f"FORBIDDEN_STORAGE_KEY: {bad_key}")

    entry: dict[str, Any] = {
        "schema": "atlas.agentic-fixer-turn-ledger.v1",
        "task_key": task_key,
        "turn": turn,
        "verifier_tier": verifier_tier,
        "signature": signature,
        "inputs_hash": inputs_hash,
        "proposal_hash": proposal_hash,
        "verifier_cmd": verifier_cmd,
        "exit_code": int(exit_code),
        "reward": float(reward),
        "model_id": model_id,
        "adapter_rev": adapter_rev,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
    if extra_metadata:
        entry["metadata"] = dict(extra_metadata)
    return entry


def _precheck_pipeline_gates(verifier_tier: str, verifier_cmd: str | None, turn: int) -> dict[str, Any] | None:
    if not isinstance(turn, int) or turn < 1 or turn > MAX_AGENTIC_TURNS:
        return {
            "status": "BLOCKED",
            "blockReason": f"AGENTIC_TURN_CAP_EXCEEDED: turn={turn} > {MAX_AGENTIC_TURNS}",
            "patch_targets": [],
            "writesPerformed": False,
            "canonicalAuthority": False,
        }
    if verifier_tier == "T2":
        return {
            "status": "DIAGNOSE_ONLY_NO_PATCH",
            "verifier_tier": "T2",
            "blockReason": "T2_NO_RUNNABLE_VERIFIER: diagnose and summarize only, never patch",
            "patch_targets": [],
            "writesPerformed": False,
            "canonicalAuthority": False,
        }
    check = validate_reviewed_verifier_cmd(verifier_cmd or "")
    if verifier_tier != "T0" or not check["valid"]:
        return {
            "status": "BLOCKED_MISSING_T0_VERIFIER",
            "verifier_tier": verifier_tier,
            "verifierValidation": check,
            "patch_targets": [],
            "writesPerformed": False,
            "canonicalAuthority": False,
        }
    return None


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
                "id_slot": 0,
            },
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
            compiler_diagnostics: str,
            verifier_tier: str = "T0",
            verifier_cmd: str | None = None,
            turn: int = 1,
        ):
            blocked = _precheck_pipeline_gates(verifier_tier, verifier_cmd, turn)
            if blocked is not None:
                return blocked
            try:
                return self.repair_predictor(
                    llms_txt_manifest=STATIC_LLMS_TXT_PREFIX,
                    nes_lut_code=nes_lut_code,
                    four_pillar_tag=four_pillar_tag,
                    primary_task=primary_task,
                    low_rank_neighbor_tasks=low_rank_neighbor_tasks,
                    compiler_diagnostics=compiler_diagnostics,
                )
            except Exception as exc:
                return {
                    "status": "BLOCKED",
                    "blockReason": f"ORNITH_ENDPOINT_UNREACHABLE: {exc}",
                    "patch_targets": [],
                    "writesPerformed": False,
                    "canonicalAuthority": False,
                }
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
            compiler_diagnostics: str,
            verifier_tier: str = "T0",
            verifier_cmd: str | None = None,
            turn: int = 1,
        ) -> dict:
            blocked = _precheck_pipeline_gates(verifier_tier, verifier_cmd, turn)
            if blocked is not None:
                return blocked

            prompt = (
                f"{STATIC_LLMS_TXT_PREFIX}\n\n"
                f"### TASK INFORMATION\n"
                f"- NES LUT Code: {nes_lut_code}\n"
                f"- Pillar: {four_pillar_tag}\n"
                f"- Primary Task: {primary_task}\n"
                f"- Reviewed T0 Verifier: {verifier_cmd}\n"
                f"- Turn: {turn}/{MAX_AGENTIC_TURNS}\n"
                f"- Low-Rank Neighbors: {json.dumps(low_rank_neighbor_tasks)}\n"
                f"- Compiler Diagnostics: {compiler_diagnostics}\n\n"
                f"Synthesize root cause, target files, and minimal patch diff. Keep canonicalAuthority=false."
            )
            payload = {
                "model": "ornith-1.5-9b",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.0,
                "max_tokens": 512,
                "cache_prompt": True,
                "id_slot": 0,
            }
            req = urllib.request.Request(
                f"{self.api_base}/chat/completions",
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
            )
            try:
                with urllib.request.urlopen(req, timeout=5) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    content = data["choices"][0]["message"]["content"]
                    return {"status": "SUCCESS", "content": content}
            except Exception as exc:
                return {
                    "status": "BLOCKED",
                    "blockReason": f"ORNITH_ENDPOINT_UNREACHABLE: {exc}",
                    "patch_targets": [],
                    "writesPerformed": False,
                    "canonicalAuthority": False,
                }


ProsecutorErrorFixerAgent = AtlasAgenticRepairPipeline


if __name__ == "__main__":
    pipeline = AtlasAgenticRepairPipeline()
    reviewed_cmd = "node scripts/atlas/verify-nes-fsm-native-runtime-v1.mjs"
    test_result = pipeline.forward(
        nes_lut_code="0x06 (DRIZZLE_PG18_AIO)",
        four_pillar_tag="DATA",
        primary_task="PGVECTOR-03 EXACT-vs-HNSW PARITY (SEMANTIC-07)",
        low_rank_neighbor_tasks=["CANARY-PR-01", "GPU-PARITY-01"],
        compiler_diagnostics="TS2307: Cannot find module '$lib/server/db/client.js'",
        verifier_tier="T0",
        verifier_cmd=reviewed_cmd,
        turn=1,
    )

    receipt = {
        "engine": "DSPy_Agentic_Error_Fixer_v1",
        "dspyAvailable": DSPY_AVAILABLE,
        "maxAgenticTurns": MAX_AGENTIC_TURNS,
        "llmsTxtPrefixBytes": len(STATIC_LLMS_TXT_PREFIX),
        "llmsTxtHash": "sha256:" + (
            hashlib.sha256(STATIC_LLMS_TXT_PREFIX.encode("utf-8")).hexdigest()
            if STATIC_LLMS_TXT_PREFIX else "none"
        ),
        "kvSlotPinned": 0,
        "sampleInference": test_result,
    }

    out_receipt_path = REPO_ROOT / ".tmp" / "atlas" / "dspy-agentic-error-fixer-receipt.json"
    out_receipt_path.parent.mkdir(parents=True, exist_ok=True)
    out_receipt_path.write_text(json.dumps(receipt, indent=2), encoding="utf-8")
    print(json.dumps(receipt, indent=2))
