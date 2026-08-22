# QDRANT 768 PROV — historical semantic representation provenance

Status: `IMPLEMENTED_UNPROVEN / READ_ONLY`

## Purpose

A collection name, 768-dimensional vector schema, and cosine distance do not prove which embedding model, runtime, prompt contract, normalization rule, or writer generation produced historical vectors.

This gate therefore keeps expected collection contract separate from observed historical provenance.

## Implemented scope

### PROV 00 — collection contract census

Read-only collection inspection records, per collection:

- named vector configuration, dimension, distance, datatype and on-disk state;
- sparse-vector names;
- HNSW configuration;
- quantization configuration;
- strict-mode configuration;
- collection metadata when present;
- point count and payload-schema keys.

### PROV 01 — writer census

Known historical writer paths are hashed and inspected for:

- collection mentions;
- vector-name mentions;
- provenance-field mentions;
- embedding endpoint/runtime hints.

A source-file checksum identifies the writer source observed by the census. It does not prove that source revision wrote a particular historical point.

### PROV 02 — payload census

The audit scrolls Qdrant with:

```text
with_payload = true
with_vector  = false
```

and groups observed points by point-ID generation without coercing opaque IDs through JavaScript `Number`.

Observed payload evidence includes representation, model, model revision state, prompt, normalization, writer/projection revision, world/source revisions and canonical identity fields.

For multi-vector collections the payload census deliberately emits:

```text
vector_name = __collection_payload__
vector_membership_observed = false
```

because a point-level payload cannot prove that one producer generated every named vector on the point. `content`, `error`, and `signature` must not inherit one another's model provenance merely because they share a collection.

## Provenance status semantics

```text
UNPROVEN
  collection/config shape only, or no meaningful producer evidence

PARTIAL
  some writer/payload provenance exists but the generation identity is incomplete

MIXED_HISTORY
  sampled cohort contains conflicting producer/prompt/representation fields

PROVEN_FOR_GENERATION
  complete model/runtime/prompt/normalization identity plus exact packet linkage
  for the observed generation, but no numerical reproduction yet

PROVEN
  PROVEN_FOR_GENERATION plus numerical corroboration of the stored representation
```

`canonical_authority=false` for every provenance cohort. The receipt describes evidence about a projection; it does not become the embedding or packet authority.

## Explicit non-equivalences

The audit must not infer any of the following:

```text
768 dimensions             != EmbeddingGemma proven
Cosine distance             != normalization provenance
embedding_model string      != model artifact digest
embedding_digest            != model artifact digest
projection_revision         != writer revision
collection metadata         != per-point historical receipt
point payload               != per-vector producer proof
selected/written generation != numerically reproduced generation
```

## Still open

```text
PROV 03 exact packet/source lineage       OPEN
PROV 04 full generation cohort census     OPEN
PROV 05 numerical corroboration           OPEN
historical payload repair/backfill        NOT AUTHORIZED
collection metadata mutation              NOT AUTHORIZED
vector rewrite/re-embedding                NOT AUTHORIZED
```

Numerical corroboration should only begin after PROV 00-04 narrow a cohort to an exact model artifact, runtime revision, prompt mode/revision, normalization revision and exact original input identity.

## Workstation proof

```powershell
cd C:\Users\james\Videos\deeds_web_app\packages\parent-atlas
node_modules\.bin\vitest run src\core\qdrant-embedding-provenance-v1.spec.ts

cd C:\Users\james\Videos\deeds_web_app\sveltekit-frontend
npx tsx scripts\atlas\audit-qdrant-768-provenance.mts
```

Expected audit receipt:

```text
QDRANT_768_PROVENANCE_CENSUS_COMPLETE
vectors_requested=false
writes_attempted=false
```

`UNPROVEN`, `PARTIAL`, or `MIXED_HISTORY` cohort results are valid audit evidence and must not be weakened merely to make the report green.
