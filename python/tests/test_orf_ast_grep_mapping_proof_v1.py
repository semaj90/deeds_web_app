from __future__ import annotations

import json
import importlib.util
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/atlas"))

PROOF_SCRIPT = ROOT / "scripts/atlas/prove-orf-ast-grep-mappings-v1.py"
SPEC = importlib.util.spec_from_file_location("orf_ast_grep_mapping_proof_v1", PROOF_SCRIPT)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("PROOF_SCRIPT_IMPORT_FAILED")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
ARTIFACT = MODULE.ARTIFACT
build_mapping_proof = MODULE.build_mapping_proof


class OrfAstGrepMappingProofTest(unittest.TestCase):
    def test_each_proposal_kind_is_emitted_by_the_installed_typescript_parser(self) -> None:
        artifact = json.loads(ARTIFACT.read_text(encoding="utf-8"))

        proof = build_mapping_proof(artifact)

        observed = {item["ast_kind"]: item["feature_id"] for item in proof["mapping_results"]}
        self.assertEqual(observed["class_declaration"], "ast.class_decl")
        self.assertEqual(observed["function_declaration"], "ast.function_decl")
        self.assertEqual(observed["generator_function_declaration"], "ast.function_decl")
        self.assertEqual(observed["method_definition"], "ast.function_decl")
        self.assertEqual(observed["interface_declaration"], "ast.interface_decl")
        self.assertEqual(observed["type_alias_declaration"], "ast.type_alias")
        self.assertEqual(observed["variable_declarator"], "ast.variable_decl")
        self.assertIsNone(observed["enum_declaration"])

    def test_refuses_runtime_eligible_registry_artifacts(self) -> None:
        artifact = json.loads(ARTIFACT.read_text(encoding="utf-8"))
        artifact["runtime_eligible"] = True

        with self.assertRaisesRegex(ValueError, "REGISTRY_AUTHORITY_BOUNDARY_INVALID"):
            build_mapping_proof(artifact)

    def test_rejects_duplicate_ast_kind_ownership(self) -> None:
        artifact = json.loads(ARTIFACT.read_text(encoding="utf-8"))
        artifact["ast_grep_mappings"].append({
            "feature_id": "ast.class_decl",
            "ast_kinds": ["function_declaration"],
        })

        with self.assertRaisesRegex(ValueError, "AST_GREP_KIND_DUPLICATE_OR_INVALID"):
            build_mapping_proof(artifact)


if __name__ == "__main__":
    unittest.main()
