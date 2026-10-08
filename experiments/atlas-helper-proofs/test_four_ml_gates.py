import unittest
from gate_c25_float32 import compare
from gate_kmeans_readback import verify
from gate_dataset_manifest import freeze
from gate_unknown_calibration import calibrate,predict

class GateTests(unittest.TestCase):
    def test_c25(self):
        record={"candidate_packet_keys":["p"],"candidate_count":1,"feature_count":25,"presence_mask":[0]*25,"candidate_features":[0.0]*25}
        self.assertEqual(compare(record,dict(record))["status"],"PARITY_PASS")
        changed={**record,"presence_mask":[1]+[0]*24}
        with self.assertRaisesRegex(ValueError,"C25_MISMATCH"):
            compare(record,changed)
    def test_signed_zero(self):
        record={"candidate_packet_keys":["p"],"candidate_count":1,"feature_count":25,"presence_mask":[1]*25,"candidate_features":[0.0]*25}
        changed={**record,"candidate_features":[-0.0]+[0.0]*24}
        with self.assertRaisesRegex(ValueError,"C25_FLOAT32_MISMATCH"):
            compare(record,changed)
    def test_kmeans_stale(self):
        rows=[[0.,0.],[10.,10.],[11.,11.]]
        centers=[[0.,0.],[10.5,10.5]]
        self.assertEqual(verify(rows,{"centers":centers,"labels":[0,1,1]})["status"],"READBACK_PASS")
        with self.assertRaisesRegex(ValueError,"KMEANS_STALE_ASSIGNMENT"):
            verify(rows,{"centers":centers,"labels":[0,0,1]})
    def test_dataset_disjoint(self):
        records=[{"row_id":str(i),"query_group":f"g{i}","label":"x","source_revision":"s","features":[0.],"presence_mask":[1]} for i in range(6)]
        m=freeze(records,{"x":0},"label-v1","tax-v1")
        self.assertEqual(len(set(m["train"])|set(m["calibration"])|set(m["test"])),6)
        self.assertFalse(set(m["train"]) & set(m["test"]))
        self.assertEqual(m,freeze(list(reversed(records)),{"x":0},"label-v1","tax-v1"))
    def test_calibration(self):
        cal=calibrate([(0.9,"db","db"),(.4,"graph","db"),(.8,"db","db")],0.)
        self.assertEqual(predict(.2,"db",cal)["label"],"UNKNOWN")
        self.assertEqual(predict(.9,"db",cal)["label"],"db")
if __name__=="__main__":unittest.main()
