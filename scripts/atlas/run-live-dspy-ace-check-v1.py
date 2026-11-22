#!/usr/bin/env python3
"""
Live DSPy 3.4.1 -> Windows :8090 llama-server Typed Execution & Receipt Runner (v2)

Implements Priority 1 & 4:
  - Uses dspy.JSONAdapter() + forwards `response_format: {"type": "json_object"}`
    to llama-server :8090.
  - Inspects `finish_reason` (detecting `"length"` truncation vs `"stop"`).
  - Separates typed outcomes:
      * VALIDATED
      * MODEL_OUTPUT_PARSE_FAILED
      * LM_TRANSPORT_FAILED
      * ACE_REJECTED
  - Supports `--trials N` live runs and `--run-adversarial` synthetic failure tests
    (transport timeout, parse failure, unauthorized evidence reference).

Zero database or cache writes (`writesPerformed: false`).
"""

import argparse
import importlib.util
import json
import subprocess
import time
from pathlib import Path

import dspy

REPO_ROOT = Path(__file__).resolve().parents[2]


class WinLoopbackLM(dspy.BaseLM):
    def __init__(
        self,
        model: str,
        max_tokens: int = 1024,
        use_json_response_format: bool = True,
        simulate_mode: str | None = None,
    ):
        super().__init__(model=model)
        self.max_tokens = max_tokens
        self.use_json_response_format = use_json_response_format
        self.simulate_mode = simulate_mode
        self.last_finish_reason = None
        self.last_usage = None

    def forward(self, prompt=None, messages=None, **kwargs):
        if self.simulate_mode == "transport_error":
            raise TimeoutError("SIMULATED_LM_TRANSPORT_TIMEOUT")
        if self.simulate_mode == "parse_error":
            return {
                "choices": [
                    {
                        "message": {"role": "assistant", "content": "NOT_JSON_UNPARSEABLE"},
                        "finish_reason": "length",
                    }
                ],
                "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
            }
        if self.simulate_mode == "unauthorized_ref":
            forged = json.dumps({
                "task_kind": "SUMMARIZE",
                "instruction": "Summarize using an unauthorized forged reference.",
                "evidence_refs": ["unauthorized://forged-ref#L999"],
            })
            return {
                "choices": [
                    {
                        "message": {"role": "assistant", "content": forged},
                        "finish_reason": "stop",
                    }
                ],
                "usage": {"prompt_tokens": 10, "completion_tokens": 24, "total_tokens": 34},
            }

        msgs = messages or [{"role": "user", "content": prompt or ""}]
        body = {
            "model": self.model,
            "messages": msgs,
            "max_tokens": self.max_tokens,
            "temperature": 0.0,
        }
        requested_format = kwargs.get("response_format")
        if requested_format:
            # DSPy's JSONAdapter supplies a schema-constrained format; forward it unchanged.
            body["response_format"] = requested_format
        elif self.use_json_response_format:
            body["response_format"] = {"type": "json_object"}

        res = subprocess.run(
            [
                "/mnt/c/Windows/System32/curl.exe",
                "-s",
                "-X",
                "POST",
                "http://127.0.0.1:8090/v1/chat/completions",
                "-H",
                "Content-Type: application/json",
                "-d",
                json.dumps(body),
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        data = json.loads(res.stdout)
        choice = (data.get("choices") or [{}])[0]
        self.last_finish_reason = choice.get("finish_reason")
        self.last_usage = data.get("usage")
        return data


def run_typed_trial(ace, predict, lm: WinLoopbackLM, header: dict, ranked: dict, trial_id: int):
    started = time.monotonic()
    parse_failures = []
    outcome = "VALIDATED"
    error_code = None
    out = None

    try:
        out = ace.recommend_refine_v1(
            ranked, k=2, packet_key="P1", predict=predict, header=header
        )
        if out["status"] != "VALIDATED":
            outcome = "ACE_REJECTED"
            error_code = "ACE_PROPOSAL_VALIDATION_FAILED"
    except Exception as exc:
        err_name = type(exc).__name__
        err_msg = str(exc)
        if "Transport" in err_name or "Timeout" in err_name or "Connection" in err_msg:
            outcome = "LM_TRANSPORT_FAILED"
            error_code = err_name
        else:
            outcome = "MODEL_OUTPUT_PARSE_FAILED"
            error_code = err_name
        parse_failures.append({"errorType": err_name, "message": err_msg[:240]})

    elapsed_ms = round((time.monotonic() - started) * 1000, 1)
    return {
        "schema": "atlas.dspy-execution-receipt.v1",
        "trial": trial_id,
        "outcome": outcome,
        "errorCode": error_code,
        "writesPerformed": False,
        "modelRevision": header["model_revision"],
        "sourceRevision": header["source_revision"],
        "finishReason": lm.last_finish_reason,
        "usage": lm.last_usage,
        "elapsedMs": elapsed_ms,
        "chainOk": out["chainOk"] if out else False,
        "attempts": out["attempts"] if out else 0,
        "parseFailures": parse_failures,
        "instruction": (out.get("validated") or {}).get("task", {}).get("instruction")
        if out
        else None,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--trials", type=int, default=2)
    parser.add_argument("--max-tokens", type=int, default=1024)
    parser.add_argument("--run-adversarial", action="store_true")
    args = parser.parse_args()

    spec = importlib.util.spec_from_file_location(
        "ace", REPO_ROOT / "scripts/atlas/ace_packet_proposal_v1.py"
    )
    ace = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(ace)

    ranked = {
        "schema": "atlas.topk.v1",
        "order": "SCORE_DESC_ORDINAL_ASC_ID_ASC",
        "candidates": [
            {
                "canonicalId": "c1",
                "candidateOrdinal": 0,
                "score": 0.9,
                "sourceRevision": "src:r1",
                "evidenceRefs": ["E1"],
            },
            {
                "canonicalId": "c2",
                "candidateOrdinal": 1,
                "score": 0.5,
                "sourceRevision": "src:r1",
                "evidenceRefs": ["E2"],
            },
        ],
    }
    header = dict(
        workspace_revision="ws:r1",
        source_revision="src:r1",
        context_manifest_checksum="sha256:" + "a" * 64,
        alignment_output_checksum="a" * 64,
        model_revision="gemma4-legal-iq4xs-direct.gguf",
        policy_revision="policy:r1",
    )

    lm = WinLoopbackLM(
        model="gemma4-legal-iq4xs-direct.gguf",
        max_tokens=args.max_tokens,
        use_json_response_format=True,
    )
    dspy.configure(lm=lm, adapter=dspy.JSONAdapter())
    predict = ace.build_compose_program_v1()

    live_results = [
        run_typed_trial(ace, predict, lm, header, ranked, i)
        for i in range(1, args.trials + 1)
    ]

    adversarial_results = []
    if args.run_adversarial:
        for mode in ("transport_error", "parse_error", "unauthorized_ref"):
            adv_lm = WinLoopbackLM(
                model="gemma4-legal-iq4xs-direct.gguf",
                max_tokens=args.max_tokens,
                simulate_mode=mode,
            )
            with dspy.context(lm=adv_lm, adapter=dspy.JSONAdapter()):
                adversarial_results.append(
                    run_typed_trial(ace, predict, adv_lm, header, ranked, 0)
                )

    print(
        json.dumps(
            {
                "trials": args.trials,
                "passed": sum(1 for r in live_results if r["outcome"] == "VALIDATED"),
                "liveResults": live_results,
                "adversarialResults": adversarial_results,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
