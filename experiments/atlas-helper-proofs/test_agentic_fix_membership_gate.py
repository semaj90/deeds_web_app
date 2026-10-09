import hashlib
import unittest
from agentic_fix_membership_gate import verify_membership

class MembershipProofTests(unittest.TestCase):
    def setUp(self):
        self.source=b"def hello(): pass\n"
        self.rev="sha256:"+hashlib.sha256(self.source).hexdigest()
        self.row={"packet_key":"pk","symbol_version_id":"sv","tree_node_id":"tn",
                  "source_ref":"x.py","source_revision":self.rev,"workspace_revision":"w",
                  "start_byte":0,"end_byte":len(self.source),
                  "content_sha256":self.rev,"execution_id":"exec"}
    def check(self,rows,revision="w"):
        return verify_membership(self.source,"x.py",revision,0,len(self.source),rows)
    def test_exact_snapshot(self):
        self.assertEqual(self.check([self.row])["status"],"EXACT_SNAPSHOT_MEMBERSHIP")
        self.assertFalse(self.check([self.row])["canonical_authority"])
    def test_unknown(self):
        self.assertEqual(self.check([])["status"],"NO_EXACT_MEMBERSHIP")
    def test_ambiguous(self):
        self.assertEqual(self.check([self.row,self.row])["status"],"AMBIGUOUS_MEMBERSHIP")
    def test_stale_workspace(self):
        self.assertEqual(self.check([self.row],"later")["status"],"NO_EXACT_MEMBERSHIP")
    def test_digest_tamper(self):
        self.assertEqual(self.check([{**self.row,"content_sha256":"sha256:wrong"}])["status"],"UNQUALIFIED_MEMBERSHIP")
    def test_missing_native_symbol(self):
        self.assertEqual(self.check([{**self.row,"tree_node_id":""}])["status"],"UNQUALIFIED_MEMBERSHIP")
if __name__=="__main__":unittest.main()
