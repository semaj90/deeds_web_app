![country_code](https://www.nvidia.com/content/dam/1x1-00000000.png)

[Skip to main content](https://docs.nvidia.com/cuml/latest/#main-content)

Back to top`Ctrl` + `K`

[![NVIDIA cuML - Home](https://docs.nvidia.com/cuml/latest/_static/nvidia-logo-horiz-rgb-blk-for-screen.svg)![NVIDIA cuML - Home](https://docs.nvidia.com/cuml/latest/_static/nvidia-logo-horiz-rgb-wht-for-screen.svg)\\
NVIDIA cuML](https://docs.nvidia.com/cuml/latest/#)

latest

[latest](https://docs.nvidia.com/cuml/latest/) [26.10](https://docs.nvidia.com/cuml/26.10/) [26.08](https://docs.nvidia.com/cuml/26.08/) [26.06](https://archive.docs.nvidia.com/cuml/26.06/) [26.04](https://archive.docs.nvidia.com/cuml/26.04/) [26.02](https://archive.docs.nvidia.com/cuml/26.02/) [25.12](https://archive.docs.nvidia.com/cuml/25.12/) [25.10](https://archive.docs.nvidia.com/cuml/25.10/) [25.08](https://archive.docs.nvidia.com/cuml/25.08/) [25.06](https://archive.docs.nvidia.com/cuml/25.06/) [25.04](https://archive.docs.nvidia.com/cuml/25.04/) [25.02](https://archive.docs.nvidia.com/cuml/25.02/) [24.12](https://archive.docs.nvidia.com/cuml/24.12/) [24.10](https://archive.docs.nvidia.com/cuml/24.10/) [24.08](https://archive.docs.nvidia.com/cuml/24.08/) [24.06](https://archive.docs.nvidia.com/cuml/24.06/) [24.04](https://archive.docs.nvidia.com/cuml/24.04/) [24.02](https://archive.docs.nvidia.com/cuml/24.02/) [23.12](https://archive.docs.nvidia.com/cuml/23.12/) [23.10](https://archive.docs.nvidia.com/cuml/23.10/) [23.08](https://archive.docs.nvidia.com/cuml/23.08/) [23.06](https://archive.docs.nvidia.com/cuml/23.06/) [23.04](https://archive.docs.nvidia.com/cuml/23.04/) [23.02](https://archive.docs.nvidia.com/cuml/23.02/)

- System Settings
- Light
- Dark

- [GitHub](https://github.com/NVIDIA/cuml)

[Is this page helpful?](https://surveys.hotjar.com/4904bf71-6484-47a7-83ff-4715cceabdb5)

# NVIDIA cuML Documentation [\#](https://docs.nvidia.com/cuml/latest/\#nvidia-cuml-documentation "Link to this heading")

NVIDIA cuML is a suite of fast, GPU-accelerated machine learning algorithms
designed for data science and analytical tasks. Our API mirrors scikit-learn,
providing practitioners with the familiar fit-predict-transform paradigm
without requiring GPU programming expertise. With [`cuml.accel`](https://docs.nvidia.com/cuml/latest/api/cuml.accel/#module-cuml.accel "cuml.accel"), cuML can also
automatically accelerate existing code with zero code changes.

cuML delivers on average **10-50x faster performance** than CPU-based
alternatives for realistic workloads and supports **50+ algorithms** across all
major machine learning categories, including clustering, regression,
classification, and dimensionality reduction. With comprehensive **multi-GPU**
**and multi-node support** via Dask, cuML scales from single workstations to
large clusters.

Especially if your scikit-learn, umap-learn, or hdbscan workflows take many
minutes to complete, you will likely benefit from using cuML. The equivalent
cuML estimators often run in seconds.

# Quick Start [\#](https://docs.nvidia.com/cuml/latest/\#quick-start "Link to this heading")

```
from cuml.datasets import make_blobs
from cuml.cluster import DBSCAN

# Create sample data
X, y = make_blobs(n_samples=100, centers=3, n_features=2, random_state=42)

# Fit clustering model
dbscan = DBSCAN(eps=1.0, min_samples=5)
dbscan.fit(X)
print(dbscan.labels_)
```

Copy to clipboard

# Key Features [\#](https://docs.nvidia.com/cuml/latest/\#key-features "Link to this heading")

- **GPU Acceleration**: 10-50x faster than CPU-based alternatives

- **Scikit-learn Compatible**: Drop-in replacement for most sklearn algorithms

- **Multi-GPU Support**: Scale across multiple GPUs and nodes with Dask

- **Comprehensive Coverage**: 50+ algorithms across all major ML categories

- **Flexible Input**: Works with NumPy, cuDF, cuPy, and PyTorch tensors

- **Production Ready**: Battle-tested in enterprise environments


# Installation [\#](https://docs.nvidia.com/cuml/latest/\#installation "Link to this heading")

cuML is available through conda and pip. For detailed installation instructions,
visit the [install guide](https://docs.nvidia.com/datascience/install#selector).

Note

cuML is only supported on Linux operating systems and WSL 2. See
[the install page](https://docs.nvidia.com/datascience/install/#system-req)
for details on system and hardware requirements.

# CUDA-X Data Science [\#](https://docs.nvidia.com/cuml/latest/\#cuda-x-data-science "Link to this heading")

NVIDIA cuML is an open-source library for GPU-accelerated machine learning. It
integrates with libraries in the broader CUDA-X Data Science ecosystem,
including cuDF for data manipulation and cuGraph for graph analytics.

# Community & Support [\#](https://docs.nvidia.com/cuml/latest/\#community-support "Link to this heading")

- [User Guide](https://docs.nvidia.com/cuml/latest/user_guide/) \- Comprehensive usage documentation

- [Python API Reference](https://docs.nvidia.com/cuml/latest/api/) \- Supported user-facing API documentation

- [Developer Guide](https://docs.nvidia.com/cuml/latest/developer_guide/) \- Contributor guidance and internal C++ reference

- [GitHub Issues](https://github.com/NVIDIA/cuml/issues) \- Report bugs and request features

- [CUDA-X Data Science Community](https://developer.nvidia.com/topics/ai/data-science/cuda-x-for-data-science#join-the-community) \- Join our community


On this page