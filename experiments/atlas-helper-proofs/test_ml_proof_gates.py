import unittest
from cpu_candidate_matrix import Candidate,build_cpu_candidate_matrix
from ml_proof_gates import c25_binary,compare_c25,validate_kmeans_readback,frozen_dataset_manifest,calibrate_unknown

class Gates(unittest.TestCase):
    def test_c25_bytes(self):
        m=build_cpu_candidate_matrix([Candidate("p","s","r","w",{"lexical_score":0.0})])
        b=c25_binary(m)
        self.assertEqual(len(bytes.fromhex(b["features_le_f32_hex"])),100)
        self.assertEqual(bytes.fromhex(b["presence_mask_hex"])[1],1)
        self.assertEqual(compare_c25(b,b)["status"],"PASS")
    def test_c25_tamper(self):
        m=build_cpu_candidate_matrix([Candidate("p","s","r","w",{})])
        b=c25_binary(m)
        other={**b,"presence_mask_hex":"ff"*25}
        self.assertEqual(compare_c25(b,other)["status"],"FAIL")
    def test_kmeans_final_assignment(self):
        self.assertEqual(validate_kmeans_readback([[0.,0.],[10.,10.]],[[0.,0.],[10.,10.]],[0,1])["status"],"PASS")
        with self.assertRaisesRegex(ValueError,"STALE_CENTROID_ASSIGNMENT"):
            validate_kmeans_readback([[0.,0.],[10.,10.]],[[0.,0.],[10.,10.]],[1,0])
    def records(self):
        return [{"query_id":f"q{i}","group_id":f"g{i}","label":str(i%2),
                 "features":[float(i)]*25,"mask":[1]*25} for i in range(5)]
    def test_dataset_stability(self):
        a=self.records()
        self.assertEqual(frozen_dataset_manifest(a,"f1","t1"),frozen_dataset_manifest(list(reversed(a)),"f1","t1"))
    def test_dataset_duplicate_rejected(self):
        records=self.records()
        with self.assertRaisesRegex(ValueError,"DUPLICATE_QUERY_ID"):
            frozen_dataset_manifest(records+[records[0]],"f1","t1")
    def test_calibration(self):
        s=[{"confidence":.9,"margin":.7,"correct":True},{"confidence":.7,"margin":.2,"correct":False}]
        r=calibrate_unknown(s,0.0)
        self.assertEqual(r["threshold"],.9)
        self.assertEqual(r["coverage"],.5)
    def test_calibration_reject(self):
        r=calibrate_unknown([{"confidence":.8,"margin":.1,"correct":False}],0.0)
        self.assertEqual(r["status"],"NO_SAFE_THRESHOLD")
if __name__=="__main__":unittest.main()
