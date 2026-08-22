import type { Pool, PoolClient } from 'pg';
import {
  buildExactPromotionReceipt,
  exactPromotionCandidateSchema,
  exactPromotionEvidenceFactsSchema,
  exactPromotionRevisionAuthoritySchema,
  type ExactPromotionCandidateV1,
  type ExactPromotionEvidenceFactsV1,
  type ExactPromotionReceiptV1,
  type ExactPromotionRevisionAuthorityV1,
} from './exact-promotion.js';

export interface ExactPromotionSourceBytesV1 {
  found: boolean;
  sha256: string | null;
  byte_length: number | null;
  evidence_ref?: string | null;
}

export type ExactPromotionSourceReaderV1 = (
  sourceRef: string,
) => Promise<ExactPromotionSourceBytesV1>;

export interface ExactPromotionExecutorInputV1 {
  request_id: string;
  candidate: ExactPromotionCandidateV1;
  revision_authority: ExactPromotionRevisionAuthorityV1;
  producer_revision: string;
}

export interface ExactPromotionExecutionResultV1 {
  receipt: ExactPromotionReceiptV1;
  transaction: {
    isolation_level: 'REPEATABLE READ';
    read_only: true;
    committed: false;
    rolled_back: true;
  };
}

type PacketRow = {
  packet_key: string;
  source_ref: string;
  workspace_revision: number | string | null;
  representation_revision: number | string | null;
  sha256: string | null;
  tree_node_id: string | null;
};

type SymbolVersionRow = {
  symbol_version_id: string;
  stable_symbol_id: string;
  source_ref: string;
  source_revision: string;
  workspace_revision: string;
  upstream_node_id: string;
};

type AstNodeRow = {
  tree_node_id: string;
  resolved_source_ref: string | null;
  source_revision: string | null;
  source_content_hash: string | null;
};

type SourceRefRow = {
  source_ref_key: string;
  relative_path: string | null;
  content_hash: string;
  commit_sha: string | null;
  corpus_version: string | null;
};

type GraphifyRow = {
  source_ref: string;
  source_revision: string | null;
  content_hash: string | null;
  repository_revision: string | null;
};

function digest(value: unknown): string | null {
  const normalized = String(value ?? '').trim().replace(/^sha256:/, '').toLowerCase();
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : null;
}

function revision(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized : null;
}

async function maybeOne<T>(
  client: PoolClient,
  sql: string,
  values: unknown[],
): Promise<T | null> {
  const result = await client.query<T>(sql, values);
  if (result.rows.length > 1) throw new Error('EXACT_PROMOTION_AMBIGUOUS_READBACK');
  return result.rows[0] ?? null;
}

