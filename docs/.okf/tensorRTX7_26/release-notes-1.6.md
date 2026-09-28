# TensorRT-RTX 1.6 — Release Notes

Source: https://docs.nvidia.com/deeplearning/tensorrt-rtx/latest/getting-started/release-notes-1/1.6.html
Fetched: 2026-09-27 (via WebFetch, small-model extraction — see README.md caveat)

## New features / enhancements

- **CUDA support**: adds support for **CUDA Toolkit 13.4**, with continued support for CUDA 12.9
  Update 1. Separate packages per CUDA version.
- **Platform expansion**: Windows on ARM support for NVIDIA RTX Spark, and Linux SBSA support for
  NVIDIA DGX Spark, are now official (SBSA was experimental in 1.5).
- **Performance**: deferred weights loading — deserialize engines without allocating weights in
  memory up front, allowing direct GPU loading from storage. Zero-copy I/O for unified memory
  reduces explicit host-to-device transfers on RTX/DGX Spark systems.

## Runtime cache compatibility (tightened in 1.6)

The runtime environment must match the cached: GPU SKU, TensorRT-RTX version, and
Compute-in-Graphics (CiG) state — and the driver version must be >= the cached version. This is
the basis for root CLAUDE.md's rule: never reuse an old engine/runtime cache as evidence a new
CUDA-13.4/TensorRT-RTX-1.6 configuration is working; always rebuild fresh after any version
change.

## Known issues / limitations

- Unsupported layers: `NonMaxSuppression`, `NonZero`, `Multinomial`.
- Windows: only the **WDDM** driver is supported; the **TCC** driver is unsupported.
- `cudaMallocAsync()` can fail in CiG mode; a custom allocator using `cudaMalloc()` is the
  recommended workaround.
- Turing GPU support requires separate engine builds; default settings exclude Turing in favor of
  Ampere and later architectures (i.e. Ampere, this repo's RTX 3060 Ti, is on the *included*
  side of that default).

## Breaking changes

Engines are **not forward-compatible** with other versions of the TensorRT-RTX runtime — an
engine built under 1.6 is not guaranteed to load under a different TensorRT-RTX runtime version.
