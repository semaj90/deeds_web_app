# CUDA 13.4 SIMT/cuTile Container

This is an isolated, opt-in WSL2 Docker challenger for the existing ACE radix glyph fixture. It compares the current SIMT Level 2 CUDA kernel with the existing fused CUDA C++ Tile Level 3 kernel against the same CPU-generated binary oracles. It is not a retrieval executor, service, canonical writer, or TensorRT-RTX deployment.

## Ownership and boundaries

- SIMT source owner: `native/cutile-ace-level2/glyph_kernels_bench.cu`.
- CUDA C++ Tile source owner: `native/cutile-ace-level3/glyph_fused_tile.cu`.
- Fixture/oracle owner: `scripts/atlas/ace-radix-01/write-cutile-level2-fixtures.mjs`.
- Fixture preparation wrapper: `scripts/atlas/prepare-cuda134-simt-fixtures.mjs`; output stays under ignored `.tmp/` and is mounted read-only.
- CUDA 13.4 is isolated here; it does not upgrade `atlas-gpu-8098` (CUDA 12) or `atlas-neural-decoder` (CUDA 13.2).
- No port is exposed and no PostgreSQL, Qdrant, Neo4j, Redis/Valkey, source, or model volume is mounted.
- CUDA C++ Tile is the tile-programming challenger; the SIMT kernel remains the conventional per-thread CUDA baseline. Neither is cuVS, cuGraph, or an independent retrieval vote.
- Compose pins `linux/amd64`, uses `network_mode: none`, publishes no ports, and mounts only the generated fixture directory read-only with host-path auto-creation disabled.

## Build and execution

From the repository root, prepare local fixtures and build the image:

```powershell
node scripts/atlas/prepare-cuda134-simt-fixtures.mjs
docker compose -f docker/docker-compose.gpu.yml --profile atlas-cuda134-simt build atlas-cuda134-simt
```

Run only after confirming the GPU is available, Ornith on `:8090` is idle and unloaded through the documented VS Code task, `/slots` is idle, and the operator has approved the GPU run:

```powershell
docker compose -f docker/docker-compose.gpu.yml --profile atlas-cuda134-simt run --rm atlas-cuda134-simt
```

The container compiles both existing kernels for SM 8.6 and runs fixture sizes 256, 1,000, and 4,000. It exits non-zero on missing fixtures, CUDA errors, or CPU-oracle mismatch. Its output is diagnostic stdout only; it does not write a tracked receipt. Save and review a receipt separately before calling this PROVEN.

## Current status

`CREATED` means the Docker package and opt-in Compose entry exist. `WIRED` means both existing kernel owners and the established fixture writer are connected. Neither `PROVEN` nor `DONE` is claimed until the exact CUDA 13.4 image builds and the GPU run returns exact oracle parity on the RTX 3060 Ti. Do not run while VRAM headroom is insufficient.

The creation/validation log is [cuda134-simt-container-creation-v1.json](../reports/cuda134-simt-container-creation-v1.json). The image build was stopped during the multi-gigabyte base-image download before compilation; this is not compile or GPU proof.

The 2026-10-16 host audit found Docker Desktop `linux/x86_64`, WSL2 Ubuntu 24.04.3, and an RTX 3060 Ti (SM 8.6) with about 1.2 GiB free at inspection. Do not launch the container with that headroom. The R580.88 driver meets NVIDIA's general CUDA 13.x minor-compatibility floor, but does not by itself prove every CUDA 13.4 Tile runtime feature will run; the first GPU run must validate the exact kernel/driver combination.

## Validation

- Compose syntax/config validation: `docker compose -f docker/docker-compose.gpu.yml --profile atlas-cuda134-simt config --quiet`.
- Fixture wrapper syntax: `node --check scripts/atlas/prepare-cuda134-simt-fixtures.mjs`.
- The GPU run is intentionally separate from CPU-only validation.
