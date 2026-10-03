import {
  bigint,
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  vector
} from 'drizzle-orm/pg-core';

/**
 * Drizzle declarations for the OpenSpec evidence fabric.
 *
 * Mirrors drizzle/manual/20261001_openspec_evidence_fabric_v1.sql, ..._v2.sql,
 * ..._task_identity_history_v1.sql and ..._evidence_retrieval_v1.sql (checksums in
 * docs/reports/openspec-evidence-migration-dry-run-v1.json). The SQL files stay the DDL
 * authority; those migrations are NOT applied, so importing this file must not be used to
 * generate or push a migration (see "Drizzle Safety Rule" in CLAUDE.md).
 *
 * Postgres rows here are a derived read model of tasks.md + receipts; docs/reports receipts
 * remain current authority until an applied, readback-proven import exists. Views
 * (openspec_task_current, openspec_task_current_v2, task_evidence_binding) are SQL-only.
 */

export const openspecChanges = pgTable('openspec_changes', {
  changeId: text('change_id').primaryKey(),
  path: text('path').notNull().unique(),
  proposalHash: text('proposal_hash'),
  designHash: text('design_hash'),
  tasksHash: text('tasks_hash').notNull(),
  workspaceRevision: text('workspace_revision').notNull(),
  status: text('status').notNull().default('ACTIVE'),
  inventory: jsonb('inventory').$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const openspecTasks = pgTable(
  'openspec_tasks',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    canonicalTaskKey: text('canonical_task_key').notNull().unique(),
    authorityScope: text('authority_scope').notNull(),
    declaredTaskId: text('declared_task_id'),
    identityKind: text('identity_kind').notNull(),
    lifecycleState: text('lifecycle_state').notNull().default('ACTIVE'),
    currentRevision: bigint('current_revision', { mode: 'number' }).notNull().default(1),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    changeId: text('change_id')
      .notNull()
      .references(() => openspecChanges.changeId),
    taskId: text('task_id').notNull(),
    taskRef: text('task_ref').notNull().unique(),
    taskText: text('task_text').notNull(),
    taskHash: text('task_hash').notNull(),
    declaredChecked: boolean('declared_checked').notNull(),
    taskIdStatus: text('task_id_status').notNull(),
    workspaceRevision: text('workspace_revision').notNull(),
    ownerChangeId: text('owner_change_id')
  },
  (t) => ({
    changeTaskUq: unique('openspec_tasks_change_id_task_id_key').on(t.changeId, t.taskId),
    workspaceRevisionIdx: index('openspec_tasks_workspace_revision_idx').on(
      t.workspaceRevision,
      t.changeId,
      t.declaredChecked
    )
  })
);

export const openspecDependencies = pgTable(
  'openspec_dependencies',
  {
    fromChangeId: text('from_change_id').notNull(),
    fromTaskId: text('from_task_id').notNull(),
    toChangeId: text('to_change_id').notNull(),
    toTaskId: text('to_task_id'),
    edgeType: text('edge_type').notNull(),
    sourceRef: text('source_ref')
  },
  (t) => ({
    pk: primaryKey({
      columns: [t.fromChangeId, t.fromTaskId, t.toChangeId, t.toTaskId, t.edgeType]
    }),
    fromFk: foreignKey({
      columns: [t.fromChangeId, t.fromTaskId],
      foreignColumns: [openspecTasks.changeId, openspecTasks.taskId]
    })
  })
);

export const openspecTaskRevisions = pgTable(
  'openspec_task_revisions',
  {
    taskRowId: bigint('task_row_id', { mode: 'number' })
      .notNull()
      .references(() => openspecTasks.id),
    canonicalTaskKey: text('canonical_task_key')
      .notNull()
      .references(() => openspecTasks.canonicalTaskKey),
    revision: bigint('revision', { mode: 'number' }).notNull(),
    sourcePath: text('source_path').notNull(),
    sourceLine: integer('source_line'),
    sourceAnchor: text('source_anchor'),
    claimText: text('claim_text').notNull(),
    claimHash: text('claim_hash').notNull(),
    declaredChecked: boolean('declared_checked').notNull(),
    workspaceRevision: text('workspace_revision').notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull().defaultNow(),
    observationChecksum: text('observation_checksum').notNull()
  },
  (t) => ({
    pk: primaryKey({ columns: [t.taskRowId, t.revision] }),
    keyRevisionUq: unique('openspec_task_revisions_canonical_task_key_revision_key').on(
      t.canonicalTaskKey,
      t.revision
    ),
    claimHashIdx: index('openspec_task_revisions_claim_hash_idx').on(t.taskRowId, t.claimHash),
    workspaceIdx: index('openspec_task_revisions_workspace_idx').on(
      t.workspaceRevision,
      t.observedAt
    )
  })
);

export const openspecTaskAliases = pgTable(
  'openspec_task_aliases',
  {
    aliasKey: text('alias_key').primaryKey(),
    taskRowId: bigint('task_row_id', { mode: 'number' })
      .notNull()
      .references(() => openspecTasks.id),
    aliasKind: text('alias_kind').notNull(),
    sourceRef: text('source_ref'),
    workspaceRevision: text('workspace_revision').notNull(),
    checksum: text('checksum').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    taskIdx: index('openspec_task_aliases_task_idx').on(t.taskRowId, t.aliasKind)
  })
);

