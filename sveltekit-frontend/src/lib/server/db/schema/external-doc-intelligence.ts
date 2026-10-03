/**
 * Runtime Drizzle declarations for the manually-owned external documentation
 * tables. The authoritative DDL remains in
 * `drizzle/manual/20260904_external_doc_intelligence_v1.sql`; these tables are
 * excluded from drizzle-kit generation in `drizzle.config.ts`.
 */
import { sql } from 'drizzle-orm';
import {
	check,
	customType,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
	vector,
} from 'drizzle-orm/pg-core';

const tsvector = customType<{ data: string }>({
	dataType() {
		return 'tsvector';
	},
});

export const atlasExternalDocPages = pgTable(
	'atlas_external_doc_pages',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		provider: text('provider').notNull(),
		product: text('product').notNull(),
		productVersion: text('product_version').notNull(),
		architecture: text('architecture'),
		language: text('language'),
		url: text('url').notNull(),
		title: text('title').notNull(),
		publisher: text('publisher'),
		sourceAuthority: text('source_authority').notNull().default('OFFICIAL'),
		fetcher: text('fetcher').notNull(),
		crawlRevision: text('crawl_revision').notNull(),
		parserRevision: text('parser_revision').notNull(),
		contentHash: text('content_hash').notNull(),
		evidenceRevision: text('evidence_revision').notNull(),
		retrievedAt: timestamp('retrieved_at', { withTimezone: true }).notNull().defaultNow(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		unique('atlas_external_doc_pages_identity_uq').on(
			table.provider,
			table.product,
			table.productVersion,
			table.url,
		),
		unique('atlas_external_doc_pages_evidence_revision_uq').on(table.evidenceRevision),
		check(
			'atlas_external_doc_pages_source_authority_check',
			sql`${table.sourceAuthority} IN ('OFFICIAL', 'COMMUNITY', 'THIRD_PARTY')`,
		),
		index('aedp_product_version_arch').on(table.product, table.productVersion, table.architecture),
		index('aedp_provider_product').on(table.provider, table.product),
		index('aedp_url_trgm').using('gin', sql`${table.url} gin_trgm_ops`),
	],
);

export const atlasExternalDocChunks = pgTable(
	'atlas_external_doc_chunks',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		pageId: uuid('page_id')
			.notNull()
			.references(() => atlasExternalDocPages.id, { onDelete: 'cascade' }),
		chunkId: text('chunk_id').notNull(),
		ordinal: integer('ordinal').notNull(),
		headingPath: text('heading_path').array().notNull().default(sql`'{}'::text[]`),
		sectionAnchor: text('section_anchor'),
		startChar: integer('start_char').notNull(),
		endChar: integer('end_char').notNull(),
		text: text('text').notNull(),
		domainClass: text('domain_class').notNull(),
		ontologyClasses: text('ontology_classes').array().notNull().default(sql`'{}'::text[]`),
		codeBlocks: jsonb('code_blocks')
			.$type<Array<{ language: string; code: string }>>()
			.notNull()
			.default(sql`'[]'::jsonb`),
		apiSignatures: text('api_signatures').array().notNull().default(sql`'{}'::text[]`),
		domainTags: text('domain_tags').array().notNull().default(sql`'{}'::text[]`),
		symbols: text('symbols').array().notNull().default(sql`'{}'::text[]`),
		conceptIds: text('concept_ids').array().notNull().default(sql`'{}'::text[]`),
		chunkChecksum: text('chunk_checksum').notNull(),
		evidenceRevision: text('evidence_revision').notNull(),
		contentEmbedding: vector('content_embedding', { dimensions: 768 }),
		qdrantPointId: text('qdrant_point_id'),
		searchVector: tsvector('search_vector').generatedAlwaysAs(
			sql`to_tsvector('english', coalesce("text", ''))`,
		),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		unique('atlas_external_doc_chunks_chunk_id_uq').on(table.chunkId),
		unique('atlas_external_doc_chunks_evidence_revision_uq').on(table.evidenceRevision),
		index('aedc_page_id_ordinal').on(table.pageId, table.ordinal),
		index('aedc_fts_gin').using('gin', table.searchVector),
		index('aedc_domain_tags_gin').using('gin', table.domainTags),
		index('aedc_symbols_gin').using('gin', table.symbols),
		index('aedc_heading_path_gin').using('gin', table.headingPath),
		index('aedc_api_signatures_gin').using('gin', table.apiSignatures),
		index('aedc_embedding_hnsw')
			.using('hnsw', table.contentEmbedding.op('vector_cosine_ops'))
			.with({ m: '16', ef_construction: '64' }),
	],
);

export type AtlasExternalDocPage = typeof atlasExternalDocPages.$inferSelect;
export type NewAtlasExternalDocPage = typeof atlasExternalDocPages.$inferInsert;
export type AtlasExternalDocChunk = typeof atlasExternalDocChunks.$inferSelect;
export type NewAtlasExternalDocChunk = typeof atlasExternalDocChunks.$inferInsert;
