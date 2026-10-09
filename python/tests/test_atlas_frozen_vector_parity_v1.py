import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from atlas_frozen_vector_parity_v1 import compare_frozen_topk
from atlas_numpy_cpu_reference_v1 import exact_cosine_topk
h=lambda c:c*64
recipe=dict(modelArtifactSha256=h('a'),tokenizerSha256=h('b'),modelFamily='EmbeddingGemma',promptRecipeRevision='v1',pooling='mean',normalization='l2',dimension=2,metric='cosine')
class ParityTests(unittest.TestCase):
 def test_same_recipe_cpu_parity(self):
  matrix=[[1,0],[0,1]];q=[1,0];ids=['a','b']
  result=compare_frozen_topk(query=q,matrix=matrix,row_ids=ids,query_recipe=recipe,index_recipe=recipe,challenger=exact_cosine_topk(matrix,q,k=2,row_ids=ids),k=2)
  self.assertEqual(result['result'],'MATCH');self.assertEqual(result['admission'],'NOT_PERFORMED')
 def test_mismatched_recipe_rejected(self):
  with self.assertRaisesRegex(ValueError,'SPACE_MISMATCH'):
   compare_frozen_topk(query=[1,0],matrix=[[1,0]],row_ids=['a'],query_recipe=recipe,index_recipe={**recipe,'pooling':'last'},challenger=[('a',1)],k=1)
 def test_wrong_score_fails(self):
  x=compare_frozen_topk(query=[1,0],matrix=[[1,0]],row_ids=['a'],query_recipe=recipe,index_recipe=recipe,challenger=[('a',0)],k=1)
  self.assertEqual(x['result'],'MISMATCH')
 def test_duplicate_challenger_rejected(self):
  with self.assertRaisesRegex(ValueError,'CHALLENGER_RESULTS_INVALID'):
   compare_frozen_topk(query=[1,0],matrix=[[1,0],[0,1]],row_ids=['a','b'],query_recipe=recipe,index_recipe=recipe,challenger=[('a',1),('a',0)],k=2)
if __name__=='__main__':unittest.main()
