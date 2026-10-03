from __future__ import annotations

import unittest

from parent_atlas_gepa_shadow import (
    GepaShadowConfig,
    validate_stable_tool_names,
)


class GepaShadowConfigTest(unittest.TestCase):
    def test_valid_current_api_options(self) -> None:
        config = GepaShadowConfig(
            model="ornith-local",
            api_base="http://127.0.0.1:8090/v1",
            candidate_selection_strategy="pareto",
            enable_tool_optimization=True,
        )
        config.validate()

    def test_rejects_unsupported_candidate_strategy(self) -> None:
        with self.assertRaises(ValueError):
            GepaShadowConfig(
                model="ornith-local",
                api_base="http://127.0.0.1:8090/v1",
                candidate_selection_strategy="random",
            ).validate()

    def test_tool_names_are_stable_and_non_reserved(self) -> None:
        validate_stable_tool_names(
            {
                "atlas.search.semantic": "Search the canonical semantic lane.",
                "atlas.context.compile": "Compile a revision-qualified context manifest.",
            }
        )
        with self.assertRaises(ValueError):
            validate_stable_tool_names({"finish": "Bad reserved name"})


if __name__ == "__main__":
    unittest.main()
