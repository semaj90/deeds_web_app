"""Evidence-grounded discrete observation vocabulary tests."""
import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import miniforge_nlp_sidecar as sidecar  # noqa: E402


def test_builder_emits_only_versioned_observations_backed_by_present_evidence():
    text = "fixture source"
    request = sidecar.AnalyzeRequest(
        text=text,
        source_ref="fixture/hmm.py",
        source_revision="sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest(),
        extraction_mode="full",
    )
    entity = sidecar.Entity(text="fixture", label="TERM")
    relationship = sidecar.Relationship(subject="module", predicate="imports", object="dependency")
    chunk = sidecar.Chunk(kind="function", text="def fixture(): pass", start=0, end=len(text.encode("utf-8")))

    observations = sidecar._build_hmm_observations(
        request,
        text,
        [entity],
        [relationship],
        [chunk],
        [object()],
    )
    emitted = [item.observation for item in observations]

    assert emitted == [
        "STRUCTURAL_CHUNK_PRESENT",
        "ENTITY_EVIDENCE_FOUND",
        "IMPORT_RELATIONSHIP_FOUND",
        "SEMANTIC_CARD_BUILT",
    ]
    assert set(emitted) <= sidecar.HMM_OBSERVATION_VOCABULARY_V1
    assert all(item.source_revision == request.source_revision for item in observations)
    assert "PATCH_SUCCESS" not in emitted
    assert "HIGH_SEMANTIC_MATCH" not in emitted
    assert "AST_CALL_EDGE_FOUND" not in emitted


def test_full_extraction_mode_alone_is_not_a_success_observation():
    text = "fixture"
    request = sidecar.AnalyzeRequest(
        text=text,
        source_ref="fixture/no-evidence.py",
        source_revision="sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest(),
        extraction_mode="full",
    )

    observations = sidecar._build_hmm_observations(request, text, [], [], [], [])

    assert len(observations) == 1
    assert observations[0].observation == "REPAIR_AMBIGUOUS"
    assert observations[0].source_pass == "sequence"


def test_sequence_pass_reports_builder_not_unavailable_hmm_inference():
    text = "no sequence evidence"
    request = sidecar.AnalyzeRequest(
        text=text,
        source_ref="fixture/sequence.py",
        source_revision="sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest(),
        passes=["sequence"],
    )

    results, *_ = sidecar._build_pass_results(request, text, [], [], [], [], [])

    sequence = next(result for result in results if result.family == "sequence")
    assert sequence.backend == "observation-builder"
    assert sequence.backend_version == sidecar.HMM_OBSERVATION_VOCABULARY_REVISION_V1
    assert sequence.features == {"observation_count": 1.0}
    assert sequence.artifacts["inference_status"] == "NOT_RUN"
    assert "topological_confidence" not in sequence.features
    assert "execution_confidence" not in sequence.features
