# Parent Atlas Ingestion and Agent Integrations Glossary V1

This glossary is a navigation and terminology aid for the Parent Atlas ingestion
fabric. It does not create a second packet, identity, retrieval, graph, cache, or
agent authority. Canonical identity and promotion remain owned by the existing
PostgreSQL and Parent Atlas contracts.

## Core terms

- **Ingestion** — bounded acquisition, normalization, validation, revisioning, and admission of source or external-document evidence. Acquisition alone is not canonical admission.
- **Deep agent** — a long-running, tool-using workflow that consumes bounded evidence and receipts; it cannot promote identity or write canonical stores directly.
- **`.okf`** — the repository's schema/navigation and derived knowledge-artifact convention. `.okf` YAML/JSON is validated input or a projection, never an authority that mints packet identity.
- **JSON packet** — a versioned, schema-validated transport envelope for bounded evidence or ACE context. Packet keys, source references, revisions, checksums, and grounded spans must survive every adapter.
- **ACE** — the Context Editor boundary that selects and canonicalizes evidence into bounded cards and a `ContextManifest`. Raw retrieval hits must not be passed directly to an agent or model.

## Acquisition and schema adapters

- **Firecrawl** — optional external-page acquisition/extraction provider. Receipts record the actual provider, URL resolution, content digest, timestamp, and failure state; Firecrawl does not admit or own the source.
- **LangChain** — model, tool, and agent-harness integration surface. Local corpora and loaders are reference inputs until they pass existing external-document admission and readback gates.
- **Pydantic** — Python request, response, and artifact validation boundary. It validates shape and semantics but does not mint canonical identity or replace TypeScript/Zod or database ownership.
- **Mastra** — optional TypeScript agent/workflow integration surface. Workflows may orchestrate bounded tools and receipts, while respecting no-direct-canonical-write and independent-readback boundaries.
- **Integration** — an adapter between an external library/service and an existing Parent Atlas owner. Completion requires explicit input/output, revision/checksum propagation, failure behavior, and readback proof.

## Authority and proof vocabulary

- **Source reference** — the stable pointer to source bytes or external-document capture used by a packet/chunk; it is not path-only identity.
- **Revision** — an immutable version dimension such as `sourceRevision`, `workspaceRevision`, `representationRevision`, or `producerRevision`.
- **Receipt** — machine-readable evidence of a bounded operation, including inputs, outputs, revisions, checksums, and status. It proves that operation, not downstream promotion.
- **Projection** — a rebuildable derived representation such as Qdrant, graph, cache, or local `.okf` corpus output. Projections cannot become canonical by being complete or byte-compatible.
- **Readback** — independent verification from the receiving owner that admitted identity, revision, checksum, and payload shape match the receipt.

## Safe integration flow

```text
acquire -> normalize -> validate (Pydantic/Zod) -> bind source/revision
  -> emit versioned JSON packet -> canonical admission/readback
  -> bounded retrieval -> ACE cards -> ContextManifest -> agent/tools
```

Any failed identity, revision, checksum, grounding, or readback gate remains fail-closed. LangChain, Mastra, Firecrawl, `.okf`, and agent runtimes are replaceable integration surfaces, not additional truth stores.
