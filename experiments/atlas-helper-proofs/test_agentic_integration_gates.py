import unittest
from agentic_integration_gates import (lineage_handoff,ontology_handoff,retrieval_handoff,
                                      execution_handoff,proof_manifest)
class IntegrationTests(unittest.TestCase):
    def test_missing_lineage(self):
        self.assertEqual(lineage_handoff({},"NOT_RUN","UNMATCHED_AST_SPAN")["status"],"BLOCKED_LINEAGE")
    def test_snapshot_cannot_authorize(self):
        membership={"status":"EXACT_SNAPSHOT_MEMBERSHIP","packet_key":"p",
                    "symbol_version_id":"s","source_revision":"r"}
        result=lineage_handoff(membership,"EXECUTED","EXACT_SYNTAX_SPAN")
        self.assertEqual(result["status"],"SNAPSHOT_PROPOSAL")
        self.assertFalse(result["authorized"])
    def test_unknown_ontology(self):
        self.assertEqual(ontology_handoff({"status":"LIVE_ADMITTED_LINEAGE"},"",[],[])["status"],"UNKNOWN")
    def test_caller_supplied_map_not_proof(self):
        self.assertEqual(retrieval_handoff({"fake":"map"},[{"fake":"profile"}],"checksum")["status"],
                         "RETRIEVAL_CALLER_UNVERIFIED")
    def test_all_green_flags_still_block(self):
        result=execution_handoff({"status":"LIVE_ADMITTED_LINEAGE"},
                                 {"status":"LIVE_ADMITTED_ONTOLOGY"},
                                 {"status":"LIVE_VERIFIED_CONTEXT"},"receipt")
        self.assertEqual(result["reasons"],["TRANSACTIONAL_OWNER_NOT_CONNECTED"])
        self.assertFalse(result["authorized"])
    def test_proof_checksum_stable(self):
        a=proof_manifest({"lineage":{"status":"BLOCKED_LINEAGE"}})
        self.assertEqual(a,proof_manifest({"lineage":{"status":"BLOCKED_LINEAGE"}}))
        self.assertFalse(a["production_caller_proven"])
if __name__=="__main__": unittest.main()
