# Atlas Runtime Registry

**Status**: active roadmap note  
**Date**: 2026-07-17

## What was added

- A typed Atlas runtime registry descriptor in `sveltekit-frontend/src/lib/server/atlas/runtime-registry.ts`
- A control-plane API endpoint at `/api/admin/atlas/runtime-registry`
- A focused spec proving the registry sections, control surfaces, and projection/search paths

## Registry sections

- Contract Registry
- Capability Registry
- Projection Registry
- Model Registry
- Embedding Registry
- Worker Registry
- Pipeline Registry
- Feature Registry
- Recommendation Registry

## Immediate next steps

1. Keep HyperRAG merge work separate from registry wiring.
2. Expose the runtime registry in the Atlas admin shell only after the projection outbox proof stays green.
3. Use the registry module as the canonical control-plane descriptor, not as a second source of truth.
4. Add retrieval-path checks only against the live `SearchRuntime` path and the active hybrid collection.
