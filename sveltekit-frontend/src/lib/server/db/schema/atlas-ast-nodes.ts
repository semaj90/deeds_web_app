import { pgTable, text, integer, bigint, timestamp, index } from 'drizzle-orm/pg-core';

/**
 * atlas_ast_nodes
 *
 * Structural AST identity nodes produced by tree-sitter (or equivalent parser).
 * tree_node_id = sha256(repo+path+language+kind+symbol+parent_key+signature)
 *
 * Distinct from atlas_tree_nodes (document hierarchy ledger).
 * This table carries per-symbol structural identity for code; atlas_tree_nodes
 * carries document → page → section → chunk hierarchy for legal/doc content.
 *
 * Manual migration: drizzle/manual/20260716_atlas_ast_and_source_ref.sql
 */
export const atlasAstNodes = pgTable('atlas_ast_nodes', {
  // stable identity
  treeNodeId:           text('tree_node_id').primaryKey(),               // sha256 hex 64 chars
  structuralKey:        text('structural_key').notNull().unique(),        // human-readable identity string
  repoId:               text('repo_id').notNull().default('deeds-web-app'),
  relativePath:         text('relative_path').notNull(),
  nodeKind:             text('node_kind').notNull(),                      // file|class|function|method|...
  qualifiedSymbol:      text('qualified_symbol').notNull().default(''),
  parserLanguage:       text('parser_language').notNull().default('typescript'),

  // normalized signature for overload disambiguation (types only, no param names)
  normalizedSignature:  text('normalized_signature').notNull().default(''),

  // parent link
  parentTreeNodeId:     text('parent_tree_node_id'),                     // self-ref (no FK: deferred constraint in DB)

  // versioned span metadata (NOT part of identity)
  startByte:            bigint('start_byte', { mode: 'number' }),
  endByte:              bigint('end_byte', { mode: 'number' }),
  lineStart:            integer('line_start').notNull().default(0),
  lineEnd:              integer('line_end').notNull().default(0),

  // version hashes
  normalizedNodeHash:   text('normalized_node_hash').notNull(),           // sha256 of normalized AST subtree JSON
  sourceContentHash:    text('source_content_hash').notNull(),            // sha256 of raw span bytes

  // parser
  parserName:           text('parser_name').notNull().default('tree-sitter'),
  parserVersion:        text('parser_version'),

  // supersession
  supersededBy:         text('superseded_by'),                           // FK → self (deferred in DB)

  // provenance
  sourceRefKey:         text('source_ref_key'),                          // link to atlas_source_refs

  // meta
  createdAt:            timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt:            timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  repoPathIdx:       index('idx_atlas_ast_nodes_relative_path').on(t.repoId, t.relativePath),
  kindIdx:           index('idx_atlas_ast_nodes_kind').on(t.nodeKind),
  symbolIdx:         index('idx_atlas_ast_nodes_symbol').on(t.qualifiedSymbol),
  parentIdx:         index('idx_atlas_ast_nodes_parent').on(t.parentTreeNodeId),
  contentHashIdx:    index('idx_atlas_ast_nodes_source_content_hash').on(t.sourceContentHash),
}));

export type AtlasAstNode    = typeof atlasAstNodes.$inferSelect;
export type NewAtlasAstNode = typeof atlasAstNodes.$inferInsert;

/**
 * atlas_source_refs
 *
 * Structured source reference objects — replaces flat source_ref strings
 * with a validated structural contract.
 *
 * Composite PK: (source_ref_key, repo_id) defined in DB via manual migration
 * Manual migration: drizzle/manual/20260716_atlas_ast_and_source_ref.sql
 */
export const atlasSourceRefs = pgTable('atlas_source_refs', {
  // identity — composite PK (source_ref_key, repo_id) defined in DB via manual migration
  sourceRefKey:        text('source_ref_key').notNull(),                 // "path/file.ts#Symbol"
  repoId:              text('repo_id').notNull().default('deeds-web-app'),
  sourceType:          text('source_type').notNull().default('code'),    // code|legal|documentation|git|video|transcript|web
  relativePath:        text('relative_path'),                            // "src/lib/server/auth.ts"
  contentHash:         text('content_hash').notNull(),                   // sha256 of span content

  // symbol
  qualifiedSymbol:     text('qualified_symbol'),                         // "ClassName.methodName"
  symbolKind:          text('symbol_kind'),                              // file|module|class|interface|...

  // span (versioned metadata — NOT identity)
  startByte:           bigint('start_byte', { mode: 'number' }),
  endByte:             bigint('end_byte', { mode: 'number' }),
  startLine:           integer('start_line'),
  startColumn:         integer('start_column'),
  endLine:             integer('end_line'),
  endColumn:           integer('end_column'),

  // hierarchy
  parentSourceRefKey:  text('parent_source_ref_key'),                    // FK → self (deferred in DB)

  // fragments (compact JSONB array stored as text; cast at query time if needed)
  fragments:           text('fragments').notNull().default('[]'),

  // parser
  parserName:          text('parser_name'),
  parserVersion:       text('parser_version'),

  // versioning
  commitSha:           text('commit_sha'),
  corpusVersion:       text('corpus_version'),
  effectiveFrom:       timestamp('effective_from', { withTimezone: true }),
  effectiveTo:         timestamp('effective_to', { withTimezone: true }),

  // meta
  createdAt:           timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt:           timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  repPathIdx:     index('idx_atlas_source_refs_repo_path').on(t.repoId, t.relativePath),
  symbolKindIdx:  index('idx_atlas_source_refs_symbol_kind').on(t.symbolKind),
  parentIdx:      index('idx_atlas_source_refs_parent').on(t.parentSourceRefKey),
  contentHashIdx: index('idx_atlas_source_refs_content_hash').on(t.contentHash),
}));

export type AtlasSourceRef    = typeof atlasSourceRefs.$inferSelect;
export type NewAtlasSourceRef = typeof atlasSourceRefs.$inferInsert;
