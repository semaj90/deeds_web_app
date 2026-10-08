import tempfile
import unittest
from pathlib import Path
from validate_cpu_pipeline import ROOT, validate
from source_symbol_crosswalk import SourceMember, join_spans
from chunker_adapter import Span

class ProofContracts(unittest.TestCase):
    def test_exact_membership_does_not_create_authority(self):
        span = Span("src/x.py","sha256:src","python","function_definition",0,4,1,1,"sha256:chunk","chunk")
        member = SourceMember("pk","src/x.py","sha256:src","sha256:ws",0,4,"sv")
        result = join_spans([span],[member])[0]
        self.assertEqual(result["status"],"EXACT_MEMBER_PROPOSAL")
        self.assertEqual(result["member"].packet_key,"pk")
    def test_wrong_revision_fails_closed(self):
        span=Span("src/x.py","sha256:other","python","function_definition",0,4,1,1,"sha256:chunk","chunk")
        member=SourceMember("pk","src/x.py","sha256:src","sha256:ws",0,4,"sv")
        self.assertEqual(join_spans([span],[member])[0]["status"],"NO_EXACT_MEMBERSHIP")
    def test_report_outside_tmp_rejected(self):
        with self.assertRaisesRegex(ValueError,"REPORT_MUST_BE_UNDER_EXPERIMENT_TMP"):
            validate(Path(tempfile.gettempdir())/"should-not-write.json")
if __name__=="__main__":unittest.main()
