import { pgTable, serial, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core';

export const workspaceTasks = pgTable('workspace_tasks', {
  id: serial('id').primaryKey(),
  title: text('title'),
  name: text('name'),
  workspace_id: text('workspace_id'),
  workspaceId: text('workspace_id'),
  feature_id: text('feature_id'),
});

export const taskSemanticPackets = pgTable('task_semantic_packets', {
  id: serial('id').primaryKey(),
  qdrant_point_id: text('qdrant_point_id'),
  workspace_task_id: integer('workspace_task_id'),
  feature_id: text('feature_id'),
  summary_model: text('summary_model'),
  summary_hash: text('summary_hash'),
  confidence: text('confidence'),
  status: text('status'),
  agent_pickup_ready: boolean('agent_pickup_ready'),
  created_at: timestamp('created_at'),
  updated_at: timestamp('updated_at'),
  deleted: boolean('deleted'),
});

export const agentPickupQueue = pgTable('agent_pickup_queue', {
  id: serial('id').primaryKey(),
  task_id: text('task_id'),
  packet_id: text('packet_id'),
  status: text('status'),
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
