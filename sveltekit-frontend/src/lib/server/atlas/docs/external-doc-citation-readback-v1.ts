import { createHash } from 'node:crypto';
import type pg from 'pg';
import { chunkEvidenceRevisionV1 } from './external-doc-intelligence-contracts-v1.js';
import type { DocSearchHit } from './doc-intelligence-read-model.js';

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const HEX64 = /^[a-f0-9]{64}$/;
const MAX_CITATIONS = 10;
const MAX_CHUNK_BYTES = 64 * 1024;

export interface VerifiedExternalDocCitationV1 {
  schema: 'atlas.external-doc-verified-citation.v1';
  chunkId: string;
  pageId: string;
  url: string;
  provider: string | null;
  product: string | null;
  productVersion: string | null;
  sourceRevision: string;
  chunkEvidenceRevision: string;
  startByte: number;
  endByte: number;
  chunkChecksum: string;
  verifiedText: string;
  sourceAuthority: 'OFFICIAL';
  canonicalAuthority: false;
}

export interface ExternalDocCitationReadbackV1 {
  schema: 'atlas.external-doc-citation-readback.v1';
  status: 'VERIFIED' | 'BLOCKED';
  citations: VerifiedExternalDocCitationV1[];
  blockers: Array<{ chunkId: string; reason: string }>;
  readOnly: true;
  writesPerformed: false;
}

interface CanonicalDocChunkRow {
  chunk_id: string;
  page_id: string;
  ordinal: number | string;
  start_byte: number | string;
  end_byte: number | string;
  text: string;
  chunk_checksum: string;
  chunk_evidence_revision: string;
  url: string;
  provider: string | null;
  product: string | null;
  product_version: string | null;
  source_authority: string;
  page_evidence_revision: string;
}