export const evidenceReceipts = pgTable(
  'evidence_receipts',
  {
    evidenceId: text('evidence_id').primaryKey(),
    schemaVersion: text('schema_version').notNull(),
    evidenceType: text('evidence_type').notNull(),
    changeId: text('change_id').notNull(),
    taskId: text('task_id').notNull(),
    claim: text('claim').notNull(),
    gitCommit: text('git_commit'),
    workspaceRevision: text('workspace_revision').notNull(),
    sourceRevision: text('source_revision'),
    graphRevision: text('graph_revision'),
    representationRevision: text('representation_revision'),
    producer: text('producer').notNull(),
    command: text('command'),
    inputs: jsonb('inputs').$type<unknown[]>().notNull().default([]),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
    exitCode: integer('exit_code'),
    assertions: jsonb('assertions').$type<unknown[]>().notNull().default([]),
    outputs: jsonb('outputs').$type<unknown[]>().notNull().default([]),
    checksum: text('checksum').notNull().unique(),
    verifier: text('verifier'),
    readback: jsonb('readback').$type<Record<string, unknown>>().notNull().default({}),
    verdict: text('verdict').notNull(),
    // added by the task-identity-history migration
    canonicalTaskKey: text('canonical_task_key').references(() => openspecTasks.canonicalTaskKey),
    taskRevision: bigint('task_revision', { mode: 'number' })
  },
  (t) => ({
    taskRevisionIdx: index('evidence_receipts_task_revision_idx').on(
      t.changeId,
      t.taskId,
      t.workspaceRevision,
      t.verdict
    ),
    stateRevisionIdx: index('evidence_receipts_state_revision_idx').on(
      t.verdict,
      t.workspaceRevision,
      t.changeId,
      t.taskId
    )
  })
);

export const taskEvidence = pgTable(
  'task_evidence',
  {
    changeId: text('change_id').notNull(),
    taskId: text('task_id').notNull(),
    evidenceId: text('evidence_id')
      .notNull()
      .references(() => evidenceReceipts.evidenceId),
    predicate: text('predicate').notNull(),
    relation: text('relation').notNull()
  },
  (t) => ({
    pk: primaryKey({ columns: [t.changeId, t.taskId, t.evidenceId, t.predicate] }),
    taskFk: foreignKey({
      columns: [t.changeId, t.taskId],
      foreignColumns: [openspecTasks.changeId, openspecTasks.taskId]
    })
  })
);

