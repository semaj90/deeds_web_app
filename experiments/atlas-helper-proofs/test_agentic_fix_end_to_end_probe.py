import hashlib
import unittest
from agentic_fix_end_to_end_probe import probe
class E2EProbeTests(unittest.TestCase):
    def base(self, records=None):
        return probe(b"def a():\n    return 1\n","src/a.py","python","w",
                     "TypeError: graph node",records or [])
    def test_no_parser_does_not_mint_membership(self):
        r=self.base()
        self.assertEqual(r["parser_state"],"NOT_RUN")
        self.assertEqual(r["matched"],[])
        self.assertFalse(r["can_mutate"])
    def test_parser_mode_rejected(self):
        with self.assertRaisesRegex(ValueError,"INVALID_PARSER_MODE"):
            probe(b"abc","a.py","python","w","error",[],"invented")
    def test_source_checksum(self):
        data=b"def a():\n    return 1\n"
        self.assertEqual(self.base()["source_revision"],
                         "sha256:"+hashlib.sha256(data).hexdigest())
    def test_identity_not_promoted_even_if_records_exist(self):
        r=self.base([{"packet_key":"invented"}])
        self.assertEqual(r["observed_count"],0)
        self.assertFalse(r["canonical_authority"])
if __name__=="__main__":unittest.main()
