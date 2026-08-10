from __future__ import annotations
import numpy as np

def fit_kmeans(matrix: np.ndarray, n_clusters: int = 128, random_state: int = 42):
    from cuml.cluster import KMeans
    x = np.asarray(matrix, dtype=np.float32)
    model = KMeans(n_clusters=int(n_clusters), n_init="auto", random_state=int(random_state))
    labels = model.fit_predict(x)
    centers = model.cluster_centers_
    try:
        labels = labels.to_numpy()
    except AttributeError:
        labels = np.asarray(labels)
    try:
        centers = centers.to_numpy()
    except AttributeError:
        centers = np.asarray(centers)
    return np.asarray(centers, dtype=np.float32), np.asarray(labels, dtype=np.int32)
