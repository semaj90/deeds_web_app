import { sql } from 'drizzle-orm';
import { pgTable, text, uuid, integer, jsonb, timestamp, index, unique } from 'drizzle-orm/pg-core';

/**
 * atlas_tree_nodes
 *
 * Document hierarchy tree structure (PageIndex-style).
 * Preserves document → page → section → subsection → chunk relationships.
 * Links to atlas_packets via packet_key or source_ref.
 *
 * Not the packet identity source (that's atlas_packets).
 * Contextual tree for hierarchical navigation and multi-step reasoning.
 */

export const atlasTreeNodes = pgTable('atlas_tree_nodes', {
  nodeId: uuid('node_id').primaryKey().defaultRandom(),
  parentId: uuid('parent_id').references(() => atlasTreeNodes.nodeId, { onDelete: 'cascade' }),
  rootId: uuid('root_id').notNull(),

  // Tree structure & navigation
  pageIndexPath: text('page_index_path').notNull(), // "doc:123/page:5/section:2/chunk:8"
  nodeType: text('node_type').notNull(), // 'document'|'page'|'section'|'subsection'|'chunk'
  treeDepth: integer('tree_depth').notNull().default(0), // 0=document, 1=page, ..., N=chunk

  // Content identity (align with atlas_packets)
  sourceRef: text('source_ref').notNull(), // canonical file path
  filePath: text('file_path').notNull(), // full file path
  fileUrl: text('file_url'), // S3/SeaweedFS URL
  packetKey: text('packet_key'), // atlas identity (if chunk level)
  featureId: text('feature_id'), // semantic feature (nullable)

  // Content summary
  title: text('title'), // node title/heading
  summary: text('summary'), // 100-300 char summary
  contentPreview: text('content_preview'), // first 500 chars
  pageStart: integer('page_start'), // start page (for pagination)
  pageEnd: integer('page_end'), // end page

  // Enrichment
  keywords: text('keywords').array(), // extracted keywords
  tags: text('tags').array(), // semantic tags
  ontology: jsonb('ontology'), // domain ontology mapping
  domain: text('domain'), // semantic domain
  somCluster: integer('som_cluster'), // SOM grid cell
  communityId: integer('community_id'), // community partition

  // Lineage & metadata
  metadata: jsonb('metadata').default({}), // flexible metadata envelope
  ledgerType: text('ledger_type').default('canonical'), // 'canonical'|'legacy'|'synthetic'
  lineageVersion: text('lineage_version').default('tree-nodes-v1'),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  // Identity indexes (fast joins to atlas_packets)
  sourceRefIdx: index('idx_atlas_tree_nodes_source_ref').on(table.sourceRef),
  packetKeyIdx: index('idx_atlas_tree_nodes_packet_key').on(table.packetKey),
  featureIdIdx: index('idx_atlas_tree_nodes_feature_id').on(table.featureId),

  // Tree navigation indexes
  parentIdIdx: index('idx_atlas_tree_nodes_parent_id').on(table.parentId),
  rootIdIdx: index('idx_atlas_tree_nodes_root_id').on(table.rootId),
  pageIndexPathIdx: index('idx_atlas_tree_nodes_page_index_path').on(table.pageIndexPath),
  filePathIdx: index('idx_atlas_tree_nodes_file_path').on(table.filePath),

  // Node classification
  nodeTypeIdx: index('idx_atlas_tree_nodes_node_type').on(table.nodeType),
  treeDepthIdx: index('idx_atlas_tree_nodes_tree_depth').on(table.treeDepth),

  // Enrichment & clustering
  somCommunityIdx: index('idx_atlas_tree_nodes_som_community').on(table.somCluster, table.communityId),
  domainIdx: index('idx_atlas_tree_nodes_domain').on(table.domain, table.title),

  // Flexible metadata search
  tagsGin: index('idx_atlas_tree_nodes_tags_gin').using('gin', table.tags),
  keywordsGin: index('idx_atlas_tree_nodes_keywords_gin').using('gin', table.keywords),
  metadataGin: index('idx_atlas_tree_nodes_metadata_gin').using('gin', table.metadata),

  // Expression indexes: hot metadata keys
  qdrantCollectionIdx: index('idx_atlas_tree_nodes_qdrant_collection')
    .on(sql`(${table.metadata}->>'qdrant_collection')`),
  neo4jNodeIdIdx: index('idx_atlas_tree_nodes_neo4j_node_id')
    .on(sql`(${table.metadata}->>'neo4j_node_id')`),
  serverPathIdx: index('idx_atlas_tree_nodes_server_path')
    .on(sql`(${table.metadata}->>'server_path')`),
  packageNameIdx: index('idx_atlas_tree_nodes_package_name')
    .on(sql`(${table.metadata}->>'package_name')`),
}));

export type AtlasTreeNode = typeof atlasTreeNodes.$inferSelect;
export type NewAtlasTreeNode = typeof atlasTreeNodes.$inferInsert;
