![country_code](https://www.nvidia.com/content/dam/1x1-00000000.png)

[Skip to main content](https://docs.nvidia.com/raft/latest/pylibraft_api/#main-content)

Back to top`Ctrl` + `K`

[![NVIDIA RAFT - Home](https://docs.nvidia.com/raft/latest/_static/nvidia-logo-horiz-rgb-blk-for-screen.svg)![NVIDIA RAFT - Home](https://docs.nvidia.com/raft/latest/_static/nvidia-logo-horiz-rgb-wht-for-screen.svg)\\
NVIDIA RAFT](https://docs.nvidia.com/raft/latest/)

latest

[latest](https://docs.nvidia.com/raft/latest/pylibraft_api/) [26.10](https://docs.nvidia.com/raft/26.10/pylibraft_api/) [26.08](https://docs.nvidia.com/raft/26.08/pylibraft_api/) [26.06](https://archive.docs.nvidia.com/raft/26.06/pylibraft_api/) [26.04](https://archive.docs.nvidia.com/raft/26.04/pylibraft_api/) [26.02](https://archive.docs.nvidia.com/raft/26.02/pylibraft_api/) [25.12](https://archive.docs.nvidia.com/raft/25.12/pylibraft_api/) [25.10](https://archive.docs.nvidia.com/raft/25.10/pylibraft_api/) [25.08](https://archive.docs.nvidia.com/raft/25.08/pylibraft_api/) [25.06](https://archive.docs.nvidia.com/raft/25.06/pylibraft_api/) [25.04](https://archive.docs.nvidia.com/raft/25.04/pylibraft_api/) [25.02](https://archive.docs.nvidia.com/raft/25.02/pylibraft_api/) [24.12](https://archive.docs.nvidia.com/raft/24.12/pylibraft_api/) [24.10](https://archive.docs.nvidia.com/raft/24.10/pylibraft_api/) [24.08](https://archive.docs.nvidia.com/raft/24.08/pylibraft_api/) [24.06](https://archive.docs.nvidia.com/raft/24.06/pylibraft_api/) [24.04](https://archive.docs.nvidia.com/raft/24.04/pylibraft_api/) [24.02](https://archive.docs.nvidia.com/raft/24.02/pylibraft_api/) [23.12](https://archive.docs.nvidia.com/raft/23.12/pylibraft_api/) [23.10](https://archive.docs.nvidia.com/raft/23.10/pylibraft_api/) [23.08](https://archive.docs.nvidia.com/raft/23.08/pylibraft_api/) [23.06](https://archive.docs.nvidia.com/raft/23.06/pylibraft_api/) [23.04](https://archive.docs.nvidia.com/raft/23.04/pylibraft_api/) [23.02](https://archive.docs.nvidia.com/raft/23.02/pylibraft_api/)

- System Settings
- Light
- Dark

- [GitHub](https://github.com/NVIDIA/raft)

[Is this page helpful?](https://surveys.hotjar.com/4904bf71-6484-47a7-83ff-4715cceabdb5)

# Python API [\#](https://docs.nvidia.com/raft/latest/pylibraft_api/\#python-api "Link to this heading")

- [Common](https://docs.nvidia.com/raft/latest/pylibraft_api/common/)
  - [Basic Vocabulary](https://docs.nvidia.com/raft/latest/pylibraft_api/common/#basic-vocabulary)
    - [`DeviceResources`](https://docs.nvidia.com/raft/latest/pylibraft_api/common/#pylibraft.common.DeviceResources)
      - [`getHandle()`](https://docs.nvidia.com/raft/latest/pylibraft_api/common/#pylibraft.common.DeviceResources.getHandle)
      - [`sync()`](https://docs.nvidia.com/raft/latest/pylibraft_api/common/#pylibraft.common.DeviceResources.sync)
    - [`Stream`](https://docs.nvidia.com/raft/latest/pylibraft_api/common/#pylibraft.common.Stream)
      - [`get_ptr()`](https://docs.nvidia.com/raft/latest/pylibraft_api/common/#pylibraft.common.Stream.get_ptr)
      - [`sync()`](https://docs.nvidia.com/raft/latest/pylibraft_api/common/#pylibraft.common.Stream.sync)
    - [`device_ndarray`](https://docs.nvidia.com/raft/latest/pylibraft_api/common/#pylibraft.common.device_ndarray)
      - [`c_contiguous`](https://docs.nvidia.com/raft/latest/pylibraft_api/common/#pylibraft.common.device_ndarray.c_contiguous)
      - [`copy_to_host()`](https://docs.nvidia.com/raft/latest/pylibraft_api/common/#pylibraft.common.device_ndarray.copy_to_host)
      - [`dtype`](https://docs.nvidia.com/raft/latest/pylibraft_api/common/#pylibraft.common.device_ndarray.dtype)
      - [`empty()`](https://docs.nvidia.com/raft/latest/pylibraft_api/common/#pylibraft.common.device_ndarray.empty)
      - [`f_contiguous`](https://docs.nvidia.com/raft/latest/pylibraft_api/common/#pylibraft.common.device_ndarray.f_contiguous)
      - [`shape`](https://docs.nvidia.com/raft/latest/pylibraft_api/common/#pylibraft.common.device_ndarray.shape)
      - [`strides`](https://docs.nvidia.com/raft/latest/pylibraft_api/common/#pylibraft.common.device_ndarray.strides)
  - [Interruptible](https://docs.nvidia.com/raft/latest/pylibraft_api/common/#interruptible)
    - [`cuda_interruptible()`](https://docs.nvidia.com/raft/latest/pylibraft_api/common/#pylibraft.common.interruptible.cuda_interruptible)
    - [`synchronize()`](https://docs.nvidia.com/raft/latest/pylibraft_api/common/#pylibraft.common.interruptible.synchronize)
    - [`cuda_yield()`](https://docs.nvidia.com/raft/latest/pylibraft_api/common/#pylibraft.common.interruptible.cuda_yield)
  - [CUDA Array Interface Helpers](https://docs.nvidia.com/raft/latest/pylibraft_api/common/#cuda-array-interface-helpers)
    - [`cai_wrapper`](https://docs.nvidia.com/raft/latest/pylibraft_api/common/#pylibraft.common.cai_wrapper)
- [Random](https://docs.nvidia.com/raft/latest/pylibraft_api/random/)
  - [`rmat()`](https://docs.nvidia.com/raft/latest/pylibraft_api/random/#pylibraft.random.rmat)
- [Sparse](https://docs.nvidia.com/raft/latest/pylibraft_api/sparse/)
  - [`eigsh()`](https://docs.nvidia.com/raft/latest/pylibraft_api/sparse/#pylibraft.sparse.linalg.eigsh)
  - [`svds()`](https://docs.nvidia.com/raft/latest/pylibraft_api/sparse/#pylibraft.sparse.linalg.svds)