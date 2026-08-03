/**
 * CrawledDocument Schema — Zod validation for Crawl4AI output
 *
 * This is the canonical ingest boundary: all web-acquired documents pass through
 * this validation before persisting to Postgres canonical layer.
 *
 * Ownership:
 * - INPUT: Crawl4AI (local, private, JavaScript-rendered pages)
 * - VALIDATION: This schema (contract enforcement)
 * - OUTPUT: Postgres atlas_documents + atlas_chunks (canonical truth)
 */

import { z } from 'zod';

/**
 * Link element from Crawl4AI extraction
 */
export const LinkSchema = z.object({
  href: z.string().url('link href must be a valid URL'),
  rel: z.string().optional(),
  anchor: z.string().optional(),
});

export type Link = z.infer<typeof LinkSchema>;

/**
 * CrawledDocument — validated output from Crawl4AI
 *
 * Must include:
 * - source_url: Original URL requested
 * - canonical_url: Normalized/resolved URL (handles redirects)
 * - title: Document title (from <title> or og:title)
 * - text: Extracted text content (Markdown if available)
 * - language: Detected language (BCP 47)
 * - retrieved_at: ISO timestamp when acquired
 * - content_hash: SHA-256 of normalized text (for deduplication)
 * - domain_class: Inferred domain labels (optional, set by lexical lane later)
 * - access_scope: 'private' | 'workspace' | 'public' (server-injected ACL marking)
 */
export const CrawledDocumentSchema = z.object({
  source_url: z.string().url('source_url must be a valid URL'),
  canonical_url: z.string().url('canonical_url must be a valid URL'),
  title: z.string().min(1, 'title is required').max(512, 'title too long'),
  text: z.string().min(1, 'text content is required').max(1_000_000, 'text too large for single document'),
  language: z.string().default('en').optional(),
  retrieved_at: z.string().datetime('retrieved_at must be ISO 8601 datetime'),
  content_hash: z.string().regex(/^[a-f0-9]{64}$/, 'content_hash must be SHA-256 hex'),
  links: LinkSchema.array().default([]),
  metadata: z.object({
    http_status: z.number().int().optional(),
    media_type: z.string().optional(),
    charset: z.string().optional(),
    headers: z.record(z.string(), z.string()).optional(),
  }).default({}),
  domain_class: z.string().array().default([]),
  access_scope: z.enum(['private', 'workspace', 'public']).default('private'),
});

export type CrawledDocument = z.infer<typeof CrawledDocumentSchema>;

/**
 * Validate a Crawl4AI response against the CrawledDocument schema
 *
 * Throws ZodError if validation fails. Use .safeParse() for non-throwing validation.
 */
export function validateCrawledDocument(data: unknown): CrawledDocument {
  return CrawledDocumentSchema.parse(data);
}

/**
 * Safe validation (returns error object instead of throwing)
 */
export function validateCrawledDocumentSafe(data: unknown) {
  return CrawledDocumentSchema.safeParse(data);
}

/**
 * AtlasArtifactV1 — unified envelope for both CODE_SOURCE and WEB_SOURCE
 *
 * Flows from Graphify → Postgres canonical layer
 * All sources (Crawl4AI, code repos, documentation) converge into this shape
 */
export const AtlasArtifactV1Schema = z.object({
  artifactId: z.string().uuid().or(z.string()),
  workspaceId: z.string(),
  artifactKind: z.enum(['source_file', 'web_document', 'documentation_page', 'repository_document', 'api_spec']),
  sourceRef: z.string().min(1, 'sourceRef is required (directory_path/file_path or canonical URL)'),
  sourceRevision: z.string().min(1, 'sourceRevision is required (git commit or web fetch timestamp)'),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/, 'contentHash must be SHA-256 hex'),
  acquisition: z.object({
    provider: z.enum(['git', 'crawl4ai', 'webfetch', 'firecrawl', 'graphify_internal']),
    acquiredAt: z.string().datetime('acquiredAt must be ISO 8601'),
    requestedAt: z.string().datetime('requestedAt must be ISO 8601').optional(),
    httpStatus: z.number().int().optional(),
    mediaType: z.string().optional(),
  }),
  parser: z.object({
    name: z.enum(['tree_sitter', 'ast_grep', 'langextract', 'dom_parser', 'crawl4ai_markdown']),
    revision: z.string().min(1),
    provenance: z.object({
      runId: z.string(),
      parentArtifactId: z.string().optional(),
    }),
  }),
  storage: z.object({
    rawObjectUri: z.string().optional(), // SeaweedFS URI if large
    canonical: z.object({
      text: z.string().min(1),
      spans: z.object({
        start: z.number().int().nonnegative(),
        end: z.number().int().nonnegative(),
        kind: z.enum(['symbol', 'citation', 'section', 'code_block']),
        identity: z.string().min(1),
      }).array().default([]),
    }),
  }),
  status: z.enum(['VERIFIED', 'DEGRADED', 'FAILED']),
  tags: z.string().array().default([]),
});

export type AtlasArtifactV1 = z.infer<typeof AtlasArtifactV1Schema>;

/**
 * SearchObservationV1 — ephemeral evidence from SearXNG or other discovery
 *
 * NOT persisted to Postgres canonical layer.
 * Marked as ephemeral in ACE packets; used for discovery only.
 */
export const SearchObservationV1Schema = z.object({
  query: z.string().min(1),
  provider: z.enum(['searxng', 'opencode_websearch']),
  providerRevision: z.string(),
  fetchedAt: z.string().datetime(),
  results: z.object({
    url: z.string().url(),
    title: z.string(),
    snippet: z.string(),
    rank: z.number().int().positive(),
  }).array(),
});

export type SearchObservationV1 = z.infer<typeof SearchObservationV1Schema>;
