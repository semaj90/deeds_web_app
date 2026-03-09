# TensorRT-LLM minimal C++ smoke-test

This folder contains a tiny C++ project that includes headers from
`/app/tensorrt_llm/include` and attempts to dlopen `/app/tensorrt_llm/lib/libtensorrt_llm.so`.

Files added:
- `CMakeLists.txt` - minimal CMake config; configurable via -DTENSORRT_LLMSDK_INCLUDE_DIR and -DTENSORRT_LLMSDK_LIB_DIR
- `src/main.cpp` - simple program that prints startup, attempts to dlopen the library and call `tensorrt_llm_init` if present

How to run (Windows with Docker Desktop + WSL2) — PowerShell example

1. Ensure Docker Desktop WSL2 backend is enabled and "Expose GPU to WSL" (or NVIDIA Container Toolkit) is configured.
2. From PowerShell, run the Tensorrt-LLM release container and mount this repo:

```powershell
docker run --rm -it --gpus all --ipc=host `
  --ulimit memlock=-1 --ulimit stack=67108864 `
  -v C:\Users\james\Videos\deeds-web-app:/workspace `
  -w /workspace/tensorrt-smoketest \
  nvcr.io/nvidia/tensorrt-llm/release:latest bash
```

Or from WSL bash (if your source is under $PWD):

```bash
docker run --rm -it --gpus all --ipc=host \
  --ulimit memlock=-1 --ulimit stack=67108864 \
  -v $PWD:/workspace -w /workspace/tensorrt-smoketest \
  nvcr.io/nvidia/tensorrt-llm/release:latest bash
```

Inside the container, build and run the smoke test:

```bash
mkdir -p build && cd build
cmake .. \
  -DTENSORRT_LLMSDK_INCLUDE_DIR=/app/tensorrt_llm/include \
  -DTENSORRT_LLMSDK_LIB_DIR=/app/tensorrt_llm/lib
cmake --build . -j$(nproc)
./tensorrt_smoketest || true
```

Notes about "rebuild" vs "redownload":
- If by "rebuild" you mean re-running `docker build` to produce an image, Docker will cache layers. If nothing changed in the Dockerfile steps/layers, it will reuse cached layers and not redownload base layers.
- If you `docker pull nvcr.io/nvidia/tensorrt-llm/release:latest`, it will check the registry and only download updated layers.
- Building inside a pulled image by bind-mounting the source (the recommended flow here) does not re-download the image unless you explicitly `docker pull` or use `--pull` with `docker build`.

Troubleshooting
- If the build fails because headers are missing, verify `/app/tensorrt_llm/include` exists in the container and is readable.
- If dlopen fails at runtime, check that the `.so` exists under `/app/tensorrt_llm/lib` and that dependent shared libs are available (ldd the .so).
- If GPU is not visible, confirm Docker Desktop exposes GPUs to WSL and run `nvidia-smi` inside the container.

Next steps
- I can attempt to run this build inside the container from my environment if you want me to try it (I will need GPU access). Otherwise, run the commands above on your Windows machine and paste any errors.
