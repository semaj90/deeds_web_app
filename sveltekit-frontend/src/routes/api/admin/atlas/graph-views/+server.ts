import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { requireAdmin } from '$lib/server/auth-utils.js';
import { readGraphViewV1, type GraphViewLoadersV1 } from '$lib/server/atlas/graph/graph-view-service-v1.js';

type GroupRow = { group_id: string; group_label: string; parent_group_id: string | null; taxonomy_level: number | null };
type LinkRow = { source_ref: string; packet_key: string | null; domain_class: string; domain_confidence: number | null };

const loaders: GraphViewLoadersV1 = {
  // Read-only. Classifier output only ever reaches the view as PROPOSED.
  domain: async (req) => {
    const groups = await db.execute<GroupRow>(sql`
      SELECT group_id, group_label, parent_group_id, taxonomy_level, updated_at
      FROM atlas_domain_ontology ORDER BY taxonomy_level NULLS FIRST, group_id LIMIT ${req.limit}`);
    const links = await db.execute<LinkRow>(sql`
      SELECT source_ref, packet_key, domain_class, domain_confidence
      FROM atlas_document_classification
      WHERE domain_class IS NOT NULL
        AND (${req.q ?? null}::text IS NULL OR source_ref ILIKE '%' || ${req.q ?? ''} || '%')
      ORDER BY domain_confidence DESC NULLS LAST, source_ref LIMIT ${req.limit}`);
    const stamp = await db.execute<{ rev: string | null }>(sql`SELECT max(updated_at)::text AS rev FROM atlas_domain_ontology`);
    return {
      taxonomyRevision: `atlas_domain_ontology@${stamp.rows[0]?.rev ?? 'empty'}`,
      groups: groups.rows.map((g) => ({
        groupId: g.group_id, groupLabel: g.group_label, parentGroupId: g.parent_group_id, taxonomyLevel: g.taxonomy_level,
      })),
      links: links.rows.map((l) => ({
        sourceRef: l.source_ref, packetKey: l.packet_key, groupId: l.domain_class,
        origin: 'CLASSIFIER' as const, confidence: l.domain_confidence ?? 0,
      })),
    };
  },
  // Deterministic wikilink extraction over codebase chunks
  knowledge: async (req) => {
    const rows = await db.execute<{
      source_ref: string;
      file_content_hash: string | null;
      content: string;
      packet_key: string | null;
    }>(sql`
      SELECT source_ref, file_content_hash, content, packet_key
      FROM codebase_chunk_index
      WHERE (${req.q ?? null}::text IS NULL OR content ILIKE '%' || ${req.q ?? ''} || '%')
      LIMIT ${req.limit}`);
    return rows.rows.map((r) => ({
      sourceRef: r.source_ref,
      sourceRevision: r.file_content_hash ?? 'unknown',
      text: r.content,
      packetKey: r.packet_key,
    }));
  },
  // Neo4j HyperedgeMirrorV1 sample (derived, canonicalAuthority:false). Read-mode session; the loader is bounded and tested with a fake session.
  hypergraph: async (req) => {
    const { getNeo4jDriver } = await import('$lib/server/neo4j-driver.js');
    const { loadHypergraphRowsV1 } = await import('$lib/server/atlas/graph/hypergraph-neo4j-loader-v1.js');
    return loadHypergraphRowsV1(req, () => {
      const session = getNeo4jDriver().session({ database: 'neo4j', defaultAccessMode: 'READ' });
      return { run: (cypher, params) => session.run(cypher, params), close: () => session.close() };
    });
  },
  // Event tables are not deployed yet; degrade explicitly instead of inventing rows.
  timeline: async () => {
    const probe = await db.execute<{ t: string | null }>(sql`SELECT to_regclass('public.atlas_workspace_events')::text AS t`);
    if (!probe.rows[0]?.t) throw new Error('TEMPORAL_TABLES_ABSENT');
    throw new Error('TIMELINE_LOADER_NOT_IMPLEMENTED');
  },
};

export const GET: RequestHandler = async (event) => {
  requireAdmin(event);
  const raw = Object.fromEntries(event.url.searchParams.entries());
  const { status, body } = await readGraphViewV1(raw, loaders);
  return json(body, { status });
};
