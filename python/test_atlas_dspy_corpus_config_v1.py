import json
from pathlib import Path
import unittest

from atlas_dspy_corpus_config_v1 import parse_json_no_duplicates, validate_dspy_corpus_source_v1


ROOT = Path(__file__).resolve().parents[1]


class DspyCorpusConfigV1Tests(unittest.TestCase):
    def test_checked_in_current_and_pinned_configs_match_owner_profile(self):
        for relative_path in (
            ".okf/docs/dspy/corpus.json",
            ".okf/docs/dspy/corpus-3.4.0.json",
        ):
            with self.subTest(path=relative_path):
                config = json.loads((ROOT / relative_path).read_text(encoding="utf-8"))
                self.assertEqual(validate_dspy_corpus_source_v1(config), [])

    def test_rejects_duplicate_json_keys(self):
        with self.assertRaisesRegex(ValueError, "JSON_DUPLICATE_KEY:schema"):
            parse_json_no_duplicates('{"schema":"first","schema":"second"}')

    def test_rejects_cross_scope_urls_and_canonical_authority(self):
        config = json.loads((ROOT / ".okf/docs/dspy/corpus.json").read_text(encoding="utf-8"))
        config["discoveryIndex"] = "https://attacker.example/current/llms.txt"
        config["canonicalAuthority"] = True
        errors = validate_dspy_corpus_source_v1(config)
        self.assertIn("URL_OUTSIDE_DECLARED_SCOPE:discoveryIndex", errors)
        self.assertIn("CANONICAL_AUTHORITY_MUST_BE_FALSE", errors)

    def test_rejects_wrong_firecrawl_endpoint(self):
        config = json.loads((ROOT / ".okf/docs/dspy/corpus.json").read_text(encoding="utf-8"))
        config["firecrawlMapEndpoint"] = "https://attacker.example/v2/map"
        self.assertIn("FIRECRAWL_ENDPOINT_INVALID", validate_dspy_corpus_source_v1(config))


if __name__ == "__main__":
    unittest.main()
