## Decision

Treat 384 as a dimensional shape, not a model or semantic-space identity. Keep each discovered 384 path isolated until its producer, model revision, input recipe, normalization, source identity, and consumers are established. The default disposition is `LEGACY_UNQUALIFIED_RETAINED`, not deletion or conversion.

The root OpenSpec change `parent-atlas-retire-384-lane` is the sole owner of the `atlas_packets.content_embedding_384` archive and schema-retirement decisions. This change's census reports there; it does not create a parallel retirement authority.

## Inventory dimensions

For each occurrence, record path/object, table or collection, exact columns/vector names, operation (read/write/schema/test/docs), caller reachability, producer/model and revision, input recipe, normalization/metric, source and workspace revision predicates, representation revision, readback receipt, persistence/deployment state, and proposed disposition. Search matches alone are leads, not proof of a live writer or consumer.

## Migration gates

1. **Census:** bounded, reproducible source search plus tracing of imports/callers and environment configuration; include tracked and relevant ignored files without dumping secrets.
2. **Ownership:** identify active producer and consumer for each persistent 384 representation; unknown owners remain blocked.
3. **Qualification:** prove a representation-qualified identity and source lineage. A dimension match does not qualify a vector.
4. **Replacement:** route a caller only to an independently qualified representation with same-cohort query/document parity, source invalidation behavior, and one semantic-lane vote.
5. **Retirement:** archive code/config/data according to repository policy only after no active reader/writer, recovery plan, and explicit owner authorization. No deletion is included in this change.

## Model facts and terminology

- `all-MiniLM-L6-v2` is a distinct Sentence Transformers model with a 384-dimensional sentence embedding; its model card documents a 128-token training sequence limit. Do not generalize this to every MiniLM variant.
- Original EmbeddingGemma produces 768 dimensions and documents MRL widths 512, 256, and 128 with truncation and renormalization, and a 2K input context. These are model-version-specific facts, not evidence that local vectors were produced by that model or recipe.
- A 384-width vector can come from many unrelated encoders or transforms. It cannot be relabeled as EmbeddingGemma MRL, `latent_256`, or any other lane based on shape.
- LLM context length and embedding-vector width are independent properties. Metadata enrichment may improve retrieval/context selection but does not increase a model's context window.

## Safety

No production route may select an unqualified legacy vector as canonical. Search and reporting may continue in read-only mode, but ambiguous identity, absent source revisions, unknown model/recipe, or failed readback blocks promotion. Keep snapshots and archives intact. Any later data/schema mutation requires its own explicit gate and rollback/recovery evidence.
