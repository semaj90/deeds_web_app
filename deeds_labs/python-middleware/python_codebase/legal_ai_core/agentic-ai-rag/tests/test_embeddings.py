import numpy as np

def test_dummy_embedding_shape():
    emb = np.zeros((768,), dtype=np.float32)
    assert emb.shape == (768,)
