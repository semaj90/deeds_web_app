#!/usr/bin/env python3
"""
test_oaklib_ontology_tuple_to_pytorch_loading_v1.py
---------------------------------------------------
Unit tests verifying:
1. `OntologyLinkedTupleV1` dict <-> frozen dataclass round-trip and strict multi-issue validation.
2. Distinction between OAKLIB `GATED` candidate (`conceptIds=()`) and `ACTIVE_VERIFIED` reviewed tuple (`conceptIds=("concept:...",)`).
3. Symbolic Arrow IPC (`pa.struct` + `pa.list_`) and NetworkX `ProjectionOrdinalMapV1` (`0..N-1` dense ordinals) determinism.
4. Numeric companion Arrow IPC `pa.memory_map` (`mmap[]`) read-only verification (`np_view.flags.writeable is False`) and 0-warning PyTorch `torch.float32` tensor loading.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
PYTHON_DIR = REPO_ROOT / "python"
SCRIPTS_ATLAS_DIR = REPO_ROOT / "scripts" / "atlas"
for p in (PYTHON_DIR, SCRIPTS_ATLAS_DIR):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from parent_atlas_ontology.adapter import OntologyLinkedTupleAdapter  # noqa: E402
from parent_atlas_ontology.models import OntologyLinkedTupleV1  # noqa: E402
from parent_atlas_ontology.validation import OntologyLinkedTupleValidationError  # noqa: E402
from prove_oaklib_ontology_tuple_to_pytorch_loading_v1 import (  # noqa: E402
    build_example_ontology_linked_tuples_dict_and_dataclass,
    run_proof,
)


class TestOaklibOntologyTupleToPyTorchLoadingV1(unittest.TestCase):
    def test_end_to_end_tuple_arrow_mmap_pytorch_proof(self) -> None:
        receipt = run_proof()
        self.assertEqual(
            receipt["schema"],
            "atlas.oaklib-ontology-tuple-to-pytorch-loading-receipt.v1",
        )
        self.assertFalse(receipt["canonicalAuthority"])
        self.assertFalse(receipt["writesPerformed"])

        # Symbolic Arrow IPC lossless round-trip
        self.assertTrue(receipt["symbolicArrowArtifact"]["losslessRoundTripVerified"])
        self.assertEqual(receipt["symbolicArrowArtifact"]["numRows"], 3)

        # Numeric Arrow mmap -> PyTorch tensor loading with 0 warnings
        self.assertTrue(receipt["numericArrowMmapArtifact"]["zeroCopyReadOnlyMmapVerified"])
        self.assertEqual(
            receipt["numericArrowMmapArtifact"]["pytorchNonWritableWarningsCount"],
            0,
        )
        self.assertEqual(receipt["pytorchLoadingSummary"]["tensorShape"], [3, 6])
        self.assertEqual(receipt["pytorchLoadingSummary"]["tensorDtype"], "torch.float32")
        self.assertTrue(receipt["pytorchLoadingSummary"]["allPoincareNormsInsideUnitBall"])

        # Verify GATED OAKLIB candidate vs ACTIVE_VERIFIED reviewed concept distinction
        tuples = receipt["alignedTuples"]
        self.assertEqual(len(tuples), 3)

        retrieval_tuple = tuples[0]
        self.assertEqual(retrieval_tuple["domainLabel"], "retrieval")
        self.assertEqual(retrieval_tuple["okfOntologyClassId"], "atlas:RetrievalDomain")
        self.assertEqual(retrieval_tuple["okfLutCode"], 6)
        self.assertEqual(retrieval_tuple["evidenceState"], "ACTIVE_VERIFIED")
        self.assertIn("concept:retrieval-authority-chain", retrieval_tuple["conceptIds"])
        self.assertEqual(retrieval_tuple["pytorchFeatureRow"][4], 1.0)  # verifiedConceptFlag == 1.0

        api_tuple = tuples[1]
        self.assertEqual(api_tuple["domainLabel"], "api")
        self.assertEqual(api_tuple["okfOntologyClassId"], "atlas:ApiDomain")
        self.assertEqual(api_tuple["okfLutCode"], 1)
        self.assertEqual(api_tuple["evidenceState"], "GATED")
        self.assertEqual(api_tuple["conceptIds"], [])
        self.assertEqual(api_tuple["pytorchFeatureRow"][4], 0.0)  # verifiedConceptFlag == 0.0

    def test_strict_validation_rejects_invalid_enum_and_confidence(self) -> None:
        raw_dicts = build_example_ontology_linked_tuples_dict_and_dataclass()
        bad_dict = dict(raw_dicts[0])
        bad_dict["confidence"] = 1.45
        bad_dict["evidenceState"] = "INVENTED_STATE"
        parsed = OntologyLinkedTupleV1.from_dict(bad_dict)

        adapter = OntologyLinkedTupleAdapter()
        with self.assertRaises(OntologyLinkedTupleValidationError) as ctx:
            adapter.validate(parsed)

        self.assertGreaterEqual(len(ctx.exception.issues), 2)


if __name__ == "__main__":
    unittest.main()
