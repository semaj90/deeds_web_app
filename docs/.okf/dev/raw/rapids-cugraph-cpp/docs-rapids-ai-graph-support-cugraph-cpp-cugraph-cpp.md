![country_code](https://www.nvidia.com/content/dam/1x1-00000000.png)

[Skip to main content](https://docs.nvidia.com/cugraph/latest/graph_support/cugraph_cpp/#main-content)

Back to top`Ctrl` + `K`

[![NVIDIA cuGraph - Home](https://docs.nvidia.com/cugraph/latest/_static/nvidia-logo-horiz-rgb-blk-for-screen.svg)![NVIDIA cuGraph - Home](https://docs.nvidia.com/cugraph/latest/_static/nvidia-logo-horiz-rgb-wht-for-screen.svg)\\
NVIDIA cuGraph](https://docs.nvidia.com/cugraph/latest/)

latest

[latest](https://docs.nvidia.com/cugraph/latest/graph_support/cugraph_cpp/) [26.10](https://docs.nvidia.com/cugraph/26.10/graph_support/cugraph_cpp/) [26.08](https://docs.nvidia.com/cugraph/26.08/graph_support/cugraph_cpp/) [26.06](https://archive.docs.nvidia.com/cugraph/26.06/graph_support/cugraph_cpp/) [26.04](https://archive.docs.nvidia.com/cugraph/26.04/graph_support/cugraph_cpp/) [26.02](https://archive.docs.nvidia.com/cugraph/26.02/graph_support/cugraph_cpp/) [25.12](https://archive.docs.nvidia.com/cugraph/25.12/graph_support/cugraph_cpp/) [25.10](https://archive.docs.nvidia.com/cugraph/25.10/graph_support/cugraph_cpp/) [25.08](https://archive.docs.nvidia.com/cugraph/25.08/graph_support/cugraph_cpp/) [25.06](https://archive.docs.nvidia.com/cugraph/25.06/graph_support/cugraph_cpp/) [25.04](https://archive.docs.nvidia.com/cugraph/25.04/graph_support/cugraph_cpp/) [25.02](https://archive.docs.nvidia.com/cugraph/25.02/graph_support/cugraph_cpp/) [24.12](https://archive.docs.nvidia.com/cugraph/24.12/graph_support/cugraph_cpp/) [24.10](https://archive.docs.nvidia.com/cugraph/24.10/graph_support/cugraph_cpp/) [24.08](https://archive.docs.nvidia.com/cugraph/24.08/graph_support/cugraph_cpp/) [24.06](https://archive.docs.nvidia.com/cugraph/24.06/graph_support/cugraph_cpp/) [24.04](https://archive.docs.nvidia.com/cugraph/24.04/graph_support/cugraph_cpp/) [24.02](https://archive.docs.nvidia.com/cugraph/24.02/graph_support/cugraph_cpp/) [23.12](https://archive.docs.nvidia.com/cugraph/23.12/graph_support/cugraph_cpp/) [23.10](https://archive.docs.nvidia.com/cugraph/23.10/graph_support/cugraph_cpp/) [23.08](https://archive.docs.nvidia.com/cugraph/23.08/graph_support/cugraph_cpp/) [23.06](https://archive.docs.nvidia.com/cugraph/23.06/graph_support/cugraph_cpp/) [23.04](https://archive.docs.nvidia.com/cugraph/23.04/graph_support/cugraph_cpp/) [23.02](https://archive.docs.nvidia.com/cugraph/23.02/graph_support/cugraph_cpp/)

- System Settings
- Light
- Dark

- [GitHub](https://github.com/rapidsai/cugraph)

[Is this page helpful?](https://surveys.hotjar.com/4904bf71-6484-47a7-83ff-4715cceabdb5)

# Cugraph C++ [\#](https://docs.nvidia.com/cugraph/latest/graph_support/cugraph_cpp/\#cugraph-c "Link to this heading")

- [cuGraph C++ Overview](https://docs.nvidia.com/cugraph/latest/graph_support/cugraph_cpp_support/)
  - [Lexicon](https://docs.nvidia.com/cugraph/latest/graph_support/cugraph_cpp_support/#lexicon)
    - [COO](https://docs.nvidia.com/cugraph/latest/graph_support/cugraph_cpp_support/#coo)
    - [MORE](https://docs.nvidia.com/cugraph/latest/graph_support/cugraph_cpp_support/#more)
- [Directory Structure and File Naming](https://docs.nvidia.com/cugraph/latest/graph_support/cugraph_cpp_support/#directory-structure-and-file-naming)
  - [File extensions](https://docs.nvidia.com/cugraph/latest/graph_support/cugraph_cpp_support/#file-extensions)
  - [Code and Documentation Style and Formatting](https://docs.nvidia.com/cugraph/latest/graph_support/cugraph_cpp_support/#code-and-documentation-style-and-formatting)
    - [C++ Guidelines](https://docs.nvidia.com/cugraph/latest/graph_support/cugraph_cpp_support/#c-guidelines)
    - [Includes](https://docs.nvidia.com/cugraph/latest/graph_support/cugraph_cpp_support/#includes)
- [cuGraph Data Structures](https://docs.nvidia.com/cugraph/latest/graph_support/cugraph_cpp_support/#cugraph-data-structures)
  - [Views and Ownership](https://docs.nvidia.com/cugraph/latest/graph_support/cugraph_cpp_support/#views-and-ownership)
  - [`rmm::device_memory_resource`](https://docs.nvidia.com/cugraph/latest/graph_support/cugraph_cpp_support/#rmm-device-memory-resource)
  - [Streams](https://docs.nvidia.com/cugraph/latest/graph_support/cugraph_cpp_support/#streams)
    - [Memory Management](https://docs.nvidia.com/cugraph/latest/graph_support/cugraph_cpp_support/#memory-management)
  - [Namespaces](https://docs.nvidia.com/cugraph/latest/graph_support/cugraph_cpp_support/#namespaces)
    - [External](https://docs.nvidia.com/cugraph/latest/graph_support/cugraph_cpp_support/#external)
    - [Internal](https://docs.nvidia.com/cugraph/latest/graph_support/cugraph_cpp_support/#internal)
- [Error Handling](https://docs.nvidia.com/cugraph/latest/graph_support/cugraph_cpp_support/#error-handling)
  - [Runtime Conditions](https://docs.nvidia.com/cugraph/latest/graph_support/cugraph_cpp_support/#runtime-conditions)
    - [CUDA Error Checking](https://docs.nvidia.com/cugraph/latest/graph_support/cugraph_cpp_support/#cuda-error-checking)
  - [Compile-Time Conditions](https://docs.nvidia.com/cugraph/latest/graph_support/cugraph_cpp_support/#compile-time-conditions)