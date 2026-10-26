"""Focused tests for the 8095 ast-grep language guard (miniforge_nlp_sidecar._ast_grep_grammar_for).

Run from the python/ directory with the atlas-rapids-cu13 interpreter:
    python -m unittest test_ast_grep_language_dispatch -v
"""

import unittest
from unittest import mock

import miniforge_nlp_sidecar as sidecar


class AstGrepLanguageDispatchTests(unittest.TestCase):
    def test_admitted_languages_map_to_ast_grep_grammars(self):
        self.assertEqual(sidecar._ast_grep_grammar_for("typescript"), "typescript")
        self.assertEqual(sidecar._ast_grep_grammar_for("TypeScript"), "typescript")
        self.assertEqual(sidecar._ast_grep_grammar_for("ts"), "typescript")
        self.assertEqual(sidecar._ast_grep_grammar_for("javascript"), "javascript")
        self.assertEqual(sidecar._ast_grep_grammar_for("tsx"), "tsx")
        self.assertEqual(sidecar._ast_grep_grammar_for("python"), "python")

    def test_svelte_is_not_an_ast_grep_language(self):
        self.assertIsNone(sidecar._ast_grep_grammar_for("svelte"))
        self.assertIsNone(sidecar._ast_grep_grammar_for(""))
        self.assertIsNone(sidecar._ast_grep_grammar_for(None))

    def test_unsupported_language_never_reaches_sgroot(self):
        # The guard must skip before SgRoot is called. A Rust panic inside SgRoot is a BaseException
        # and would escape the `except Exception` handler, so the call itself must not happen.
        with mock.patch.object(sidecar, "AST_GREP_AVAILABLE", True), mock.patch.object(sidecar, "SgRoot") as sg:
            features = sidecar._code_features_ast_grep("<script>let x = 1;</script>", "svelte")
        sg.assert_not_called()
        self.assertEqual(features, [])

    def test_admitted_language_passes_the_mapped_grammar(self):
        with mock.patch.object(sidecar, "AST_GREP_AVAILABLE", True), mock.patch.object(sidecar, "SgRoot") as sg:
            sg.return_value.root.return_value.find_all.return_value = []
            sidecar._code_features_ast_grep("export const x: number = 1;", "TypeScript")
        sg.assert_called_once_with("export const x: number = 1;", "typescript")


if __name__ == "__main__":
    unittest.main()
