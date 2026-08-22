# Atlas GPU Stats Skill

Real-time GPU acceleration metrics.

## Usage

```
@atlas gpu-stats
```

## Output

- CUDA availability (RTX device, compute capability)
- VRAM usage and pressure
- Bifrost cache hit rates (L1 exact, L2 semantic)
- TurboVec cluster routing stats
- LibTorch operation counts (cosineSimilarity, clustering, attention)
- Simdjson parse speedups (cached payloads, recent parses)
- Temperature and throttling status

## Description

Queries tensorrt_bridge.node N-API addon and Redis cache for real-time operational metrics across all 6 GPU acceleration stages.