function digestText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Re-read exact canonical rows after FTS selection; it never promotes or writes. */
export async function readVerifiedCanonicalDocChunksV1(input: {
  pool: Pick<pg.Pool, 'query'> | null;
  hits: readonly DocSearchHit[];
}): Promise<ExternalDocCitationReadbackV1> {
  const candidates = input.hits.slice(0, MAX_CITATIONS);
  const blockers: ExternalDocCitationReadbackV1['blockers'] = [];
  const eligible = candidates.filter((hit) => {
    if (hit.sourceClass !== 'CANONICAL' || hit.authorityClass !== 'OFFICIAL') {
      blockers.push({ chunkId: hit.chunkId ?? '', reason: 'SOURCE_NOT_CANONICAL_OFFICIAL' });
      return false;
    }
    if (!hit.chunkId || !hit.pageId || !hit.url || !hit.chunkEvidenceRevision || !hit.revision) {
      blockers.push({ chunkId: hit.chunkId ?? '', reason: 'CANONICAL_SOURCE_IDENTITY_INCOMPLETE' });
      return false;
    }
    if (!SHA256.test(hit.chunkEvidenceRevision) || !SHA256.test(hit.revision)) {
      blockers.push({ chunkId: hit.chunkId, reason: 'SOURCE_REVISION_INVALID' });
      return false;
    }
    return true;
  });

  if (!input.pool || eligible.length === 0) {
    return {
      schema: 'atlas.external-doc-citation-readback.v1',
      status: 'BLOCKED', citations: [], blockers: blockers.length ? blockers : [{ chunkId: '', reason: 'POSTGRES_OR_CANONICAL_HITS_UNAVAILABLE' }],
      readOnly: true, writesPerformed: false,
    };
  }

  const hitByChunkId = new Map(eligible.map((hit) => [hit.chunkId!, hit]));
  if (hitByChunkId.size !== eligible.length || blockers.length > 0) {
    if (hitByChunkId.size !== eligible.length) {
      blockers.push({ chunkId: '', reason: 'DUPLICATE_CANONICAL_CHUNK_SELECTION' });
    }
    return {
      schema: 'atlas.external-doc-citation-readback.v1',
      status: 'BLOCKED', citations: [], blockers, readOnly: true, writesPerformed: false,
    };
  }
  const result = await input.pool.query<CanonicalDocChunkRow>(
    `SELECT c.chunk_id, c.page_id, c.ordinal, c.start_byte, c.end_byte, c.text,
            c.chunk_checksum, c.evidence_revision AS chunk_evidence_revision,
            p.url, p.provider, p.product, p.product_version, p.source_authority,
            p.evidence_revision AS page_evidence_revision
       FROM public.atlas_external_doc_chunks c
       JOIN public.atlas_external_doc_pages p ON p.id = c.page_id
      WHERE c.chunk_id = ANY($1::text[])
      ORDER BY c.chunk_id`,
    [[...hitByChunkId.keys()]],
  );

  const rows = new Map(result.rows.map((row) => [row.chunk_id, row]));
  if (rows.size !== result.rows.length || result.rows.some((row) => !hitByChunkId.has(row.chunk_id))) {
    return {
      schema: 'atlas.external-doc-citation-readback.v1',
      status: 'BLOCKED', citations: [],
      blockers: [{ chunkId: '', reason: 'CANONICAL_CHUNK_READBACK_SELECTION_MISMATCH' }],
      readOnly: true, writesPerformed: false,
    };
  }
  const citations: VerifiedExternalDocCitationV1[] = [];
  for (const [chunkId, hit] of hitByChunkId) {
    const row = rows.get(chunkId);
    if (!row) {
      blockers.push({ chunkId, reason: 'CANONICAL_CHUNK_READBACK_MISSING' });
      continue;
    }
    if (row.source_authority !== 'OFFICIAL') {
      blockers.push({ chunkId, reason: 'SOURCE_AUTHORITY_CHANGED' });
      continue;
    }
    if (row.page_id !== hit.pageId || row.url !== hit.url || row.page_evidence_revision !== hit.revision
      || row.chunk_evidence_revision !== hit.chunkEvidenceRevision || row.provider !== hit.provider
      || row.product !== hit.product || row.product_version !== hit.productVersion) {
      blockers.push({ chunkId, reason: 'CANONICAL_PAGE_OR_CHUNK_REVISION_CHANGED' });
      continue;
    }
    const ordinal = Number(row.ordinal);
    const startByte = Number(row.start_byte);
    const endByte = Number(row.end_byte);
    const byteLength = Buffer.byteLength(row.text, 'utf8');
    if (!Number.isInteger(ordinal) || ordinal < 0 || !Number.isInteger(startByte) || startByte < 0
      || !Number.isInteger(endByte) || endByte <= startByte || endByte - startByte !== byteLength) {
      blockers.push({ chunkId, reason: 'CANONICAL_CHUNK_BYTE_SPAN_INVALID' });
      continue;
    }
    if (byteLength > MAX_CHUNK_BYTES) {
      blockers.push({ chunkId, reason: 'CANONICAL_CHUNK_EXCEEDS_BYTE_LIMIT' });
      continue;
    }
    if (!HEX64.test(row.chunk_checksum) || digestText(row.text) !== row.chunk_checksum) {
      blockers.push({ chunkId, reason: 'CANONICAL_CHUNK_CHECKSUM_MISMATCH' });
      continue;
    }
    const expectedChunkRevision = chunkEvidenceRevisionV1(row.page_evidence_revision, {
      ordinal, startByte, endByte, chunkChecksum: row.chunk_checksum,
    });
    if (expectedChunkRevision !== row.chunk_evidence_revision) {
      blockers.push({ chunkId, reason: 'CANONICAL_CHUNK_EVIDENCE_REVISION_MISMATCH' });
      continue;
    }
    citations.push({
      schema: 'atlas.external-doc-verified-citation.v1',
      chunkId, pageId: row.page_id, url: row.url, provider: row.provider, product: row.product,
      productVersion: row.product_version, sourceRevision: row.page_evidence_revision,
      chunkEvidenceRevision: row.chunk_evidence_revision, startByte, endByte,
      chunkChecksum: row.chunk_checksum, verifiedText: row.text,
      sourceAuthority: 'OFFICIAL', canonicalAuthority: false,
    });
  }

  return {
    schema: 'atlas.external-doc-citation-readback.v1',
    status: citations.length > 0 && blockers.length === 0 ? 'VERIFIED' : 'BLOCKED',
    citations: blockers.length === 0 ? citations : [], blockers, readOnly: true, writesPerformed: false,
  };
}
