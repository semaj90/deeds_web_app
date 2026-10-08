import unittest
from atlas_compute.gnn_snapshot_admission_v1 import freeze_input
def nodes():
    return [dict(packet_key=f"p{i}",source_revision="s",workspace_revision="w",
      graph_revision="g",feature_revision="f",ordinal=i,evidence_digest="e") for i in range(2)]
def edge():
    return [dict(source=0,target=1,kind="CALLS",evidence_digest="e",graph_revision="g")]
class AdmissionTests(unittest.TestCase):
    def test_frozen(self):
        a=freeze_input(nodes(),edge());b=freeze_input(list(reversed(nodes())),edge())
        self.assertEqual(a.checksum,b.checksum)
    def test_revision_mismatch(self):
        ns=nodes();ns[1]["graph_revision"]="g2"
        with self.assertRaisesRegex(ValueError,"REVISION"):freeze_input(ns,edge())
    def test_ungrounded_edge(self):
        es=edge();es[0].pop("evidence_digest")
        with self.assertRaisesRegex(ValueError,"UNGROUNDED"):freeze_input(nodes(),es)
if __name__=="__main__":unittest.main()
