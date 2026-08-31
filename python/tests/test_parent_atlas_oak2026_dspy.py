import pytest

from python.parent_atlas_oak2026_dspy import (
    Oak2026ActionProposalV1,
    Oak2026KernelBindingV1,
    Oak2026ProgramBoundsV1,
    Oak2026RuntimeCountersV1,
    canonical_json_checksum_v1,
    decode_oak2026_arguments_v1,
    validate_action_proposal_v1,
    validate_runtime_bounds_v1,
)


def _binding() -> Oak2026KernelBindingV1:
    return Oak2026KernelBindingV1.build(
        kernel_revision="kernel:r1",
        schema_checksum="schema:abc",
        function_catalog_checksum="functions:def",
        allowed_functions=["search", "resolve_symbol", "search"],
        allowed_evidence_classes=["SOURCE", "ONTOLOGY"],
    )


def test_binding_is_canonical_and_non_authoritative():
    binding = _binding()
    assert binding.allowed_functions == ("resolve_symbol", "search")
    assert binding.allowed_evidence_classes == ("ONTOLOGY", "SOURCE")
    assert binding.canonical_authority is False
    assert len(binding.binding_checksum) == 64


def test_canonical_checksum_ignores_mapping_key_order():
    left = canonical_json_checksum_v1({"b": 2, "a": 1})
    right = canonical_json_checksum_v1({"a": 1, "b": 2})
    assert left == right


def test_undeclared_function_fails_closed():
    proposal = Oak2026ActionProposalV1.build(
        function_name="delete_database",
        arguments={},
        evidence_refs=["e1"],
    )
    with pytest.raises(ValueError, match="OAK2026_UNDECLARED_FUNCTION"):
        validate_action_proposal_v1(
            _binding(),
            proposal,
            allowed_evidence_refs=["e1"],
        )


def test_unknown_evidence_ref_fails_closed():
    proposal = Oak2026ActionProposalV1.build(
        function_name="search",
        arguments={"query": "symbol"},
        evidence_refs=["e2"],
    )
    with pytest.raises(ValueError, match="OAK2026_UNKNOWN_EVIDENCE_REFS"):
        validate_action_proposal_v1(
            _binding(),
            proposal,
            allowed_evidence_refs=["e1"],
        )


def test_runtime_bounds_fail_closed():
    bounds = Oak2026ProgramBoundsV1(max_tool_calls=2)
    validate_runtime_bounds_v1(bounds, Oak2026RuntimeCountersV1(tool_calls=2))
    with pytest.raises(ValueError, match="max_tool_calls"):
        validate_runtime_bounds_v1(bounds, Oak2026RuntimeCountersV1(tool_calls=3))


def test_action_arguments_must_decode_to_object():
    assert decode_oak2026_arguments_v1('{"query":"abc"}') == {"query": "abc"}
    with pytest.raises(ValueError, match="OAK2026_ACTION_ARGUMENTS_MUST_BE_OBJECT"):
        decode_oak2026_arguments_v1('["not","an","object"]')
