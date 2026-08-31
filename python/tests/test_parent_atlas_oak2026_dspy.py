import pytest

from python.parent_atlas_oak2026_dspy import (
    Oak2026ActionProposalV1,
    Oak2026KernelBindingV1,
    Oak2026ProgramBoundsV1,
    Oak2026RuntimeCountersV1,
    build_oak2026_gepa_optimizer_v1,
    canonical_json_checksum_v1,
    decode_oak2026_arguments_v1,
    validate_action_proposal_v1,
    validate_evidence_classes_v1,
    validate_evidence_refs_v1,
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


def test_evidence_classes_are_canonical_and_bounded():
    assert validate_evidence_classes_v1(
        _binding(), ["SOURCE", "ONTOLOGY", "SOURCE"]
    ) == ("ONTOLOGY", "SOURCE")
    with pytest.raises(ValueError, match="OAK2026_UNKNOWN_EVIDENCE_CLASSES"):
        validate_evidence_classes_v1(_binding(), ["SOURCE", "SECRET_INTERNAL"])


def test_evidence_refs_are_canonical_and_bounded():
    assert validate_evidence_refs_v1(
        ["e2", "e1", "e1"], allowed_evidence_refs=["e1", "e2"]
    ) == ("e1", "e2")
    with pytest.raises(ValueError, match="OAK2026_UNKNOWN_EVIDENCE_REFS"):
        validate_evidence_refs_v1(["e3"], allowed_evidence_refs=["e1", "e2"])


def test_runtime_bounds_fail_closed():
    bounds = Oak2026ProgramBoundsV1(max_tool_calls=2)
    validate_runtime_bounds_v1(bounds, Oak2026RuntimeCountersV1(tool_calls=2))
    with pytest.raises(ValueError, match="max_tool_calls"):
        validate_runtime_bounds_v1(bounds, Oak2026RuntimeCountersV1(tool_calls=3))


def test_action_arguments_must_decode_to_finite_object():
    assert decode_oak2026_arguments_v1('{"query":"abc"}') == {"query": "abc"}
    with pytest.raises(ValueError, match="OAK2026_ACTION_ARGUMENTS_MUST_BE_OBJECT"):
        decode_oak2026_arguments_v1('["not","an","object"]')
    with pytest.raises(ValueError, match="OAK2026_ACTION_ARGUMENTS_INVALID_JSON"):
        decode_oak2026_arguments_v1('{bad-json}')
    with pytest.raises(ValueError, match="OAK2026_ACTION_ARGUMENTS_NONFINITE"):
        decode_oak2026_arguments_v1('{"score":NaN}')


def test_gepa_requires_explicit_reflection_lm_before_dspy_import():
    with pytest.raises(ValueError, match="OAK2026_GEPA_REFLECTION_LM_REQUIRED"):
        build_oak2026_gepa_optimizer_v1(metric=lambda *args: 1.0, reflection_lm=None)
