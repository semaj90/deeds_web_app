import { pgTable, serial, text, integer, boolean, timestamp, jsonb, bigserial, uuid, numeric, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const workspaceTasks = pgTable('workspace_tasks', {
  id: serial('id').primaryKey(),
  title: text('title'),
  name: text('name'),
  workspace_id: text('workspace_id'),
  workspaceId: text('workspace_id'),
  feature_id: text('feature_id'),
});

export const taskSemanticPackets = pgTable('task_semantic_packets', {
  id: bigserial('id', { mode: 'number' }).primaryKey().notNull(),
  point_kind: text('point_kind').notNull().default('task_summary'),
  qdrant_point_id: text('qdrant_point_id'),
  workspace_id: text('workspace_id'),
  workspace_task_id: integer('workspace_task_id'),
  feature_id: text('feature_id'),
  alias_id: text('alias_id'),
  source_ref: text('source_ref'),
  file_path: text('file_path'),
  semantic_path: jsonb('semantic_path').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  related_feature_ids: jsonb('related_feature_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  related_task_ids: jsonb('related_task_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  related_file_paths: jsonb('related_file_paths').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  cluster_id: text('cluster_id'),
  centroid_id: text('centroid_id'),
  parent_centroid_id: text('parent_centroid_id'),
  summary_llm: text('summary_llm'),
  summary_model: text('summary_model'),
  next_action: text('next_action'),
  summary_hash: text('summary_hash'),
  confidence: text('confidence'),
  status: text('status').notNull().default('todo'),
  agent_pickup_ready: boolean('agent_pickup_ready').notNull().default(false),
  observed_at: timestamp('observed_at', { withTimezone: true }).defaultNow().notNull(),
  valid_from: timestamp('valid_from', { withTimezone: true }).defaultNow().notNull(),
  valid_to: timestamp('valid_to', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deleted: boolean('deleted').notNull().default(false),
});

export const agentPickupQueue = pgTable('agent_pickup_queue', {
  id: uuid('id').primaryKey().defaultRandom(),
  task_id: text('task_id'),
  packet_id: text('packet_id'),
  status: text('status'),
  lane: text('lane').notNull().default('semantic_packet'),
  picked_up_at: timestamp('picked_up_at'),
  completed_at: timestamp('completed_at'),
  available_at: timestamp('available_at'),
  created_at: timestamp('created_at'),
  updated_at: timestamp('updated_at'),
  attempts: integer('attempts'),
  max_attempts: integer('max_attempts'),
  error: text('error'),
});

export const taskFileLinks = pgTable('task_file_links', {
  id: serial('id').primaryKey(),
  workspace_task_id: integer('workspace_task_id'),
  file_path: text('file_path'),
  created_at: timestamp('created_at'),
});

export const taskClusterLinks = pgTable('task_cluster_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspace_task_id: integer('workspace_task_id').notNull(),
  feature_id: text('feature_id'),
  qdrant_point_id: text('qdrant_point_id').notNull(),
  cluster_id: text('cluster_id'),
  centroid_id: text('centroid_id'),
  relation_kind: text('relation_kind').notNull().default('related'),
  source_ref: text('source_ref'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  taskIdx: index('idx_task_cluster_links_task_id').on(table.workspace_task_id),
  featureIdx: index('idx_task_cluster_links_feature_id').on(table.feature_id),
  clusterIdx: index('idx_task_cluster_links_cluster_id').on(table.cluster_id),
  centroidIdx: index('idx_task_cluster_links_centroid_id').on(table.centroid_id),
}));
