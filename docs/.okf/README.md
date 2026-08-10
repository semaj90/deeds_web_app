# OKF contract registry

This directory is the entry point for OKF-related contract artifacts.

Use `registry.yaml` to find the live owner for each contract. Do not move or duplicate the live artifacts just to make them fit a directory pattern.

Primary references:

- `registry.yaml` — navigation layer for contract ownership
- `schema.yaml` — OKF schema definition
- `IMPLEMENTATION_GUIDE.md` — operational guidance and audit gates

Current live owners are kept in their existing locations, including:

- `docs/metadata-contract-schema.yaml`
- `docs/okf-v1-source.okf`
- `sveltekit-frontend/schemas/atlas/feature-envelope/feature-envelope.v3.okf`
- `sveltekit-frontend/src/lib/server/atlas/feature-matrix-schema.ts`
- `sveltekit-frontend/src/lib/server/atlas/okf-topic-ingestion.ts`
- `sveltekit-frontend/src/lib/server/atlas/contracts/ontology-linked-tuple-v1.ts`
- `sveltekit-frontend/src/lib/server/okf/mastra-workflows.okf.yaml`

If you are adding a new OKF-related artifact, register it here first and keep the live owner explicit.
