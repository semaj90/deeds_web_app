import unittest
from dataclasses import dataclass
from ast_graph_alignment import AstObservation,align_exact,explicit_graph

@dataclass(frozen=True)
class Chunk:
    source_ref: str="src/a.py"
    source_revision: str="sha256:aaa"
    start_byte: int=2
    end_byte: int=7
    content_hash: str="sha256:bbb"
class AlignTests(unittest.TestCase):
    def observation(self):
        c=Chunk()
        return AstObservation(c.source_ref,c.source_revision,"python","function_definition",
                              c.start_byte,c.end_byte,c.content_hash)
    def test_exact(self):
        self.assertEqual(align_exact([Chunk()],[self.observation()])[0]["status"],"EXACT_SYNTAX_SPAN")
    def test_revision_rejected(self):
        c=Chunk(source_revision="sha256:changed")
        self.assertEqual(align_exact([c],[self.observation()])[0]["status"],"UNMATCHED_AST_SPAN")
    def test_ambiguous(self):
        o=self.observation()
        self.assertEqual(align_exact([Chunk()],[o,o])[0]["status"],"AMBIGUOUS_AST_SPAN")
    def test_graph(self):
        try:
            result=explicit_graph(["A","B","C"],[("A","C"),("B","C")])
        except RuntimeError as exc:
            if str(exc)=="NETWORKX_NOT_INSTALLED": self.skipTest(str(exc))
            raise
        self.assertEqual(result["order"],("A","B","C"))
        self.assertFalse(result["canonical_authority"])
    def test_graph_cycle(self):
        try:
            with self.assertRaisesRegex(ValueError,"GRAPH_CYCLE"):
                explicit_graph(["A","B"],[("A","B"),("B","A")])
        except RuntimeError as exc:
            if str(exc)=="NETWORKX_NOT_INSTALLED": self.skipTest(str(exc))
            else: raise
if __name__=="__main__": unittest.main()
