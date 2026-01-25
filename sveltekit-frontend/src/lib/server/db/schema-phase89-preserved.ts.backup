/**
 * Phase 89 Tables Schema
 *
 * These tables exist in the database and contain valuable error analysis data.
 * They are defined here to prevent Drizzle from attempting to delete them.
 *
 * DO NOT DELETE - Contains ~1.2 million records of error analysis data
 */

import { pgTable, text, integer, timestamp, jsonb, boolean, doublePrecision, uuid, serial, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ============================================================
// Knowledge Graph Tables
// ============================================================

export const kgNodes = pgTable('kg_nodes', {
  id: serial('id').primaryKey(),
  nodeType: text('node_type'),
  label: text('label'),
  properties: jsonb('properties'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const cpgNodes = pgTable('cpg_nodes', {
  id: serial('id').primaryKey(),
  nodeType: text('node_type'),
  filePath: text('file_path'),
  name: text('name'),
  properties: jsonb('properties'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const cpgEdges = pgTable('cpg_edges', {
  id: serial('id').primaryKey(),
  sourceId: integer('source_id'),
  targetId: integer('target_id'),
  edgeType: text('edge_type'),
  properties: jsonb('properties'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================
// Error Analysis Tables
// ============================================================

export const tsErrors = pgTable('ts_errors', {
  id: serial('id').primaryKey(),
  filePath: text('file_path'),
  line: integer('line'),
  column: integer('column'),
  errorCode: text('error_code'),
  message: text('message'),
  severity: text('severity'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const errorTopkIndex = pgTable('error_topk_index', {
  id: serial('id').primaryKey(),
  errorCode: text('error_code'),
  filePath: text('file_path'),
  count: integer('count'),
  rank: integer('rank'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const rawErrorEmbeddings = pgTable('raw_error_embeddings', {
  id: serial('id').primaryKey(),
  errorHash: text('error_hash'),
  embedding: jsonb('embedding'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const aceErrorEmbeddings = pgTable('ace_error_embeddings', {
  id: serial('id').primaryKey(),
  errorId: text('error_id'),
  embedding: jsonb('embedding'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================
// Phase 89 Specific Tables
// ============================================================

export const phase89Embeddings = pgTable('phase89_embeddings', {
  id: serial('id').primaryKey(),
  errorHash: text('error_hash'),
  embedding: jsonb('embedding'),
  metadata: jsonb('metadata'),
  dimensions: integer('dimensions'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const phase89ErrorInstances = pgTable('phase89_error_instances', {
  id: serial('id').primaryKey(),
  errorHash: text('error_hash'),
  filePath: text('file_path'),
  line: integer('line'),
  column: integer('column'),
  message: text('message'),
  code: text('code'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const phase89ErrorClusters = pgTable('phase89_error_clusters', {
  id: serial('id').primaryKey(),
  clusterId: text('cluster_id'),
  centroid: jsonb('centroid'),
  memberCount: integer('member_count'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const phase89CollectionSummaries = pgTable('phase89_collection_summaries', {
  id: serial('id').primaryKey(),
  collectionName: text('collection_name'),
  summary: text('summary'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const phase89Timeline = pgTable('phase89_timeline', {
  id: serial('id').primaryKey(),
  eventType: text('event_type'),
  eventData: jsonb('event_data'),
  timestamp: timestamp('timestamp').defaultNow(),
});

export const phase89CosineRankings = pgTable('phase89_cosine_rankings', {
  id: serial('id').primaryKey(),
  queryHash: text('query_hash'),
  rankings: jsonb('rankings'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const phase89KbCards = pgTable('phase89_kb_cards', {
  id: serial('id').primaryKey(),
  title: text('title'),
  content: text('content'),
  tags: jsonb('tags'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const phase89VectorEvents = pgTable('phase89_vector_events', {
  id: serial('id').primaryKey(),
  eventType: text('event_type'),
  vectorData: jsonb('vector_data'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const phase89VectorEventsVlm = pgTable('phase89_vector_events_vlm', {
  id: serial('id').primaryKey(),
  eventType: text('event_type'),
  vectorData: jsonb('vector_data'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const phase89ImportEdges = pgTable('phase89_import_edges', {
  id: serial('id').primaryKey(),
  sourceFile: text('source_file'),
  targetFile: text('target_file'),
  importType: text('import_type'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const phase89UnitIndex = pgTable('phase89_unit_index', {
  id: serial('id').primaryKey(),
  unitType: text('unit_type'),
  unitName: text('unit_name'),
  filePath: text('file_path'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const phase89AgenticCalls = pgTable('phase89_agentic_calls', {
  id: serial('id').primaryKey(),
  callId: text('call_id'),
  toolName: text('tool_name'),
  input: jsonb('input'),
  output: jsonb('output'),
  duration: integer('duration'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const phase89AstSignatures = pgTable('phase89_ast_signatures', {
  id: serial('id').primaryKey(),
  filePath: text('file_path'),
  signature: text('signature'),
  nodeType: text('node_type'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const phase89CacheHits = pgTable('phase89_cache_hits', {
  id: serial('id').primaryKey(),
  cacheKey: text('cache_key'),
  hitCount: integer('hit_count'),
  lastHit: timestamp('last_hit'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const phase89EditComparisons = pgTable('phase89_edit_comparisons', {
  id: serial('id').primaryKey(),
  beforeHash: text('before_hash'),
  afterHash: text('after_hash'),
  diff: jsonb('diff'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const phase89EditLog = pgTable('phase89_edit_log', {
  id: serial('id').primaryKey(),
  filePath: text('file_path'),
  editType: text('edit_type'),
  details: jsonb('details'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const phase89FileTimeline = pgTable('phase89_file_timeline', {
  id: serial('id').primaryKey(),
  filePath: text('file_path'),
  events: jsonb('events'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const phase89FixAttempts = pgTable('phase89_fix_attempts', {
  id: serial('id').primaryKey(),
  errorHash: text('error_hash'),
  fixCode: text('fix_code'),
  success: boolean('success'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const phase89RipgrepCache = pgTable('phase89_ripgrep_cache', {
  id: serial('id').primaryKey(),
  query: text('query'),
  results: jsonb('results'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const phase89TagMirror = pgTable('phase89_tag_mirror', {
  id: serial('id').primaryKey(),
  tagName: text('tag_name'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================
// Other Preserved Tables
// ============================================================

export const fileIndex = pgTable('file_index', {
  id: serial('id').primaryKey(),
  filePath: text('file_path'),
  fileType: text('file_type'),
  size: integer('size'),
  hash: text('hash'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const documentEmbeddings = pgTable('document_embeddings', {
  id: serial('id').primaryKey(),
  documentId: text('document_id'),
  embedding: jsonb('embedding'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const multiDbTransactions = pgTable('multi_db_transactions', {
  id: serial('id').primaryKey(),
  transactionId: text('transaction_id'),
  status: text('status'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});

