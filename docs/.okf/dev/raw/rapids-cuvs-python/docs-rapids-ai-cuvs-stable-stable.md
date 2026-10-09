![country_code](https://www.nvidia.com/content/dam/1x1-00000000.png)

For AI agents: a documentation index is available at the root level at /llms.txt. Append /llms.txt to any URL for a page-level index, or .md for the markdown version of any page.

NVIDIA cuVS is a GPU-accelerated library for vector search on the GPU. Vector search includes nearest neighbors, vector compression and clustering. It provides both core building blocks for constructing new algorithms and end-to-end algorithms that can be used directly or through a growing list of [integrations](https://docs.nvidia.com/cuvs/getting-started/integrations).

![NVIDIA cuVS accelerates preprocessing, nearest-neighbor search, and clustering on the GPU.](https://fdr-prod-docs-files-public.s3.us-east-1.amazonaws.com/nvidia-cuvs.docs.buildwithfern.com/ae77b46ca3e781feac2bd94ad085e9fdbc3b6c5a45c7dd1bf18d4813cc106e27/assets/images/cuvs-overview.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIA6KXJSKKNFOCF7G4B%2F20261008%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20261008T232329Z&X-Amz-Expires=604800&X-Amz-Signature=a8182549524a140d5c432718c286de83c10d05c67845d2b4b1d6c6ea84c66f5f&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)

## Useful Resources

- [Example Notebooks](https://github.com/nvidia/cuvs/tree/HEAD/notebooks): Example notebooks
- [Code Examples](https://github.com/nvidia/cuvs/tree/HEAD/examples): Self-contained code examples
- [RAPIDS Community](https://rapids.ai/community.html): Get help, contribute, and collaborate.
- [GitHub repository](https://github.com/nvidia/cuvs): Download the NVIDIA cuVS source code.
- [Issue tracker](https://github.com/nvidia/cuvs/issues): Report issues or request features.

## What is NVIDIA cuVS?

NVIDIA cuVS contains state-of-the-art implementations of several algorithms for running approximate and exact nearest neighbors, vector compression, and clustering on the GPU. It can be used directly or through the various databases and other libraries that have integrated it. The primary goal of NVIDIA cuVS is to simplify the use of GPUs for vector similarity search, preprocessing, and clustering. For a broader introduction, start with the [introductory materials](https://docs.nvidia.com/cuvs/getting-started/introduction) in Getting Started.

Vector search is an information retrieval method for finding semantically similar items in embedding spaces, especially when working with multimedia embeddings created from unstructured data. It is also used in _data mining and machine learning_ tasks and comprises an important step in many _clustering_ and _visualization_ algorithms like [UMAP](https://arxiv.org/abs/2008.00325), [t-SNE](https://lvdmaaten.github.io/tsne/), K-means, and [HDBSCAN](https://hdbscan.readthedocs.io/en/latest/how_hdbscan_works.html).

Finally, faster vector search enables interactions between dense vectors and graphs. Converting a pile of dense vectors into nearest neighbors graphs unlocks the entire world of graph analysis algorithms, such as those found in [GraphBLAS](https://graphblas.org/) and [cuGraph](https://github.com/rapidsai/cugraph).

## Where is NVIDIA cuVS used?

These are common places where vector search appears. For more examples, see [Use-cases](https://docs.nvidia.com/cuvs/getting-started/use-cases) and [Integrations](https://docs.nvidia.com/cuvs/getting-started/integrations).

### Semantic search

- Generative AI: RAG & Agentic AI
- Recommender systems
- Computer vision
- Image search
- Text search
- Audio search
- Molecular search
- Model Training: LLMs & Transformers

### Data mining

- Clustering algorithms
- Visualization algorithms
- Sampling algorithms
- Class balancing
- Ensemble methods
- k-NN graph construction

## Why NVIDIA cuVS?

There are several benefits to using NVIDIA cuVS and GPUs for vector search, including

1. Fast index build
2. Latency critical and high throughput search
3. [Parameter tuning](https://docs.nvidia.com/cuvs/getting-started/introduction/tuning-indexes)
4. Cost savings
5. Interoperability (build on GPU, deploy on CPU)
6. Multiple language support
7. Building blocks for composing new or accelerating existing algorithms

In addition to the items above, NVIDIA cuVS shoulders the responsibility of keeping non-trivial accelerated code up to date as new NVIDIA architectures and CUDA versions are released. This provides a delightful development experience, guaranteeing that any libraries, databases, or applications built on top of it will always be receiving the best performance and scale.

## NVIDIA cuVS Technology Stack

NVIDIA cuVS is built on top of the [RAPIDS RAFT](https://github.com/rapidsai/raft) library of high performance machine learning primitives and provides all the necessary routines for vector search and clustering on the GPU.

![NVIDIA cuVS is built on top of low-level CUDA libraries and provides many important routines that enable vector search and clustering on the GPU](https://fdr-prod-docs-files-public.s3.us-east-1.amazonaws.com/nvidia-cuvs.docs.buildwithfern.com/602d7ec97d73d9c0f89a6e9095b064e96738176ad1871f19410159f0e77dea74/assets/images/tech_stack.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIA6KXJSKKNFOCF7G4B%2F20261008%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20261008T232329Z&X-Amz-Expires=604800&X-Amz-Signature=a71f5378391c48d0481c91c7e73b4a5d9f47ad721bf4fc807cf8dfdee25b16f0&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)

Ask AI

Assistant

Responses are generated using AI and may contain mistakes.

Hi, I'm an AI assistant with access to documentation and other content.

Tip: You can toggle this pane with

`⌘`

+

`/`