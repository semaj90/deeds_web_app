TensorRT-LLM smoke-run and build notes

Purpose
-------
Quick instructions to run the TensorRT-LLM smoke-test inside a GPU-enabled Docker container (WSL2/Docker Desktop). These are the exact commands I used in the scaffold and the recommended flags to ensure the container has access to GPU and IPC.

Prerequisites
-------------
- Docker Desktop on Windows with WSL2 backend
- NVIDIA Container Toolkit installed on the host (nvidia-docker2)
- Docker can run GPU containers: `docker run --rm --gpus all nvidia/cuda:11.8-base nvidia-smi`

Run the official TensorRT-LLM container and build the smoke-test inside it
------------------------------------------------------------------------

PowerShell (WSL2 recommended):

1) Start an interactive container with the workspace mounted and GPU access. Replace the image if you have a pinned TensorRT-LLM image.

docker run --rm -it --gpus all --ipc=host --ulimit memlock=-1 --ulimit stack=67108864 -v "${PWD}:/workspace" -w /workspace nvcr.io/nvidia/tensorrt-llm/release:latest /bin/bash

2) Inside the container, build and run the smoke-test (the smoke-test scripts assume CMake and build tools are present in the image; install them if missing):

cd /workspace/smoke-test
chmod +x build.sh
./build.sh

3) If the container doesn't have CMake, install it (Debian/Ubuntu):

apt-get update && apt-get install -y build-essential cmake git ca-certificates

Notes about "rebuild" vs re-download
------------------------------------
- docker run --rm pulls the image if missing. If you use `docker pull` first, the run step won't redownload the image.
- If you rebuild the C++ project inside the container, you do not re-download the container image. "Rebuild" only recompiles code inside the running container or in your mounted workspace.

If you want a simple PowerShell wrapper, use the `run-smoke-tensorrt.ps1` script in this directory which wraps Docker commands for Windows/WSL2.
