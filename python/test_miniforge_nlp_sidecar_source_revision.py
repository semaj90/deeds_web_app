"""Focused regression proof for revision propagation in the NLP sidecar.

This is a fixture-only test: it exercises the in-process analyzer and never
contacts PostgreSQL, Qdrant, Valkey, Graphify, or a model service.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import miniforge_nlp_sidecar as sidecar  # noqa: E402


def test_explicit_source_revision_beats_model_id_in_ast_and_pass_receipts() -> None:
    request = sidecar.AnalyzeRequest(
        text="def fixture_function():\n    return 1\n",
        sourceRef="fixture/source-revision.py",
        sourceRevision="sha256:fixture-source-revision",
        model_id="ornith-1.5-9b",
        language="python",
        passes=["structural"],
    )

    result = sidecar._analyze(request)
    assert result.pass_results
    assert result.pass_results[0].source_revision == request.source_revision

    units = result.pass_results[0].artifacts["ast_units"]
    assert units
    assert all(unit["source_revision"] == request.source_revision for unit in units)
    assert all(unit["canonical_authority"] is False for unit in units)


if __name__ == "__main__":
    test_explicit_source_revision_beats_model_id_in_ast_and_pass_receipts()
    print("miniforge-source-revision: PASS")
