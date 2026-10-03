# Atlas work-items design v1

Status: DESIGN_ONLY — no Drizzle table or migration is authorized by this
document.

## Ownership

`atlas_work_items` is a future Parent Atlas recommendation/proof ledger. It is
not canonical packet identity, source authority, OpenSpec task authority, or a
replacement for the execution controller. Current task state remains owned by
the OpenSpec controller.

## Proposed Drizzle shape

```ts
atlasWorkItems {
  workItemId: uuid primary key,
  gapId: text not null,
  title: text not null,
  status: recommended | approved | in_progress | validating | proven | rejected,
  owner: text not null,
  sourceRevision: text not null,
  workspaceRevision: text,
  completionEnvelopeRevision: text,
  createdAt: timestamptz not null,
  updatedAt: timestamptz not null,
}

atlasWorkItemEvidence {
  evidenceId: uuid primary key,
  workItemId: uuid references atlasWorkItems(workItemId),
  evidenceKind: text not null,
  evidenceRef: text not null,
  evidenceChecksum: text not null,
  sourceRevision: text not null,
  status: observed | derived | superseded,
  createdAt: timestamptz not null,
}
```

The future migration must be additive, Drizzle-owned, separately approved,
and independently read back. No current writer is defined here.

