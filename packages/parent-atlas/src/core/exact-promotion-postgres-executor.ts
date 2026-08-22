import type { Pool, PoolClient, QueryResultRow } from 'pg';
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

export interface ExactPromotionSourceReadRequestV1 {
  source_ref: string;
  span_start: number;
  span_end: number;
}

export interface ExactPromotionSourceBytesV1 {
  file_found: boolean;
  file_sha256: string | null;
  file_byte_length: number | null;
  span_found: boolean;
  span_sha256: string | null;
  span_byte_length: number | null;
  evidence_ref?: string | null;
}

export type ExactPromotionSourceReaderV1 = (
  request: ExactPromotionSourceReadRequestV1,
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

type PacketRow = QueryResultRow & {
  packet_key: string;
  source_ref: string;
  workspace_revision: number | string | null;
  representation_revision: number | string | null;
  sha256: string | null;
  tree_node_id: string | null;
  byte_start: number | string | null;
  byte_end: number | string | null;
};

type SymbolVersionRow = QueryResultRow & {
  symbol_version_id: string;
  stable_symbol_id: string;
  source_ref: string;
  source_revision: string;
  workspace_revision: string;
  upstream_node_id: string;
  byte_start: number | string;
  byte_end: number | string;
};

type AstNodeRow = QueryResultRow & {
  tree_node_id: string;
  resolved_source_ref: string | null;
  source_revision: string | null;
  source_content_hash: string | null;
  start_byte: number | string | null;
  end_byte: number | string | null;
};

type SourceRefRow = QueryResultRow & {
  source_ref_key: string;
  relative_path: string | null;
  content_hash: string;
  commit_sha: string | null;
  corpus_version: string | null;
};

type GraphifyRow = QueryResultRow & {
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

function offset(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

async function maybeOne<T extends QueryResultRow>(
  client: PoolClient,
  sql: string,
  values: unknown[],
): Promise<T | null> {
  const result = await client.query<T>(sql, values);
  if (result.rows.length > 1) throw new Error('EXACT_PROMOTION_AMBIGUOUS_READBACK');
  return result.rows[0] ?? null;
}

function selectSpan(input: {
  candidate: ExactPromotionCandidateV1;
  packet: PacketRow | null;
  symbol: SymbolVersionRow | null;
  ast: AstNodeRow | null;
  sourceRef: SourceRefRow | null;
}): {
  basis: 'AST_NODE' | 'SYMBOL_VERSION' | 'PACKET' | null;
  start: number | null;
  end: number | null;
  expectedHash: string | null;
} {
  const astStart = offset(input.ast?.start_byte);
  const astEnd = offset(input.ast?.end_byte);
  if (input.candidate.tree_node_id && input.ast && astStart !== null && astEnd !== null) {
    return {
      basis: 'AST_NODE',
      start: astStart,
      end: astEnd,
      expectedHash: digest(input.ast.source_content_hash),
    };
  }

  const symbolStart = offset(input.symbol?.byte_start);
  const symbolEnd = offset(input.symbol?.byte_end);
  if (input.candidate.symbol_version_id && input.symbol && symbolStart !== null && symbolEnd !== null) {
    return {
      basis: 'SYMBOL_VERSION',
      start: symbolStart,
      end: symbolEnd,
      // atlas_symbol_versions.declaration_hash is not documented as raw-byte
      // SHA-256, so it is intentionally not used as an exact span digest.
      expectedHash: input.candidate.expected_span_content_hash,
    };
  }

  const packetStart = offset(input.packet?.byte_start);
  const packetEnd = offset(input.packet?.byte_end);
  if (input.candidate.packet_key && input.packet && packetStart !== null && packetEnd !== null) {
    return {
      basis: 'PACKET',
      start: packetStart,
      end: packetEnd,
      expectedHash: input.candidate.expected_span_content_hash ?? digest(input.packet.sha256),
    };
  }

  return { basis: null, start: null, end: null, expectedHash: null };
}

async function collectFacts(
  client: PoolClient,
  candidate: ExactPromotionCandidateV1,
  sourceReader: ExactPromotionSourceReaderV1,
): Promise<{ facts: ExactPromotionEvidenceFactsV1; sourceEvidenceRef: string | null }> {
  const packet = candidate.packet_key
    ? await maybeOne<PacketRow>(client, `
        SELECT packet_key, source_ref, workspace_revision, representation_revision,
               sha256, tree_node_id::text AS tree_node_id, byte_start, byte_end
        FROM atlas_packets
        WHERE packet_key = $1
      `, [candidate.packet_key])
    : null;

  const symbol = candidate.symbol_version_id
    ? await maybeOne<SymbolVersionRow>(client, `
        SELECT symbol_version_id, stable_symbol_id, source_ref, source_revision,
               workspace_revision, upstream_node_id, byte_start, byte_end
        FROM atlas_symbol_versions
        WHERE symbol_version_id = $1
      `, [candidate.symbol_version_id])
    : null;

  const ast = candidate.tree_node_id
    ? await maybeOne<AstNodeRow>(client, `
        SELECT a.tree_node_id,
               COALESCE(sr.relative_path, a.relative_path, a.source_ref_key) AS resolved_source_ref,
               a.source_revision, a.source_content_hash, a.start_byte, a.end_byte
        FROM atlas_ast_nodes a
        LEFT JOIN atlas_source_refs sr
          ON sr.source_ref_key = a.source_ref_key
         AND sr.repo_id = a.repo_id
        WHERE a.tree_node_id = $1
      `, [candidate.tree_node_id])
    : null;

  // Only an exact source_ref_key is accepted here. A relative_path can identify
  // many symbol/span source refs and must not be arbitrarily collapsed to one.
  const sourceRef = await maybeOne<SourceRefRow>(client, `
    SELECT source_ref_key, relative_path, content_hash, commit_sha, corpus_version
    FROM atlas_source_refs
    WHERE source_ref_key = $1
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

  const selectedSpan = selectSpan({ candidate, packet, symbol, ast, sourceRef });
  const sourceBytes = selectedSpan.start !== null && selectedSpan.end !== null
    ? await sourceReader({
        source_ref: candidate.source_ref,
        span_start: selectedSpan.start,
        span_end: selectedSpan.end,
      })
    : {
        file_found: false,
        file_sha256: null,
        file_byte_length: null,
        span_found: false,
        span_sha256: null,
        span_byte_length: null,
        evidence_ref: null,
      };

  const facts = exactPromotionEvidenceFactsSchema.parse({
    packet_found: packet !== null,
    packet_source_ref: packet?.source_ref ?? null,
    packet_workspace_revision: revision(packet?.workspace_revision),
    packet_representation_revision: revision(packet?.representation_revision),
    packet_sha256: digest(packet?.sha256),
    packet_tree_node_id: packet?.tree_node_id ?? null,
    packet_byte_start: offset(packet?.byte_start),
    packet_byte_end: offset(packet?.byte_end),

    symbol_version_found: symbol !== null,
    symbol_version_source_ref: symbol?.source_ref ?? null,
    symbol_version_source_revision: revision(symbol?.source_revision),
    symbol_version_workspace_revision: revision(symbol?.workspace_revision),
    symbol_version_stable_symbol_id: symbol?.stable_symbol_id ?? null,
    symbol_version_upstream_node_id: symbol?.upstream_node_id ?? null,
    symbol_version_byte_start: offset(symbol?.byte_start),
    symbol_version_byte_end: offset(symbol?.byte_end),

    ast_node_found: ast !== null,
    ast_node_source_ref: ast?.resolved_source_ref ?? null,
    ast_node_source_revision: revision(ast?.source_revision),
    ast_node_content_hash: digest(ast?.source_content_hash),
    ast_node_byte_start: offset(ast?.start_byte),
    ast_node_byte_end: offset(ast?.end_byte),

    source_ref_found: sourceRef !== null,
    source_ref_content_hash: digest(sourceRef?.content_hash),
    source_ref_commit_sha: revision(sourceRef?.commit_sha),
    source_ref_corpus_version: revision(sourceRef?.corpus_version),

    graphify_source_found: graphify !== null,
    graphify_source_revision: revision(graphify?.source_revision),
    graphify_workspace_revision: revision(graphify?.repository_revision),
    graphify_content_hash: digest(graphify?.content_hash),

    selected_span_basis: selectedSpan.basis,
    selected_span_start: selectedSpan.start,
    selected_span_end: selectedSpan.end,
    selected_span_expected_hash: selectedSpan.expectedHash,

    source_file_bytes_found: sourceBytes.file_found,
    source_file_bytes_sha256: digest(sourceBytes.file_sha256),
    source_span_bytes_found: sourceBytes.span_found,
    source_span_bytes_sha256: digest(sourceBytes.span_sha256),
  });

  return {
    facts,
    sourceEvidenceRef: sourceBytes.evidence_ref?.trim() || null,
  };
}

/**
 * Read-only exact-promotion executor.
 *
 * All relational evidence is gathered inside one REPEATABLE READ / READ ONLY
 * transaction. The source reader is injected and returns hashes for the whole
 * file plus the selected exact span; no source or database state is mutated.
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
