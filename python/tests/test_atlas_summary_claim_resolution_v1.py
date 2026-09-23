from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

from atlas_summary_claim_resolution_v1 import ESCALATION_REVISION, layer_telemetry_v1, resolve_and_seal_v1, resolve_slots_v1
from atlas_summary_claim_validation_v1 import SummaryClaimValidation

FIXTURE = json.loads((Path(__file__).resolve().parents[2] / "sveltekit-frontend/src/lib/server/atlas/docs/__fixtures__/summary-claim-validation-v1.fixture.json").read_text(encoding="utf-8"))
JUDGED = {"status": "JUDGED", "verdict": "SUPPORTED", "citedSpans": [], "unsupportedFragment": None, "judgeModelId": "ornith-1.5-9b",
          "judgeModelRevision": "ornith-1.5-9b:hforf.gguf", "judgePromptRevision": "summary-claim-judge-prompt:val-07-v1", "independenceClass": "SAME_MODEL_SEMANTIC_JUDGE"}


def clean() -> dict:
    c = copy.deepcopy(FIXTURE["skeleton"])
    c["technical"]["status"] = c["numeric"]["status"] = c["version"]["status"] = "PASS"
    c["sourceSpan"]["status"] = "NO_CLAIMED_SPAN"
    c["semantic"] = copy.deepcopy(JUDGED)
    return c


def with_(**slots) -> dict:
    c = clean()
    for k, v in slots.items():
        if isinstance(v, dict):
            c[k].update(v)
        else:
            c[k] = v
    return c


def test_clean_deterministic_layers_plus_supported_semantic_is_admit() -> None:
    for verdict in ("SUPPORTED", "SUPPORTED_PARAPHRASE", "SUPPORTED_WITH_OMISSION"):
        out = resolve_slots_v1(with_(semantic={"verdict": verdict}))
        assert (out["decision"], out["resolutionLayer"]) == ("ADMIT", "COMPOSITE")


@pytest.mark.parametrize(("slots", "layer"), [
    ({"technical": {"status": "FAIL"}}, "TECHNICAL"),
    ({"numeric": {"status": "FAIL"}}, "NUMERIC"),
    ({"version": {"status": "FAIL"}}, "VERSION"),
    ({"sourceSpan": {"status": "REJECTED"}}, "SOURCE_SPAN"),
    ({"sourceSpan": {"status": "UNVERIFIED"}}, "SOURCE_SPAN"),
    ({"ontology": {"status": "FAIL", "kernelRevision": "oak-kernel:r1"}}, "ONTOLOGY"),
])
def test_every_hard_deterministic_failure_rejects_even_when_the_judge_says_supported(slots: dict, layer: str) -> None:
    out = resolve_slots_v1(with_(**slots))  # semantic is SUPPORTED in clean()
    assert (out["decision"], out["resolutionLayer"]) == ("REJECT", layer)


def test_precedence_is_technical_then_numeric_then_version_then_span() -> None:
    both = with_(technical={"status": "FAIL"}, numeric={"status": "FAIL"}, version={"status": "FAIL"})
    assert resolve_slots_v1(both)["resolutionLayer"] == "TECHNICAL"
    assert resolve_slots_v1(with_(numeric={"status": "FAIL"}, version={"status": "FAIL"}))["resolutionLayer"] == "NUMERIC"
    assert resolve_slots_v1(with_(version={"status": "FAIL"}, sourceSpan={"status": "REJECTED"}))["resolutionLayer"] == "VERSION"


@pytest.mark.parametrize("verdict", ["UNSUPPORTED_CLAIM", "CONTRADICTED"])
def test_semantic_unsupported_or_contradicted_rejects(verdict: str) -> None:
    assert resolve_slots_v1(with_(semantic={"verdict": verdict}))["decision"] == "REJECT"


@pytest.mark.parametrize("semantic", [
    {"verdict": "PARTIALLY_SUPPORTED"}, {"verdict": "INSUFFICIENT_EVIDENCE"}, {"verdict": "UNKNOWN"},
])
def test_non_decisive_semantic_verdicts_route_to_review(semantic: dict) -> None:
    out = resolve_slots_v1(with_(semantic=semantic))
    assert (out["decision"], out["resolutionLayer"]) == ("REVIEW", "SEMANTIC")


def test_judge_error_or_not_run_is_review_never_admit() -> None:
    err = with_(semantic={"status": "JUDGE_ERROR", "verdict": None, "judgeModelId": None, "judgeModelRevision": None, "judgePromptRevision": None, "independenceClass": None})
    assert resolve_slots_v1(err)["decision"] == "REVIEW"
    assert resolve_slots_v1(FIXTURE["skeleton"])["decision"] == "REVIEW"  # every slot NOT_RUN


def test_incomplete_deterministic_layer_is_review_and_a_claimed_span_needs_verification() -> None:
    assert resolve_slots_v1(with_(technical={"status": "NOT_RUN"}))["decision"] == "REVIEW"
    assert resolve_slots_v1(with_(sourceSpan={"status": "NOT_RUN"}))["decision"] == "REVIEW"
    claimed = resolve_slots_v1(with_(sourceSpan={"status": "CLAIMED", "spans": [{"startByte": 1, "endByte": 5, "textChecksum": "a" * 64}]}))
    assert claimed["decision"] == "REVIEW" and claimed["resolutionLayer"] == "SOURCE_SPAN"


def test_ontology_not_run_or_not_applicable_is_non_blocking() -> None:
    for status in ("NOT_RUN", "NOT_APPLICABLE"):
        assert resolve_slots_v1(with_(ontology={"status": status}))["decision"] == "ADMIT"


def test_omission_never_gates_a_clean_claim() -> None:
    c = with_(technical={"missingTechnicalTokens": ["hnsw.iterative_scan"], "sourceTokens": ["hnsw.iterative_scan"]})
    assert resolve_slots_v1(c)["decision"] == "ADMIT"


def test_resolution_is_deterministic_and_the_sealed_result_validates_with_the_strict_mirror() -> None:
    c = clean()
    a, b = resolve_and_seal_v1(c), resolve_and_seal_v1(copy.deepcopy(c))
    assert a == b
    assert a["result"] == {"decision": "ADMIT", "escalationRevision": ESCALATION_REVISION} and a["resolutionLayer"] == "COMPOSITE"
    SummaryClaimValidation.model_validate(a)
    assert a["validationChecksum"] != c["validationChecksum"]  # re-sealed because the result changed
    assert a["validationId"] == c["validationId"]  # identity (chunk + summary + ordinal + validator revision) is unchanged


def test_telemetry_counts_decisions_and_resolving_layers() -> None:
    resolved = [resolve_and_seal_v1(clean()), resolve_and_seal_v1(with_(numeric={"status": "FAIL"})), resolve_and_seal_v1(with_(semantic={"verdict": "UNKNOWN"}))]
    t = layer_telemetry_v1(resolved)
    assert t == {"claims": 3, "byDecision": {"ADMIT": 1, "REJECT": 1, "REVIEW": 1}, "byLayer": {"COMPOSITE": 1, "NUMERIC": 1, "SEMANTIC": 1}}
