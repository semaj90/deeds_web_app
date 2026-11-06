import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { SceneDocumentV1 } from '$lib/splat/scene-document-v1.js';
import { cases } from '../schema-postgres.js';

/** Immutable, case-authorized scene manifest revisions. Original bytes remain in object storage. */
export const sceneDocumentRevisions = pgTable(
	'scene_document_revisions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		caseId: uuid('case_id').notNull().references(() => cases.id, { onDelete: 'restrict' }),
		sceneId: uuid('scene_id').notNull(),
		revision: integer('revision').notNull(),
		commandId: uuid('command_id').notNull(),
		parentManifestSha256: text('parent_manifest_sha256'),
		manifestSha256: text('manifest_sha256').notNull(),
		manifest: jsonb('manifest').$type<SceneDocumentV1>().notNull(),
		createdBy: integer('created_by').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		uniqueIndex('scene_document_revisions_case_scene_revision_uq').on(table.caseId, table.sceneId, table.revision),
		uniqueIndex('scene_document_revisions_command_uq').on(table.commandId),
		index('scene_document_revisions_head_idx').on(table.caseId, table.sceneId, table.revision),
		check('scene_document_revisions_revision_check', sql`${table.revision} >= 1`),
		check('scene_document_revisions_manifest_sha_check', sql`${table.manifestSha256} ~ '^[0-9a-f]{64}$'`),
		check('scene_document_revisions_parent_sha_check', sql`${table.parentManifestSha256} is null or ${table.parentManifestSha256} ~ '^[0-9a-f]{64}$'`)
	]
);
