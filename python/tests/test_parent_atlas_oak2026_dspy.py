import pytest

from python.parent_atlas_oak2026_dspy import (
    Oak2026ActionProposalV1,
    Oak2026KernelBindingV1,
    Oak2026PreExecutionPacketV1,
    Oak2026ProgramBoundsV1,
    Oak2026RuntimeCountersV1,
    build_oak2026_gepa_feedback_metric_v1,
    build_oak2026_gepa_optimizer_v1,
    canonical_json_checksum_v1,
    decode_oak2026_arguments_v1,
    validate_action_proposal_v1,
    validate_evidence_classes_v1,
    validate_evidence_refs_v1,
    validate_runtime_bounds_v1,
)

HEX_A = "a" * 64
HEX_B = "b" * 64


def _binding() -> Oak2026KernelBindingV1:
    return Oak2026KernelBindingV1.build(
        kernel_revision="kernel:r1",
        task_class="symbol-repair",
        schema_checksum=HEX_A,
        function_catalog_checksum=HEX_B,
        allowed_functions=["search", "resolve_symbol", "search"],
        allowed_evidence_classes=["SOURCE", "ONTOLOGY"],
    )


def test_binding_is_canonical_and_non_authoritative():
    binding = _binding()
    assert binding.task_class == "symbol-repair"
    assert binding.allowed_functions == ("resolve_symbol", "search")
    assert binding.allowed_evidence_classes == ("ONTOLOGY", "SOURCE")
    assert binding.canonical_authority is False
    assert len(binding.binding_checksum) == 64


def test_binding_requires_real_sha256_values():
    with pytest.raises(ValueError, match="schema_checksum"):
        Oak2026KernelBindingV1.build(
            kernel_revision="kernel:r1",
            task_class="symbol-repair",
            schema_checksum="schema:fake",
            function_catalog_checksum=HEX_B,
            allowed_functions=["search"],
            allowed_evidence_classes=["SOURCE"],
        )


def test_canonical_checksum_ignores_mapping_key_order():
    assert canonical_json_checksum_v1({"b": 2, "a": 1}) == canonical_json_checksum_v1({"a": 1, "b": 2})


def test_action_admission_fails_closed():
    undeclared = Oak2026ActionProposalV1.build(function_name="delete_database", arguments={}, evidence_refs=["e1"])
    with pytest.raises(ValueError, match="OAK2026_UNDECLARED_FUNCTION"):
        validate_action_proposal_v1(_binding(), undeclared, allowed_evidence_refs=["e1"])
    unknown_ref = Oak2026ActionProposalV1.build(function_name="search", arguments={"query": "symbol"}, evidence_refs=["e2"])
    with pytest.raises(ValueError, match="OAK2026_UNKNOWN_EVIDENCE_REFS"):
        validate_action_proposal_v1(_binding(), unknown_ref, allowed_evidence_refs=["e1"])


def test_evidence_classes_and_refs_are_canonical_and_bounded():
    assert validate_evidence_classes_v1(_binding(), ["SOURCE", "ONTOLOGY", "SOURCE"]) == ("ONTOLOGY", "SOURCE")
    with pytest.raises(ValueError, match="OAK2026_UNKNOWN_EVIDENCE_CLASSES"):
        validate_evidence_classes_v1(_binding(), ["SECRET_INTERNAL"])
    assert validate_evidence_refs_v1(["e2", "e1", "e1"], allowed_evidence_refs=["e1", "e2"]) == ("e1", "e2")


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


def test_pre_execution_packet_is_wire_safe_and_task_bound():
    binding = _binding()
    proposal = Oak2026ActionProposalV1.build(function_name="search", arguments={"query": "abc"}, evidence_refs=["e1"])
    packet = Oak2026PreExecutionPacketV1.build(
        binding=binding,
        program_revision="dspy:v1",
        task_class="symbol-repair",
        required_evidence_classes=["SOURCE"],
        classification_confidence=0.9,
        proposal=proposal,
        allowed_evidence_refs=["e1"],
    )
    wire = packet.to_wire()
    assert wire["schema"] == "atlas.oak2026-dspy-proposal.v1"
    assert wire["bindingChecksum"] == binding.binding_checksum
    assert wire["canonicalAuthority"] is False
    with pytest.raises(ValueError, match="OAK2026_TASK_CLASS_MISMATCH"):
        Oak2026PreExecutionPacketV1.build(
            binding=binding,
            program_revision="dspy:v1",
            task_class="other",
            required_evidence_classes=["SOURCE"],
            classification_confidence=0.9,
            proposal=proposal,
            allowed_evidence_refs=["e1"],
        )


def test_gepa_feedback_adapter_has_current_five_argument_shape():
    metric = build_oak2026_gepa_feedback_metric_v1(
        observation_factory=lambda gold, pred, trace, pred_name, pred_trace: {"pred": pred},
        score_fn=lambda observation: (0.75, f"pred={observation['pred']}"),
    )
    assert metric("g", "p", "t", "name", "pt") == {"score": 0.75, "feedback": "pred=p"}


def test_gepa_feedback_adapter_rejects_invalid_score_or_feedback():
    bad_score = build_oak2026_gepa_feedback_metric_v1(observation_factory=lambda *args: args, score_fn=lambda observation: (1.5, "bad"))
    with pytest.raises(ValueError, match="OAK2026_GEPA_SCORE_OUT_OF_RANGE"):
        bad_score(None, None, None, None, None)
    empty_feedback = build_oak2026_gepa_feedback_metric_v1(observation_factory=lambda *args: args, score_fn=lambda observation: (0.5, ""))
    with pytest.raises(ValueError, match="OAK2026_GEPA_FEEDBACK_REQUIRED"):
        empty_feedback(None, None, None, None, None)


def test_gepa_requires_explicit_reflection_lm_before_dspy_import():
    with pytest.raises(ValueError, match="OAK2026_GEPA_REFLECTION_LM_REQUIRED"):
        build_oak2026_gepa_optimizer_v1(metric=lambda *args: 1.0, reflection_lm=None)
