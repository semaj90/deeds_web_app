# S512 identity reconciliation v1

Status date: 2026-08-21

This addendum corrects the identity assumptions behind S512-9G/S512-10 after a
live read-only census of the historical `codebase_chunks_512` projection.
It does not weaken `ADMITTED`, mint packets, mutate Qdrant payloads, or change
which identifier namespace is canonical.

## Live finding that triggered this gate

The historical 512 projection is fragmented across multiple incompatible
identifier spaces:

- `atlas_packets.packet_key` uses the live canonical packet namespace (observed
  examples: `ace:packet:<hex>`).
- `codebase_chunk_index.metadata->>'packet_key'` contains a separate
  `sha256:<64hex>` namespace for many rows.
- `atlas_source_refs.content_hash` can join to
  `codebase_chunk_index.content_hash` for only a subset of rows; this is
  candidate evidence, not packet identity.
- `atlas_source_refs.source_ref_key` and `atlas_packets.source_ref_key` are
  separately populated key spaces and did not converge in the live census.
- No live `atlas_packets` row currently claims
  `qdrant_collection='codebase_chunks_512'` ownership for the historical 512
  points.

Therefore the old reconciler assumption that a Qdrant point can be promoted to
`ADMITTED` by deriving an expected packet key from source/content evidence is no
longer sufficient. A real existing `atlas_packets.packet_key` must be resolved.

## Non-negotiable identity rule

```text
ADMITTED
    =>
exactly one existing atlas_packets.packet_key
```

The following are evidence coordinates only and are never aliases for a
canonical packet key:

```text
Qdrant point id
codebase_chunk_index.id
codebase_chunk_index metadata packet_key
atlas_source_refs.source_ref_key
content_hash
Tree-sitter span/path
```

They may participate in a deterministic derivation, but they may not be rewritten
into each other or used to mint identity in the reconciliation layer.

## Contract

`AtlasChunkPacketIdentityLinkV1` is the read-only output of the new identity
classifier. It records:

```text
qdrantCollection
qdrantPointId
chunkIndexId
canonicalPacketKey|null
sourceRef|null
sourceRevision|null
matchMethod
candidatePacketKeys[]
confidence
admission
reasonCodes[]
evidenceRefs[]
canonicalPacketMinted=false
canonicalWritesAllowed=false
```

Match methods are ordered evidence classes, not interchangeable key schemes:

1. `EXACT_CANONICAL_ID`
2. `EXACT_QDRANT_POINT_LINK`
3. `EXACT_SOURCE_SPAN`
4. `SOURCE_REVISION_SPAN`
5. `STRUCTURAL_FINGERPRINT`
6. `CONTENT_HASH_UNIQUE`
7. `AMBIGUOUS`
8. `UNRESOLVED`

### Content-hash rule

A unique content-hash join may nominate an existing packet candidate, but
`CONTENT_HASH_UNIQUE` by itself remains `REVIEW`; identical code bodies can occur
at multiple canonical locations. Content hash is never sufficient mutation or
identity authority.

### Packet creation rule

Identity reconciliation and packet creation are separate operations:

```text
IdentityLinker
  -> existing packet resolved     => linkage candidate
  -> no existing packet resolved  => MISSING_CANONICAL_PACKET / quarantine
```

A later `CanonicalPacketCreationProposalV1` may be introduced only after proving
that an unresolved row is a genuinely missing canonical packet rather than
legacy projection debris, a stale chunk, duplicate content, an obsolete
representation, or an orphaned point. This addendum does not define or authorize
that mutation.

## S512 identity blocker family

- [x] **S512-ID0 — Cross-store identity census** — live read-only audit proved
  systemic identity fragmentation across Qdrant, `codebase_chunk_index`,
  `atlas_source_refs`, and `atlas_packets`. The pre-existing S512 reconciler's
  expected-key derivation is not a canonical packet link.
- [x] **S512-ID1A — Identity-link contract** — add
  `atlas.chunk-packet-identity-link.v1`, preserving candidate evidence without
  minting packet identity. `CONTENT_HASH_UNIQUE` cannot become `ADMITTED` by
  itself.
- [ ] **S512-ID1B — Deterministic live candidate derivation** — produce one
  read-only manifest over a bounded/full 512 corpus with candidate packet keys
  and evidence refs from every available exact/span/structural/content join.
- [ ] **S512-ID2 — Ambiguity and uniqueness proof** — report counts for
  `EXACT`, `UNIQUE_DERIVATION`, `AMBIGUOUS`, and `NONE`; prove repeated runs on
  the same Postgres snapshot produce identical classifications/checksum.
- [ ] **S512-ID3 — Canonical packet linkage** — for rows admitted by ID1/ID2,
  prove the selected key exists in `atlas_packets` and freeze the link in a
  reviewed manifest. This gate still performs no packet minting and no Qdrant
  mutation.
- [ ] **S512-ID4 — Linkage read-back/determinism** — re-read every selected
  `atlas_packets.packet_key`, source/ref evidence, and snapshot lineage; fail
  closed on missing, changed, or ambiguous links.

## S512-10 correction

S512-10 remains blocked until S512-ID1B through S512-ID4 pass for at least a
bounded admitted subset.

S512-10 may proceed incrementally over only that admitted subset. It must not be
redefined so `codebase_chunk_index` existence, content-hash convergence, or a
legacy payload key counts as admission.

```text
EXACT / UNIQUE_DERIVATION + existing packet
    -> eligible for ADMITTED after read-back proof

AMBIGUOUS / NONE / content-hash-only
    -> REVIEW or QUARANTINED
    -> excluded from S512-11+
```

The unresolved majority can remain quarantined while downstream proofs operate
on a smaller canonical subset. This is incremental proof, not a weaker gate.

## Implementation owner

The pure classifier lives at:

`src/lib/server/atlas/identity/chunk-packet-identity-link-v1.ts`

Focused tests must cover:

- exact existing canonical packet -> `ADMITTED/EXACT`;
- exact source/span unique packet -> `ADMITTED/UNIQUE_DERIVATION`;
- content-hash-only unique candidate -> `REVIEW`, never `ADMITTED`;
- no existing packet key -> `QUARANTINED/UNRESOLVED`;
- equally strong competing packet keys -> `REVIEW/AMBIGUOUS`;
- strong evidence lineage conflict -> `REVIEW/AMBIGUOUS`.

No Postgres, Qdrant, Valkey, Graphify, vector, packet, or canonical mutation is
authorized by S512-ID0 through S512-ID2.