export const openspecEvidenceChunks = pgTable(
  'openspec_evidence_chunks',
  {
    chunkId: text('chunk_id').primaryKey(),
    canonicalId: text('canonical_id').notNull(),
    changeId: text('change_id').notNull(),
    taskId: text('task_id').notNull(),
    evidenceId: text('evidence_id').references(() => evidenceReceipts.evidenceId),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 768 }),
    workspaceRevision: text('workspace_revision').notNull(),
    sourceRevision: text('source_revision'),
    representationRevision: text('representation_revision').notNull().default('semantic_768'),
    checksum: text('checksum').notNull().unique()
  },
  (t) => ({
    taskFk: foreignKey({
      columns: [t.changeId, t.taskId],
      foreignColumns: [openspecTasks.changeId, openspecTasks.taskId]
    }),
    metadataIdx: index('openspec_evidence_chunks_metadata_idx').on(
      t.changeId,
      t.taskId,
      t.workspaceRevision,
      t.representationRevision
    )
  })
);

export const openspecTaskPredicate = pgTable(
  'openspec_task_predicate',
  {
    predicateId: text('predicate_id').primaryKey(),
    changeId: text('change_id').notNull(),
    taskId: text('task_id').notNull(),
    predicateOrdinal: integer('predicate_ordinal').notNull(),
    predicateKind: text('predicate_kind').notNull(),
    predicateText: text('predicate_text').notNull(),
    sourceRef: text('source_ref').notNull(),
    workspaceRevision: text('workspace_revision').notNull(),
    sourceRevision: text('source_revision').notNull(),
    checksum: text('checksum').notNull().unique()
  },
  (t) => ({
    taskFk: foreignKey({
      columns: [t.changeId, t.taskId],
      foreignColumns: [openspecTasks.changeId, openspecTasks.taskId]
    }),
    ordinalUq: unique('openspec_task_predicate_change_id_task_id_predicate_ordinal_key').on(
      t.changeId,
      t.taskId,
      t.predicateOrdinal
    ),
    taskIdx: index('openspec_task_predicate_task_idx').on(t.changeId, t.taskId, t.workspaceRevision)
  })
);

export const evidenceAssertion = pgTable(
  'evidence_assertion',
  {
    evidenceId: text('evidence_id')
      .notNull()
      .references(() => evidenceReceipts.evidenceId),
    assertionId: text('assertion_id').notNull(),
    expected: text('expected').notNull(),
    actual: text('actual').notNull(),
    passed: boolean('passed').notNull(),
    checksum: text('checksum').notNull()
  },
  (t) => ({
    pk: primaryKey({ columns: [t.evidenceId, t.assertionId] }),
    checksumUq: unique('evidence_assertion_evidence_id_checksum_key').on(t.evidenceId, t.checksum),
    passedIdx: index('evidence_assertion_passed_idx').on(t.evidenceId, t.passed)
  })
);

export const openspecSupersession = pgTable(
  'openspec_supersession',
  {
    supersessionId: text('supersession_id').primaryKey(),
    priorChangeId: text('prior_change_id')
      .notNull()
      .references(() => openspecChanges.changeId),
    successorChangeId: text('successor_change_id')
      .notNull()
      .references(() => openspecChanges.changeId),
    sourceRef: text('source_ref').notNull(),
    declaration: text('declaration').notNull(),
    workspaceRevision: text('workspace_revision').notNull(),
    checksum: text('checksum').notNull().unique()
  },
  (t) => ({
    successorIdx: index('openspec_supersession_successor_idx').on(
      t.successorChangeId,
      t.workspaceRevision
    )
  })
);

export const OPENSPEC_EVIDENCE_TABLES_V1 = {
  openspecChanges,
  openspecTasks,
  openspecDependencies,
  openspecTaskRevisions,
  openspecTaskAliases,
  evidenceReceipts,
  taskEvidence,
  openspecEvidenceChunks,
  openspecTaskPredicate,
  evidenceAssertion,
  openspecSupersession
} as const;
