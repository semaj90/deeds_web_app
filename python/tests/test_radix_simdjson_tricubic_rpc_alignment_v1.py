import unittest
from scripts.atlas.prove_radix_simdjson_tricubic_rpc_alignment_v1 import (
    run_radix_simdjson_tricubic_rpc_alignment,
)


class TestRadixSimdjsonTricubicRpcAlignmentV1(unittest.TestCase):
    def test_full_alignment_proof(self) -> None:
        report = run_radix_simdjson_tricubic_rpc_alignment()
        self.assertEqual(
            report["schema"],
            "atlas.radix-simdjson-tricubic-rpc-alignment-receipt.v1",
        )
        self.assertFalse(report["canonicalAuthority"])
        self.assertFalse(report["writesPerformed"])

        radix = report["radixSort64BitProof"]
        self.assertEqual(radix["candidateCount"], 149)
        self.assertTrue(radix["matchesReferenceSortExact"])

        simd = report["simdjsonTypedEvidenceAlignment"]
        self.assertEqual(simd["totalNdjsonRecordsValidated"], 149)
        self.assertTrue(simd["featureLabelDescriptiveIsolated"])

        interp = report["tricubicVsTrilinearPyTorchAlignment"]
        self.assertEqual(interp["tricubicSamplesPerCoordinate"], 64)
        self.assertEqual(interp["trilinearSamplesPerCoordinate"], 8)
        self.assertEqual(interp["outputShape"], [149, 4])
        self.assertTrue(interp["finiteOutputs"])

        rpc = report["rpcPacketAssemblerValidatorMaterializer"]
        self.assertEqual(rpc["totalPacketsAssembled"], 149)
        self.assertTrue(rpc["allUuidV7Valid"])
        self.assertTrue(rpc["allProposalOnly"])

        pg = report["postgres18AioTempStagingRehearsal"]
        self.assertTrue(pg["rehearsedAndRolledBack"])
        self.assertFalse(pg["durableWritesPerformed"])
        self.assertEqual(pg["ioMethod"], "worker")
        self.assertEqual(pg["effectiveIoConcurrency"], "16")


if __name__ == "__main__":
    unittest.main()
