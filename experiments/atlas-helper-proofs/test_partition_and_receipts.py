import json
import tempfile
import unittest
from pathlib import Path
from semantic_partition_oracle import compare_partition_recall
from immutable_attempt_receipt import AttemptReceipt, receipt_payload, write_once, validate_readback

class PartitionReceiptTests(unittest.TestCase):
    def sample(self):
        return [[0.]*768,[1.]*768,[2.]*768],["p0","p1","p2"],[0,1,1],[[0.]*768,[1.5]*768]
    def test_exact_baseline(self):
        v,keys,a,c=self.sample()
        result=compare_partition_recall(v,keys,a,[0.]*768,c,1,2)
        self.assertEqual(result["full_exact_topk"],["p0","p1"])
        self.assertEqual(result["partition_recall_at_k"],.5)
        self.assertEqual(result["gpu_cuvs_parity"],"NOT_RUN")
    def test_graph_expansion(self):
        v,keys,a,c=self.sample()
        result=compare_partition_recall(v,keys,a,[0.]*768,c,1,2,[("p0","p1","CALLS")])
        self.assertEqual(result["expanded_recall_at_k"],1.)
    def test_unqualified_edge(self):
        v,keys,a,c=self.sample()
        with self.assertRaisesRegex(ValueError,"UNQUALIFIED_GRAPH_EDGE"):
            compare_partition_recall(v,keys,a,[0.]*768,c,1,2,[("p0","invented","CALLS")])
    def test_terminal_supersession_and_exclusive_create(self):
        r=AttemptReceipt("request_1","attempt_1","plan_1","SUPERSEDED","source_revision_changed","attempt_2","RUNNING")
        self.assertFalse(receipt_payload(r)["canonical_authority"])
        with tempfile.TemporaryDirectory() as folder:
            path=write_once(Path(folder),r)
            self.assertEqual(validate_readback(path)["outcome"],"SUPERSEDED")
            with self.assertRaises(FileExistsError):
                write_once(Path(folder),r)
    def test_prediction_never_authorizes(self):
        r=AttemptReceipt("request_1","attempt_1","plan_1","FAILED","bad_evidence",None,"AUTHORIZED")
        self.assertFalse(receipt_payload(r)["canonical_authority"])
    def test_missing_supersession_target(self):
        with self.assertRaisesRegex(ValueError,"INVALID_SUPERSESSION"):
            receipt_payload(AttemptReceipt("r","a","p","SUPERSEDED","stale"))
    def test_digest_tampering(self):
        r=AttemptReceipt("r","a","p","FAILED","timeout")
        with tempfile.TemporaryDirectory() as folder:
            path=write_once(Path(folder),r)
            payload=json.loads(path.read_text())
            payload["reason"]="new"
            path.write_text(json.dumps(payload))
            with self.assertRaisesRegex(ValueError,"RECEIPT_DIGEST_MISMATCH"):
                validate_readback(path)
if __name__=="__main__": unittest.main()
