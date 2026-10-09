![country_code](https://www.nvidia.com/content/dam/1x1-00000000.png)

[Skip to main content](https://docs.nvidia.com/cugraph/latest/#main-content)

Back to top`Ctrl` + `K`

[![NVIDIA cuGraph - Home](https://docs.nvidia.com/cugraph/latest/_static/nvidia-logo-horiz-rgb-blk-for-screen.svg)![NVIDIA cuGraph - Home](https://docs.nvidia.com/cugraph/latest/_static/nvidia-logo-horiz-rgb-wht-for-screen.svg)\\
NVIDIA cuGraph](https://docs.nvidia.com/cugraph/latest/#)

latest

[latest](https://docs.nvidia.com/cugraph/latest/) [26.10](https://docs.nvidia.com/cugraph/26.10/) [26.08](https://docs.nvidia.com/cugraph/26.08/) [26.06](https://archive.docs.nvidia.com/cugraph/26.06/) [26.04](https://archive.docs.nvidia.com/cugraph/26.04/) [26.02](https://archive.docs.nvidia.com/cugraph/26.02/) [25.12](https://archive.docs.nvidia.com/cugraph/25.12/) [25.10](https://archive.docs.nvidia.com/cugraph/25.10/) [25.08](https://archive.docs.nvidia.com/cugraph/25.08/) [25.06](https://archive.docs.nvidia.com/cugraph/25.06/) [25.04](https://archive.docs.nvidia.com/cugraph/25.04/) [25.02](https://archive.docs.nvidia.com/cugraph/25.02/) [24.12](https://archive.docs.nvidia.com/cugraph/24.12/) [24.10](https://archive.docs.nvidia.com/cugraph/24.10/) [24.08](https://archive.docs.nvidia.com/cugraph/24.08/) [24.06](https://archive.docs.nvidia.com/cugraph/24.06/) [24.04](https://archive.docs.nvidia.com/cugraph/24.04/) [24.02](https://archive.docs.nvidia.com/cugraph/24.02/) [23.12](https://archive.docs.nvidia.com/cugraph/23.12/) [23.10](https://archive.docs.nvidia.com/cugraph/23.10/) [23.08](https://archive.docs.nvidia.com/cugraph/23.08/) [23.06](https://archive.docs.nvidia.com/cugraph/23.06/) [23.04](https://archive.docs.nvidia.com/cugraph/23.04/) [23.02](https://archive.docs.nvidia.com/cugraph/23.02/)

- System Settings
- Light
- Dark

- [GitHub](https://github.com/rapidsai/cugraph)

[Is this page helpful?](https://surveys.hotjar.com/4904bf71-6484-47a7-83ff-4715cceabdb5)

# NVIDIA cuGraph Documentation [\#](https://docs.nvidia.com/cugraph/latest/\#nvidia-cugraph-documentation "Link to this heading")

![_images/cugraph_logo_2.png](https://docs.nvidia.com/cugraph/latest/_images/cugraph_logo_2.png)

## Overview [\#](https://docs.nvidia.com/cugraph/latest/\#overview "Link to this heading")

NVIDIA cuGraph is an open-source collection of GPU-accelerated graph analytics
libraries. The collection spans high-level Python analytics, graph neural
network (GNN) integrations, and lower-level libraries for applications that
need direct control over graph storage and computation.

### Traditional Graph Analytics in Python [\#](https://docs.nvidia.com/cugraph/latest/\#traditional-graph-analytics-in-python "Link to this heading")

- [cuGraph](https://github.com/rapidsai/cugraph/tree/main/python/cugraph)
provides a NetworkX-like Python API for creating and manipulating graphs and
running single- and multi-GPU algorithms. See the
[cuGraph Python API](https://docs.nvidia.com/cugraph/latest/api_docs/cugraph/).

- [pylibcugraph](https://github.com/rapidsai/cugraph/tree/main/python/pylibcugraph)
provides lower-level Python bindings to `libcugraph`. See the
[pylibcugraph API](https://docs.nvidia.com/cugraph/latest/api_docs/plc/pylibcugraph/).

- [nx-cugraph](https://github.com/rapidsai/nx-cugraph), maintained in the
nx-cugraph repository, is a NetworkX backend that accelerates supported
NetworkX algorithms on NVIDIA GPUs without changing application code. See
the [nx-cugraph guide](https://docs.nvidia.com/cugraph/latest/nx_cugraph/).


### GNN Libraries [\#](https://docs.nvidia.com/cugraph/latest/\#gnn-libraries "Link to this heading")

The GNN libraries are maintained in the
[cuGraph-GNN repository](https://github.com/rapidsai/cugraph-gnn).

- [cuGraph-PyG](https://github.com/rapidsai/cugraph-gnn/tree/main/python/cugraph-pyg)
integrates cuGraph with PyTorch Geometric and implements its `GraphStore`,
`FeatureStore`, loader, and sampler interfaces. See the
[cuGraph-PyG API](https://docs.nvidia.com/cugraph/latest/api_docs/cugraph-pyg/cugraph_pyg/).

- [WholeGraph](https://docs.nvidia.com/cugraph/latest/wholegraph/) provides distributed storage,
communication, tensor, embedding, and graph operations for large-scale GNN
workflows. It consists of:

  - [pylibwholegraph](https://github.com/rapidsai/cugraph-gnn/tree/main/python/pylibwholegraph),
    the Python and PyTorch-facing API.

  - [libwholegraph](https://github.com/rapidsai/cugraph-gnn/tree/main/cpp),
    the native C/CUDA library.

### Core Libraries [\#](https://docs.nvidia.com/cugraph/latest/\#core-libraries "Link to this heading")

- [libcuGraph](https://docs.nvidia.com/cugraph/latest/api_docs/libcugraph/) is the native GPU graph
analytics implementation in the
[cuGraph repository](https://github.com/rapidsai/cugraph). Its public
interfaces are organized as:

  - the [C API (libcugraph\_c)](https://docs.nvidia.com/cugraph/latest/api_docs/cugraph_c/);

  - the [C++ API](https://docs.nvidia.com/cugraph/latest/api_docs/cugraph_cpp/);

  - the [C++ primitives API](https://docs.nvidia.com/cugraph/latest/api_docs/cugraph_prims/) for composing
    graph operations; and

  - the [ETL API (libcugraph\_etl)](https://docs.nvidia.com/cugraph/latest/api_docs/cugraph_etl/) for
    renumbering tabular vertex identifiers.

The [cuGraph Docs repository](https://github.com/rapidsai/cugraph-docs)
contains the combined documentation sources and build configuration for these
components.

## cuGraph Using NetworkX Code [\#](https://docs.nvidia.com/cugraph/latest/\#cugraph-using-networkx-code "Link to this heading")

cuGraph is available as a NetworkX backend through
[nx-cugraph](https://rapids.ai/nx-cugraph/). NetworkX users can accelerate
supported algorithms on an NVIDIA GPU without changing their existing code.

See [zero-code-change NetworkX acceleration](https://docs.nvidia.com/cugraph/latest/nx_cugraph/), or
continue below to use the cuGraph API directly.

## Getting started with cuGraph [\#](https://docs.nvidia.com/cugraph/latest/\#getting-started-with-cugraph "Link to this heading")

See the [RAPIDS system requirements](https://docs.rapids.ai/install/#system-req) for required hardware and
software.

### Installation [\#](https://docs.nvidia.com/cugraph/latest/\#installation "Link to this heading")

Please see the latest [RAPIDS System Requirements documentation](https://docs.rapids.ai/install#system-req).

The RAPIDS installation guide covers several ways to set up cuGraph:

- On Linux

  - [Conda](https://docs.rapids.ai/install/#conda)

  - [Docker](https://docs.rapids.ai/install/#docker)

  - [pip](https://docs.rapids.ai/install/#pip)

**Note: Windows use of RAPIDS depends on prior installation of** [WSL2](https://learn.microsoft.com/en-us/windows/wsl/install).

- On Windows

  - [Conda](https://docs.rapids.ai/install#wsl2-conda)

  - [Docker](https://docs.rapids.ai/install#wsl2-docker)

  - [pip](https://docs.rapids.ai/install#wsl2-pip)

### cuGraph API example [\#](https://docs.nvidia.com/cugraph/latest/\#cugraph-api-example "Link to this heading")

```
import cugraph

# Create an instance of the Zachary Karate Club graph.
from cugraph.datasets import karate
G = karate.get_graph()

centrality = cugraph.degree_centrality(G)
```

Copy to clipboard

The cuGraph [notebooks](https://github.com/rapidsai/cugraph/blob/HEAD/notebooks/README.md) include
examples of loading graph data and running algorithms. The
[Python tests](https://github.com/rapidsai/cugraph/tree/main/python/cugraph/cugraph/tests)
also provide focused examples.

The [degree centrality test](https://github.com/rapidsai/cugraph/blob/HEAD/python/cugraph/cugraph/tests/centrality/test_degree_centrality.py)
is a compact starting point. A corresponding
[multi-GPU example](https://github.com/rapidsai/cugraph/blob/HEAD/python/cugraph/cugraph/tests/centrality/test_degree_centrality_mg.py)
shows the distributed workflow.

## Table of Contents [\#](https://docs.nvidia.com/cugraph/latest/\#table-of-contents "Link to this heading")

- [Basics](https://docs.nvidia.com/cugraph/latest/basics/)
- [nx-cugraph](https://docs.nvidia.com/cugraph/latest/nx_cugraph/)
- [Installation](https://docs.nvidia.com/cugraph/latest/installation/)
- [Tutorials](https://docs.nvidia.com/cugraph/latest/tutorials/)
- [Graph Support](https://docs.nvidia.com/cugraph/latest/graph_support/)
- [WholeGraph](https://docs.nvidia.com/cugraph/latest/wholegraph/)
- [References](https://docs.nvidia.com/cugraph/latest/references/)
- [Developer Resources](https://docs.nvidia.com/cugraph/latest/dev_resources/)
- [API Reference](https://docs.nvidia.com/cugraph/latest/api_docs/)

## Indices and tables [\#](https://docs.nvidia.com/cugraph/latest/\#indices-and-tables "Link to this heading")

- [Index](https://docs.nvidia.com/cugraph/latest/genindex/)

- [Search Page](https://docs.nvidia.com/cugraph/latest/search/)


On this page