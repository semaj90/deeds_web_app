import unittest
from dataclasses import dataclass
from source_symbol_crosswalk import SourceMember, join_spans
from cpu_dag_fsm import Plan, validate
from cpu_capability_probe import probe
@dataclass
class Span:
    source_ref: str = "a.py"
    source_revision: str = "sha256:source"
    start_byte: int = 0
    end_byte: int = 10
class RemainingTests(unittest.TestCase):
    def member(self):
        return SourceMember("p","a.py","sha256:source","sha256:workspace",0,10,"sv")
    def test_exact(self):
        self.assertEqual(join_spans([Span()],[self.member()])[0]["status"],"EXACT_MEMBER_PROPOSAL")
    def test_ambiguous(self):
        self.assertEqual(join_spans([Span()],[self.member(),self.member()])[0]["status"],"AMBIGUOUS_MEMBERSHIP")
    def test_missing(self):
        self.assertEqual(join_spans([Span()],[])[0]["status"],"NO_EXACT_MEMBERSHIP")
    def test_plan(self):
        plan=Plan("r","e","p",("retrieve","synthesize"),("retrieve","synthesize"))
        self.assertEqual(validate(plan),validate(plan))
        self.assertFalse(validate(plan)["writes_performed"])
    def test_duplicate_action(self):
        with self.assertRaisesRegex(ValueError,"DUPLICATE_OR_EMPTY_ACTIONS"):
            validate(Plan("r","e","p",("retrieve","retrieve"),("retrieve",)))
    def test_owner_discovery(self):
        self.assertEqual(probe()["status"],"STATIC_OWNER_DISCOVERY_ONLY")
if __name__=="__main__": unittest.main()
