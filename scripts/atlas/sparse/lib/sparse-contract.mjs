#!/usr/bin/env node
/**
 * Sparse Representation Contract — Canonical Definition
 *
 * Defines the shape and semantics of sparse vectors, vocabulary registry,
 * and weighted encoding across all sparse lanes.
 */

export const SPARSE_CONTRACT = Object.freeze({
  schemaVersion: 1,

  dense: {
    name: 'content',
    dimension: 768,
    representationName: 'semantic_768',
    model: 'embeddinggemma:latest',
    distance: 'Cosine'
  },

  sparse: {
    name: 'lexical_v1',
    encoderKind: 'code_aware_bm25',
    vocabularyRevision: null,  // Will be set by build-vocabulary step
    weightingRevision: null,   // Will be set by build-vocabulary step
    maxTerms: 256,
    distance: 'Cosine',
    datatype: 'uint32'
  },

  authority: {
    table: 'codebase_chunk_index',
    idColumn: 'id',
    sourceRefColumn: 'relative_path',
    contentHashColumn: 'content_hash',
    contentColumn: 'content',
    embeddingColumn: 'content_embedding'
  },

  vocabulary: {
    table: 'atlas_sparse_vocabulary',
    columns: {
      vocabulary_revision: 'TEXT NOT NULL',
      token_id: 'INTEGER NOT NULL',
      token_text: 'TEXT NOT NULL',
      document_frequency: 'BIGINT NOT NULL',
      corpus_document_count: 'BIGINT NOT NULL',
      token_kind: 'TEXT NOT NULL',
      collision_state: 'TEXT NOT NULL DEFAULT \'NONE\''
    },
    tokenKinds: [
      'full_identifier',
      'identifier_part',
      'path_segment',
      'schema_name',
      'natural_language',
      'operator',
      'literal',
      'class'
    ]
  }
});

export const SPARSE_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
  'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do',
  'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can',
  'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
  'what', 'which', 'who', 'when', 'where', 'why', 'how', 'all', 'each', 'every'
]);

export const SQL_KEYWORDS = new Set([
  'select', 'insert', 'update', 'delete', 'create', 'drop', 'alter', 'table', 'database',
  'from', 'where', 'join', 'on', 'group', 'by', 'order', 'having', 'limit', 'offset',
  'and', 'or', 'not', 'in', 'exists', 'between', 'like', 'is', 'null', 'as'
]);
