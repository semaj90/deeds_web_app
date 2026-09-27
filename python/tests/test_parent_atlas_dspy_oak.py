from __future__ import annotations

import unittest

from python.parent_atlas_dspy_oak import (
    OakBoundProgramOutputV1,
    OakBoundProgramRequestV1,
    OakFunctionViewV1,
    derive_oak_gepa_feedback_v1,
    serialize_oak_program_context_v1,
    validate_oak_bound_output_v1,
)


class OakBoundDspyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.request = OakBoundProgramRequestV1(
            task_class="typescript_repair",
            kernel_revision="kernel:symbol-repair:v1",
            catalog_revision="catalog:symbol-repair:v1",
            context_manifest_checksum="sha256:abc",
            allowed_evidence_refs=("evidence:diag", "evidence:source"),
            functions=(
                OakFunctionViewV1(
                    function_id="find_evidence_for_failed_typecheck",
                    kernel_revision="kernel:symbol-repair:v1",
                    mutation_policy="READ_ONLY",
                    required_evidence_kinds=("DIAGNOSTIC",),
                    allowed_evidence_classes=("TYPECHECK", "SOURCE"),
                ),
                OakFunctionViewV1(
                    function_id="propose_symbol_repair",
                    kernel_revision="kernel:symbol-repair:v1",
                    mutation_policy="PROPOSE_ONLY",
                    allowed_evidence_classes=("TYPECHECK", "SOURCE"),
                ),
            ),
            failure="TS2345",
            constraints="proposal only",
        )

    def test_declared_functions_and_evidence_are_accepted(self) -> None:
        out = validate_oak_bound_output_v1(
            self.request,
            OakBoundProgramOutputV1(
                selected_function_ids=(
                    "find_evidence_for_failed_typecheck",
                    "propose_symbol_repair",
                ),
                cited_evidence_refs=("evidence:diag", "evidence:source"),
                diagnosis="argument type mismatch",
                patch_plan="change the narrow callsite",
                validation_plan="run focused typecheck",
            ),
        )
        self.assertEqual(len(out.selected_function_ids), 2)

    def test_undeclared_function_fails_closed(self) -> None:
        with self.assertRaisesRegex(ValueError, "OAK_UNDECLARED_FUNCTION"):
            validate_oak_bound_output_v1(
                self.request,
                OakBoundProgramOutputV1(
                    selected_function_ids=("shell_exec_arbitrary",),
                    cited_evidence_refs=("evidence:diag",),
                    diagnosis="x",
                    patch_plan="x",
                    validation_plan="x",
                ),
            )

    def test_undeclared_evidence_fails_closed(self) -> None:
        with self.assertRaisesRegex(ValueError, "OAK_UNDECLARED_EVIDENCE"):
            validate_oak_bound_output_v1(
                self.request,
                OakBoundProgramOutputV1(
                    selected_function_ids=("propose_symbol_repair",),
                    cited_evidence_refs=("evidence:invented",),
                    diagnosis="x",
                    patch_plan="x",
                    validation_plan="x",
                ),
            )

    def test_program_failure_routes_to_gepa(self) -> None:
        result = derive_oak_gepa_feedback_v1(
            base_score=0.8,
            failure_class="AGENT_TOOL_SELECTION_ERROR",
            exact_evidence_coverage=0.75,
            validation_passed=True,
        )
        self.assertEqual(result.optimization_scope, "DSPY_GEPA")
        self.assertAlmostEqual(result.score, 0.6)

    def test_kernel_failure_routes_to_oak(self) -> None:
        result = derive_oak_gepa_feedback_v1(
            base_score=0.8,
            failure_class="FUNCTION_MISSING",
            exact_evidence_coverage=1.0,
            validation_passed=True,
        )
        self.assertEqual(result.optimization_scope, "OAK")
        self.assertIn("must not learn a prompt workaround", result.feedback)

    def test_validator_failure_is_hard_zero(self) -> None:
        result = derive_oak_gepa_feedback_v1(
            base_score=0.9,
            failure_class="VALIDATOR_FAILURE",
            exact_evidence_coverage=1.0,
            validation_passed=False,
        )
        self.assertTrue(result.hard_fail)
        self.assertEqual(result.score, 0.0)

    def test_serialization_is_deterministic(self) -> None:
        one = serialize_oak_program_context_v1(self.request)
        two = serialize_oak_program_context_v1(self.request)
        self.assertEqual(one, two)
        self.assertIn('"functionId":"find_evidence_for_failed_typecheck"', one)


if __name__ == "__main__":
    unittest.main()
