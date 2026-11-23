import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { cases } from '../schema-postgres.js';
import type { SceneGenerationPlanV1 } from '$lib/reconstruction/scene-generation-plan-v1.js';

export type SceneGenerationInputKindV1 = 'BLOCKOUT' | 'EVIDENCE_BACKED';
export type SceneGenerationJobStatusV1 = 'queued' | 'running' | 'completed' | 'failed' | 'canceled' | 'source_missing' | 'source_stale';

export interface SceneGenerationJobSourceSnapshotV1 {
	evidenceId: string;
	sourceRevision: string;
	sha256: string;
}

/** Orchestration only: the scene document revision remains the saved scene owner. */
export const sceneGenerationJobs = pgTable('scene_generation_jobs', {
	jobId: uuid('job_id').primaryKey().defaultRandom(),
	caseId: uuid('case_id').notNull().references(() => cases.id, { onDelete: 'restrict' }),
	sceneId: uuid('scene_id').notNull(),
	createdBy: integer('created_by').notNull(),
	inputKind: text('input_kind').$type<SceneGenerationInputKindV1>().notNull(),
	expectedSceneRevision: integer('expected_scene_revision').notNull(),
	requestSha256: text('request_sha256').notNull(),
	idempotencyKey: text('idempotency_key').notNull(),
	requestSnapshot: jsonb('request_snapshot').$type<SceneGenerationPlanV1>().notNull(),
	sourceSnapshot: jsonb('source_snapshot').$type<SceneGenerationJobSourceSnapshotV1[]>().notNull().default([]),
	status: text('status').$type<SceneGenerationJobStatusV1>().notNull().default('queued'),
	progress: integer('progress').notNull().default(0),
	attemptCount: smallint('attempt_count').notNull().default(0),
	maxAttempts: smallint('max_attempts').notNull().default(3),
	availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
	workerId: text('worker_id'),
	leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
	errorCode: text('error_code'),
	resultRefs: jsonb('result_refs').$type<Array<Record<string, unknown>>>().notNull().default([]),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	startedAt: timestamp('started_at', { withTimezone: true }),
	completedAt: timestamp('completed_at', { withTimezone: true })
}, (table) => [
	uniqueIndex('scene_generation_jobs_case_scene_idempotency_uq').on(table.caseId, table.sceneId, table.idempotencyKey),
	index('scene_generation_jobs_claim_idx').on(table.availableAt, table.createdAt, table.jobId).where(sql`status = 'queued'`),
	index('scene_generation_jobs_case_scene_idx').on(table.caseId, table.sceneId, table.createdAt.desc()),
	check('scene_generation_jobs_input_kind_ck', sql`${table.inputKind} in ('BLOCKOUT', 'EVIDENCE_BACKED')`),
	check('scene_generation_jobs_expected_revision_ck', sql`${table.expectedSceneRevision} >= 0`),
	check('scene_generation_jobs_request_sha_ck', sql`${table.requestSha256} ~ '^[0-9a-f]{64}$'`),
	check('scene_generation_jobs_idempotency_ck', sql`${table.idempotencyKey} ~ '^[0-9a-f]{64}$'`),
	check('scene_generation_jobs_request_object_ck', sql`jsonb_typeof(${table.requestSnapshot}) = 'object'`),
	check('scene_generation_jobs_request_size_ck', sql`pg_column_size(${table.requestSnapshot}) <= 1048576`),
	check('scene_generation_jobs_source_array_ck', sql`jsonb_typeof(${table.sourceSnapshot}) = 'array'`),
	check('scene_generation_jobs_status_ck', sql`${table.status} in ('queued', 'running', 'completed', 'failed', 'canceled', 'source_missing', 'source_stale')`),
	check('scene_generation_jobs_progress_ck', sql`${table.progress} between 0 and 100`),
	check('scene_generation_jobs_attempt_count_ck', sql`${table.attemptCount} between 0 and 5`),
	check('scene_generation_jobs_max_attempts_ck', sql`${table.maxAttempts} between 1 and 5`),
	check('scene_generation_jobs_source_kind_ck', sql`(${table.inputKind} = 'BLOCKOUT' and jsonb_array_length(${table.sourceSnapshot}) = 0) or (${table.inputKind} = 'EVIDENCE_BACKED' and jsonb_array_length(${table.sourceSnapshot}) > 0)`),
	check('scene_generation_jobs_attempt_limit_ck', sql`${table.attemptCount} <= ${table.maxAttempts}`),
	check('scene_generation_jobs_lease_ck', sql`(${table.status} = 'running' and ${table.workerId} is not null and ${table.leaseExpiresAt} is not null) or (${table.status} <> 'running' and ${table.workerId} is null and ${table.leaseExpiresAt} is null)`),
	check('scene_generation_jobs_result_array_ck', sql`jsonb_typeof(${table.resultRefs}) = 'array'`)
]);

export const sceneGenerationJobEvents = pgTable('scene_generation_job_events', {
	eventId: uuid('event_id').primaryKey().defaultRandom(),
	jobId: uuid('job_id').notNull().references(() => sceneGenerationJobs.jobId, { onDelete: 'restrict' }),
	sequence: integer('sequence').notNull(),
	fromStatus: text('from_status').$type<SceneGenerationJobStatusV1 | null>(),
	toStatus: text('to_status').$type<SceneGenerationJobStatusV1>().notNull(),
	reasonCode: text('reason_code').notNull(),
	details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [
	uniqueIndex('scene_generation_job_events_job_sequence_uq').on(table.jobId, table.sequence),
	index('scene_generation_job_events_job_idx').on(table.jobId, table.sequence),
	check('scene_generation_job_events_sequence_ck', sql`${table.sequence} >= 1`),
	check('scene_generation_job_events_from_status_ck', sql`${table.fromStatus} is null or ${table.fromStatus} in ('queued', 'running', 'completed', 'failed', 'canceled', 'source_missing', 'source_stale')`),
	check('scene_generation_job_events_to_status_ck', sql`${table.toStatus} in ('queued', 'running', 'completed', 'failed', 'canceled', 'source_missing', 'source_stale')`),
	check('scene_generation_job_events_details_object_ck', sql`jsonb_typeof(${table.details}) = 'object'`)
]);

export type SceneGenerationJobV1 = typeof sceneGenerationJobs.$inferSelect;
export type NewSceneGenerationJobV1 = typeof sceneGenerationJobs.$inferInsert;
export type SceneGenerationJobEventV1 = typeof sceneGenerationJobEvents.$inferSelect;
