# Parent Atlas Three-Plane Runtime

## Control plane

HMM -> PolicyStateTensor -> DSPy/GEPA -> canonical executor -> RuntimePolicyManifest.

## Data plane

Postgres truth -> Arrow IPC numeric artifacts -> Valkey/BitFrost metadata -> ACE residency -> pinned host -> GPU -> cuVS/CAGRA/cuGraph/reranker backends.

## Visualization plane

TopologyCoordinate4 + residency events + RouteTrace -> SvelteKit/WebGPU/WGSL NES/CHR world view.

The planes may observe one another but never redefine one another's identity or truth.
