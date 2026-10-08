import unittest
from atlas_compute.dag_snapshot_state_v1 import freeze_dag,apply_transition

class DagSnapshotTests(unittest.TestCase):
    def test_order_checksum(self):
        a=freeze_dag(["b","a"],[("a","b")],revision="r")
        b=freeze_dag(["a","b"],[("a","b")],revision="r")
        self.assertEqual(a.checksum,b.checksum)
        self.assertEqual(a.topological,("a","b"))
    def test_cycle(self):
        with self.assertRaisesRegex(ValueError,"CYCLE"):
            freeze_dag(["a","b"],[("a","b"),("b","a")],revision="r")
    def test_dependency_guard(self):
        dag=freeze_dag(["a","b"],[("a","b")],revision="r")
        with self.assertRaisesRegex(ValueError,"DEPENDENCY"):
            apply_transition(dag,{},run_id="run",step_id="b",next_state="READY",sequence=1,evidence_digest="e")
        state,_=apply_transition(dag,{},run_id="run",step_id="a",next_state="READY",sequence=1,evidence_digest="e")
        state,_=apply_transition(dag,state,run_id="run",step_id="a",next_state="RUNNING",sequence=2,evidence_digest="e")
        state,_=apply_transition(dag,state,run_id="run",step_id="a",next_state="SUCCEEDED",sequence=3,evidence_digest="e")
        state,receipt=apply_transition(dag,state,run_id="run",step_id="b",next_state="READY",sequence=4,evidence_digest="e")
        self.assertEqual(state["b"],"READY")
        self.assertEqual(receipt.dag_checksum,dag.checksum)
if __name__=="__main__": unittest.main()
