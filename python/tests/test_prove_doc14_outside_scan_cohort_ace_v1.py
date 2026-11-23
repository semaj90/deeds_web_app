from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "prove_doc14", REPO_ROOT / "scripts" / "atlas" / "prove-doc14-outside-scan-cohort-ace-v1.py"
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ProveDoc14OutsideScanCohortAceTests(unittest.TestCase):
    def test_hybrid_replay_admits_outside_scan_cohort_with_spans(self) -> None:
        sha_a = "sha256:" + "a" * 64
        sha_b = "sha256:" + "b" * 64
        cohort = [
            {
                "sourceRef": "sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts",
                "sourceSha256": sha_a,
                "repairPriorityScore": 8.77,
                "observedRelationTuples": [
                    {
                        "subjectId": "docs/architecture/_cuda_rtx_toc.md",
                        "sourceRevision": sha_b,
                        "evidenceSpan": {"startByte": 100, "endByte": 161},
                    }
                ],
            },
            {
                "sourceRef": "sveltekit-frontend/package.json",
                "sourceSha256": sha_b,
                "repairPriorityScore": 9.1,
                "observedRelationTuples": [
                    {
                        "subjectId": "docs/README.md",
                        "sourceRevision": sha_a,
                        "evidenceSpan": {"startByte": 10, "endByte": 40},
                    }
                ],
            },
        ]
        pg_matches = {
            "sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts": {
                "sourceRevision": sha_a,
            }
        }
        res = MODULE.evaluate_cohort_hybrid_vs_single_lane(cohort, pg_matches)
        self.assertGreaterEqual(res["admittedCount"], 2)
        self.assertIn("sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts", res["hybridTop5"])


if __name__ == "__main__":
    unittest.main()
