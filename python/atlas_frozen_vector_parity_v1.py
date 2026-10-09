"""CPU exact ranking parity only. No database/model/GPU calls and no admission."""
import hashlib
import json
import numpy as np
from atlas_numpy_cpu_reference_v1 import exact_cosine_topk
FIELDS=('modelArtifactSha256','tokenizerSha256','modelFamily','promptRecipeRevision','pooling','normalization','dimension','metric')
def _space(meta):
    if not isinstance(meta,dict) or any(not meta.get(k) for k in FIELDS):
        raise ValueError('EMBEDDING_RECIPE_INCOMPLETE')
    if meta['metric']!='cosine' or not isinstance(meta['dimension'],int) or meta['dimension']<1:
        raise ValueError('EMBEDDING_RECIPE_UNSUPPORTED')
    return hashlib.sha256(json.dumps({k:meta[k] for k in FIELDS},sort_keys=True,separators=(',',':')).encode()).hexdigest()
def compare_frozen_topk(*,query,matrix,row_ids,query_recipe,index_recipe,challenger,k=10,atol=1e-5):
    if _space(query_recipe)!=_space(index_recipe):raise ValueError('EMBEDDING_SPACE_MISMATCH')
    arr=np.asarray(matrix,dtype=np.float32)
    if arr.ndim!=2 or arr.shape[1]!=index_recipe['dimension']:raise ValueError('EMBEDDING_DIMENSION_MISMATCH')
    expected=exact_cosine_topk(arr,query,k=k,row_ids=row_ids)
    if len(challenger)!=len(expected) or len({rid for rid,_ in challenger})!=len(challenger):
        raise ValueError('CHALLENGER_RESULTS_INVALID')
    passed=all(rid==refid and np.isfinite(score) and abs(float(score)-refscore)<=atol
        for (rid,score),(refid,refscore) in zip(challenger,expected))
    return dict(schema='atlas.frozen-vector-cpu-parity.v1',embeddingSpaceSha256=_space(query_recipe),
        result='MATCH' if passed else 'MISMATCH',topK=k,expectedRowIds=[r for r,_ in expected],
        candidateRowIds=[r for r,_ in challenger],admission='NOT_PERFORMED')
