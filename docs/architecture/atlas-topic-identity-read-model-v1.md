# Parent Atlas topic identity read model v1

Status: `DESIGN_ONLY`

This document defines the persistence boundary for the derived topic identity
helper. It does not authorize a migration, backfill, or canonical promotion.

## Ownership

`topic_id` is a deterministic taxonomy identity derived from:

```text
taxonomy_revision + normalized_topic_label
```

It is not a packet key, source identity, tree-node identity, CandidateOrdinal,
or retrieval vote. `title_id` remains the existing packet/title compatibility
field and must not be used as the topic primary key.

PostgreSQL remains the durable identity/revision owner only after an approved
writer and readback contract exists. The current SSR board consumes the
read-only JSON receipt instead.

## Proposed additive read model

If a later OpenSpec explicitly approves durable topic persistence, prefer an
additive derived table or view owned by the existing concept/taxonomy owner:

```text
atlas_topic_identity_read_model
  topic_id                 text primary key       -- UUID-v5-style derived ID
  topic_key                text not null          -- topic:<slug>
  normalized_label         text not null
  display_label            text not null
  taxonomy_revision        text not null
  source_ref               text null
  source_revision          text null
  evidence_checksum        text null
  producer_revision        text not null
  title_id                 text null              -- compatibility only
  canonical_authority     boolean not null default false
  promotion_authorized    boolean not null default false
  created_at                timestamptz not null
  updated_at                timestamptz not null
```

Required indexes, if approved:

```text
UNIQUE (taxonomy_revision, normalized_label)
INDEX  (source_revision)
INDEX  (source_ref)
INDEX  (title_id)
```

Do not add a unique constraint that equates `topic_id` with `title_id`.
They have different derivation domains and lifecycle semantics.

## Admission and write gates

Before any migration or writer is enabled, all of the following must be
proven in a separate OpenSpec tranche:

1. The canonical taxonomy owner is selected.
2. The source/workspace revision is admitted.
3. The producer emits the exact `topic_id`, taxonomy revision, and evidence
   checksum.
4. An independent readback verifies the same identity and revision tuple.
5. Duplicate, stale, missing-evidence, and superseded rows fail closed.
6. A bounded apply manifest and explicit operator authorization exist.

The current helper and SSR report intentionally stop before these gates.

## Current integration

The current board reads:

```text
openspec topic clusters
  -> topic-identity-readiness-v1.json
  -> SSR OpenSpec awareness snapshot
  -> advisory Topics & concepts panel
```

The report records `canonicalAuthority=false` and `writesPerformed=false`.
IndexedDB is not a second source of truth; any future browser cache must be
an ephemeral copy of the SSR snapshot keyed by its report checksum.
