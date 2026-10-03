# Native GPU Numerical Parity

Fourteen deterministic operation fixtures passed against independent JavaScript scalar CPU oracles on the explicit out-of-tree CUDA/LibTorch addon. Eleven operations also recorded execution inside CUDA branches. All observed errors were below the per-operation tolerance (maximum: approximately `1.2e-7`).

| Operation group | Result |
| --- | --- |
| Batch cosine, softmax, top-k, attention, reward, PageRank | CUDA execution observed; scalar-oracle parity passed |
| K-means, PCA, autoencoder encode/decode, SOM | CUDA execution observed; fixture parity passed |
| Graph similarity / half wrapper | CPU implementation; CPU-oracle parity passed, no CUDA kernel claim |
| Case embedding | CPU implementation; LibTorch-path scalar parity passed |

The JSON receipt lists exact maximum errors and tolerances. The fixtures are intentionally small: PageRank has no dangling nodes, top-k has no cutoff tie, and SOM uses one sample/one neuron/one iteration. This is not workload-scale parity, canonical semantic authority, or permission to promote embeddings. No persistent stores were written and no model inference ran.