async function collectFacts(
  client: PoolClient,
  candidate: ExactPromotionCandidateV1,
  sourceReader: ExactPromotionSourceReaderV1,
): Promise<{ facts: ExactPromotionEvidenceFactsV1; sourceEvidenceRef: string | null }> {
  const packet = candidate.packet_key
    ? await maybeOne<PacketRow>(client, `
        SELECT packet_key, source_ref, workspace_revision, representation_revision,
               sha256, tree_node_id::text AS tree_node_id
        FROM atlas_packets
        WHERE packet_key = $1
      `, [candidate.packet_key])
    : null;

  const symbol = candidate.symbol_version_id
    ? await maybeOne<SymbolVersionRow>(client, `
        SELECT symbol_version_id, stable_symbol_id, source_ref, source_revision,
               workspace_revision, upstream_node_id
        FROM atlas_symbol_versions
        WHERE symbol_version_id = $1
      `, [candidate.symbol_version_id])
    : null;

  const ast = candidate.tree_node_id
    ? await maybeOne<AstNodeRow>(client, `
        SELECT a.tree_node_id,
               COALESCE(sr.relative_path, a.relative_path, a.source_ref_key) AS resolved_source_ref,
               a.source_revision,
               a.source_content_hash
        FROM atlas_ast_nodes a
        LEFT JOIN atlas_source_refs sr
          ON sr.source_ref_key = a.source_ref_key
         AND sr.repo_id = a.repo_id
        WHERE a.tree_node_id = $1
      `, [candidate.tree_node_id])
    : null;

  const sourceRef = await maybeOne<SourceRefRow>(client, `
    SELECT source_ref_key, relative_path, content_hash, commit_sha, corpus_version
    FROM atlas_source_refs
    WHERE source_ref_key = $1 OR relative_path = $1
    ORDER BY CASE WHEN source_ref_key = $1 THEN 0 ELSE 1 END
    LIMIT 1
  `, [candidate.source_ref]);

  const graphifyTable = await client.query<{ available: boolean }>(
    `SELECT to_regclass('public.graphify_files') IS NOT NULL
         AND to_regclass('public.graphify_runs') IS NOT NULL AS available`,
  );
  const graphify = graphifyTable.rows[0]?.available
    ? await maybeOne<GraphifyRow>(client, `
        SELECT gf.source_ref, gf.source_revision, gf.content_hash,
               gr.repository_revision
        FROM graphify_files gf
        LEFT JOIN graphify_runs gr ON gr.run_id = gf.last_seen_run_id
        WHERE gf.source_ref = $1
        ORDER BY gr.completed_at DESC NULLS LAST, gf.file_id DESC
        LIMIT 1
      `, [candidate.source_ref])
    : null;

  const sourceBytes = await sourceReader(candidate.source_ref);

  const facts = exactPromotionEvidenceFactsSchema.parse({
    packet_found: packet !== null,
    packet_source_ref: packet?.source_ref ?? null,
    packet_workspace_revision: revision(packet?.workspace_revision),
    packet_representation_revision: revision(packet?.representation_revision),
    packet_sha256: digest(packet?.sha256),
    packet_tree_node_id: packet?.tree_node_id ?? null,

    symbol_version_found: symbol !== null,
    symbol_version_source_ref: symbol?.source_ref ?? null,
    symbol_version_source_revision: revision(symbol?.source_revision),
    symbol_version_workspace_revision: revision(symbol?.workspace_revision),
    symbol_version_stable_symbol_id: symbol?.stable_symbol_id ?? null,
    symbol_version_upstream_node_id: symbol?.upstream_node_id ?? null,

    ast_node_found: ast !== null,
    ast_node_source_ref: ast?.resolved_source_ref ?? null,
    ast_node_source_revision: revision(ast?.source_revision),
    ast_node_content_hash: digest(ast?.source_content_hash),

    source_ref_found: sourceRef !== null,
    source_ref_content_hash: digest(sourceRef?.content_hash),
    source_ref_commit_sha: revision(sourceRef?.commit_sha),
    source_ref_corpus_version: revision(sourceRef?.corpus_version),

    graphify_source_found: graphify !== null,
    graphify_source_revision: revision(graphify?.source_revision),
    graphify_workspace_revision: revision(graphify?.repository_revision),
    graphify_content_hash: digest(graphify?.content_hash),

    source_bytes_found: sourceBytes.found,
    source_bytes_sha256: digest(sourceBytes.sha256),
  });

  return {
    facts,
    sourceEvidenceRef: sourceBytes.evidence_ref?.trim() || null,
  };
}

/**
 * Read-only exact-promotion executor.
 *
 * All database evidence is gathered inside one REPEATABLE READ / READ ONLY
 * transaction. Source bytes are supplied by an injected reader and are never
 * written by this executor. The pure `buildExactPromotionReceipt` policy remains
 * the authority for whether those facts are sufficient to call the evidence
 * PROVEN.
 */
export function createExactPromotionPostgresExecutor(input: {
  pool: Pool;
  sourceReader: ExactPromotionSourceReaderV1;
}) {
  return {
    async execute(raw: ExactPromotionExecutorInputV1): Promise<ExactPromotionExecutionResultV1> {
      const candidate = exactPromotionCandidateSchema.parse(raw.candidate);
      const revisionAuthority = exactPromotionRevisionAuthoritySchema.parse(raw.revision_authority);
      const client = await input.pool.connect();
      let began = false;
      try {
        await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
        began = true;
        const collected = await collectFacts(client, candidate, input.sourceReader);
        const candidateWithSourceEvidence = collected.sourceEvidenceRef
          ? {
              ...candidate,
              evidence_refs: [...new Set([...candidate.evidence_refs, collected.sourceEvidenceRef])].sort(),
            }
          : candidate;
        const receipt = buildExactPromotionReceipt({
          request_id: raw.request_id,
          candidate: candidateWithSourceEvidence,
          revision_authority: revisionAuthority,
          facts: collected.facts,
          producer_revision: raw.producer_revision,
        });
        await client.query('ROLLBACK');
        began = false;
        return {
          receipt,
          transaction: {
            isolation_level: 'REPEATABLE READ',
            read_only: true,
            committed: false,
            rolled_back: true,
          },
        };
      } catch (error) {
        if (began) await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
