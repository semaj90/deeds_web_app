import unittest
from hybrid_ablation_cpu import graph_activation,temporal_signal,rank,ablate
from hybrid_context_cpu import select
from hybrid_cache_key_cpu import key
class HybridTests(unittest.TestCase):
    def test_graph_spread(self):
        self.assertEqual(graph_activation({"a":1},[("a","b","CALLS")],1)["b"],.5)
    def test_timezone_required(self):
        with self.assertRaisesRegex(ValueError,"TIMEZONE_REQUIRED"):
            temporal_signal("2026-01-01T00:00:00","2026-01-01T00:00:00Z",3600)
    def test_temporal_peak(self):
        self.assertEqual(temporal_signal("2026-01-01T00:00:00Z","2026-01-01T00:00:00Z",3600),1.)
    def test_ablation(self):
        x=ablate(["a","b"],{"a"},{"semantic":{"a":1},"graph":{"b":1}},
                 {"semantic":1,"graph":.1},1)
        self.assertEqual(x["baseline"]["top_k"],["a"])
    def test_budget(self):
        rows=[{"packet_key":"a","session":"s1","tokens":3,"score":2},
              {"packet_key":"b","session":"s2","tokens":3,"score":1}]
        self.assertEqual(select(rows,4)["selected_packet_keys"],["a"])
    def test_cache_dimensions(self):
        fields=("query_text","embedding_digest","namespace","session_id","filters",
                "query_time","workspace_revision","source_revision","graph_revision",
                "representation_revision","feature_revision","model_revision","top_k","context_manifest_checksum")
        q={f:"v" for f in fields}
        self.assertNotEqual(key(q),key({**q,"graph_revision":"changed"}))
        with self.assertRaisesRegex(ValueError,"MISSING_CACHE_DIMENSION"):
            key({})
if __name__=="__main__":unittest.main()
