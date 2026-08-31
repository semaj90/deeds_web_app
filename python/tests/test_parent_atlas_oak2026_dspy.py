from python.parent_atlas_oak2026_dspy import (
    OAK_2026_DSPY_CONTRACT_REVISION,
    build_kernel_function_proposal_v1,
    stable_checksum_v1,
    validate_evidence_subset_v1,
    validate_function_allowlist_v1,
)


def test_stable_checksum_v1_is_order_independent_for_mappings():
    assert stable_checksum_v1({"b": 2, "a": 1}) == stable_checksum_v1({"a": 1, "b": 2})


def test_kernel_function_proposal_v1_is_allowlisted_and_checksummed():
    proposal = build_kernel_function_proposal_v1(
        kernel_revision="kernel:v1",
        program_revision="program:v1",
        query_id="query-1",
        function_id="fn:repair",
        bound_arguments={"symbolVersionId": "sv-1"},
        evidence_refs=["evidence:1"],
        allowed_functions=["fn:repair", "fn:inspect"],
        allowed_evidence_refs=["evidence:1", "evidence:2"],
        confidence=0.8,
    )
    assert proposal.contract_revision == OAK_2026_DSPY_CONTRACT_REVISION
    assert proposal.canonical_authority is False
    assert proposal.proposal_checksum == stable_checksum_v1(proposal.unsigned_payload())


def test_function_allowlist_rejects_unknown_function():
    try:
        validate_function_allowlist_v1("fn:other", ["fn:repair"])
    except ValueError as exc:
        assert "FUNCTION_NOT_ALLOWED" in str(exc)
    else:
        raise AssertionError("expected function allowlist rejection")


def test_evidence_subset_rejects_unknown_reference():
    try:
        validate_evidence_subset_v1(["evidence:other"], ["evidence:1"])
    except ValueError as exc:
        assert "UNKNOWN_EVIDENCE_REFS" in str(exc)
    else:
        raise AssertionError("expected evidence subset rejection")
