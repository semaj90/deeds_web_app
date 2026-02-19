#!/usr/bin/env python3
"""
Hybrid KMeans + SOM clustering trainer for latent vectors.
This script consumes a NumPy array of latent vectors and writes centroids + SOM weights.
"""
import argparse
import json
import numpy as np
from sklearn.cluster import KMeans


def train_kmeans(latents, k=64):
    km = KMeans(n_clusters=k, n_init=10)
    km.fit(latents)
    return km.cluster_centers_, km.labels_


def make_dummy_som(weights_shape=(64, 8, 8)):
    # Dummy SOM weights - replace with proper training if required
    return np.random.randn(*weights_shape).astype('float32')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--latents', required=True, help='.npy file with latent vectors')
    parser.add_argument('--k', type=int, default=64)
    parser.add_argument('--out', default='./cluster_out')
    args = parser.parse_args()

    latents = np.load(args.latents)
    centers, labels = train_kmeans(latents, k=args.k)
    som_weights = make_dummy_som((args.k, 8, 8))

    import os
    os.makedirs(args.out, exist_ok=True)
    np.save(os.path.join(args.out, 'centroids.npy'), centers)
    np.save(os.path.join(args.out, 'labels.npy'), labels)
    np.save(os.path.join(args.out, 'som_weights.npy'), som_weights)
    with open(os.path.join(args.out, 'meta.json'), 'w') as f:
        json.dump({'k': args.k, 'n': latents.shape[0], 'dim': latents.shape[1]}, f)
    print('Saved cluster outputs to', args.out)


if __name__ == '__main__':
    main()
