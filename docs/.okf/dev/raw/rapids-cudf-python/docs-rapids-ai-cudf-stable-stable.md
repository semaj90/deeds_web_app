![country_code](https://www.nvidia.com/content/dam/1x1-00000000.png)

[Skip to main content](https://docs.nvidia.com/cudf/latest/#main-content)

Back to top`Ctrl` + `K`

[![NVIDIA cuDF - Home](https://docs.nvidia.com/cudf/latest/_static/nvidia-logo-horiz-rgb-blk-for-screen.svg)![NVIDIA cuDF - Home](https://docs.nvidia.com/cudf/latest/_static/nvidia-logo-horiz-rgb-wht-for-screen.svg)\\
NVIDIA cuDF](https://docs.nvidia.com/cudf/latest/#)

latest

[latest](https://docs.nvidia.com/cudf/latest/) [26.10](https://docs.nvidia.com/cudf/26.10/) [26.08](https://docs.nvidia.com/cudf/26.08/) [26.06](https://archive.docs.nvidia.com/cudf/26.06/) [26.04](https://archive.docs.nvidia.com/cudf/26.04/) [26.02](https://archive.docs.nvidia.com/cudf/26.02/) [25.12](https://archive.docs.nvidia.com/cudf/25.12/) [25.10](https://archive.docs.nvidia.com/cudf/25.10/) [25.08](https://archive.docs.nvidia.com/cudf/25.08/) [25.06](https://archive.docs.nvidia.com/cudf/25.06/) [25.04](https://archive.docs.nvidia.com/cudf/25.04/) [25.02](https://archive.docs.nvidia.com/cudf/25.02/) [24.12](https://archive.docs.nvidia.com/cudf/24.12/) [24.10](https://archive.docs.nvidia.com/cudf/24.10/) [24.08](https://archive.docs.nvidia.com/cudf/24.08/) [24.06](https://archive.docs.nvidia.com/cudf/24.06/) [24.04](https://archive.docs.nvidia.com/cudf/24.04/) [24.02](https://archive.docs.nvidia.com/cudf/24.02/) [23.12](https://archive.docs.nvidia.com/cudf/23.12/) [23.10](https://archive.docs.nvidia.com/cudf/23.10/) [23.08](https://archive.docs.nvidia.com/cudf/23.08/) [23.06](https://archive.docs.nvidia.com/cudf/23.06/) [23.04](https://archive.docs.nvidia.com/cudf/23.04/) [23.02](https://archive.docs.nvidia.com/cudf/23.02/)

- System Settings
- Light
- Dark

- [GitHub](https://github.com/NVIDIA/cudf)

[Is this page helpful?](https://surveys.hotjar.com/4904bf71-6484-47a7-83ff-4715cceabdb5)

# NVIDIA cuDF Documentation [\#](https://docs.nvidia.com/cudf/latest/\#nvidia-cudf-documentation "Link to this heading")

**NVIDIA cuDF** (pronounced “KOO-dee-eff”) is a GPU-accelerated library for
tabular data processing. It is part of [NVIDIA CUDA-X for Data Science](https://developer.nvidia.com/topics/ai/data-science/cuda-x-for-data-science)
suite, and is composed of multiple sub-projects:

| Library | Description |
| --- | --- |
| [cudf](https://docs.nvidia.com/cudf/latest/cudf/) | A Python library providing a [pandas](https://pandas.pydata.org/)-like DataFrame API and a zero-code change accelerator, [cudf.pandas](https://docs.nvidia.com/cudf/latest/cudf_pandas/), for existing pandas code. |
| [cudf-polars](https://docs.nvidia.com/cudf/latest/cudf_polars/) | A Python library providing a GPU engine for [Polars](https://pola.rs/). |
| [dask-cudf](https://docs.nvidia.com/dask-cudf/latest/ "(in NVIDIA Dask-cuDF v26.12)") | A Python library providing a GPU backend for [Dask](https://www.dask.org/) DataFrames. |
| [libcudf](https://docs.nvidia.com/cudf/latest/libcudf/) | A CUDA C++ library with [Apache Arrow](https://arrow.apache.org/) compliant data structures and fundamental algorithms for tabular data. |
| [pylibcudf](https://docs.nvidia.com/cudf/latest/pylibcudf/) | A Python library providing [Cython](https://cython.org/) bindings for libcudf. |

## Accelerated Data Engines and Tools [\#](https://docs.nvidia.com/cudf/latest/\#accelerated-data-engines-and-tools "Link to this heading")

The following data engines and tools integrate with cuDF:

| Data engine or tool | cuDF integration | Technical documentation |
| --- | --- | --- |
| Apache Spark | cuDF plugin for Apache Spark | [cuDF for Apache Spark user guide](https://docs.nvidia.com/spark-rapids/user-guide/latest/overview.html) |
| DuckDB | Sirius | [Sirius documentation](https://github.com/sirius-db/sirius) |
| pandas | cudf.pandas | [cudf.pandas documentation](https://docs.nvidia.com/cudf/latest/cudf_pandas/) |
| Polars | Polars GPU engine | [Polars GPU engine documentation](https://docs.nvidia.com/cudf/latest/cudf_polars/) |
| Presto | Presto-GPU | [Presto on GPU tutorial](https://github.com/prestodb/prestorials/tree/main/docker-compose-native/gpu) |
| Velox | Velox on GPU (experimental) | [Velox-cuDF documentation](https://github.com/facebookincubator/velox/blob/main/velox/experimental/cudf/README.md) |

See the [installation and deployment guide](https://docs.nvidia.com/datascience/install/#install-rapids)
to get up-and-running with cuDF.

Development

- [Developer Guide](https://docs.nvidia.com/cudf/latest/developer_guide/)

On this page