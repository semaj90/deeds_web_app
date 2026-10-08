import hashlib
import unittest
from agentic_fix_pipeline import propose_repair
from agentic_fix_preflight import validate_request,discover
class FixPipelineTests(unittest.TestCase):
    def test_proposal_only(self):
        src=b"def run():\n    pass\n"
        rev="sha256:"+hashlib.sha256(src).hexdigest()
        x=propose_repair("TypeError: missing argument",src,"src/m.py",rev)
        self.assertFalse(x["can_mutate"])
        self.assertEqual(x["stages"][0],"diagnostic")
        self.assertEqual(x["stages"][-1],"terminal_receipt")
        self.assertEqual(x["symbol_membership"],"UNRESOLVED")
    def test_stale_source_rejected(self):
        with self.assertRaisesRegex(ValueError,"STALE_SOURCE_REVISION"):
            propose_repair("error",b"abc","a.py","sha256:bad")
    def test_invalid_request(self):
        with self.assertRaisesRegex(ValueError,"INVALID_DIAGNOSTIC_SCHEMA"):
            validate_request({"unexpected":"field"})
    def test_nonmutating_discovery(self):
        x=discover("../../")
        self.assertFalse(x["ready_for_patch"])
        self.assertFalse(x["production_writes"])
if __name__=="__main__":unittest.main()
