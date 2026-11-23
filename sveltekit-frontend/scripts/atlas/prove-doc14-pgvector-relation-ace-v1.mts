import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { findRepoRoot, searchDocCorpus } from '../../src/lib/server/atlas/docs/doc-intelligence-read-model.js';
import { readVerifiedCanonicalDocChunksV1 } from '../../src/lib/server/atlas/docs/external-doc-citation-readback-v1.js';
import { recommendFromOfficialDocReadbackV1 } from '../../src/lib/server/atlas/docs/external-doc-dspy-v1.js';

const root = findRepoRoot();
const output = process.argv[2];
const { DATABASE_URL, PYTHON_PATH, LLAMA_SERVER_URL } = process.env;
if (!output || !DATABASE_URL || !PYTHON_PATH || !LLAMA_SERVER_URL) {
  throw new Error('DOC14_OUTPUT_DATABASE_AND_DSPY_CONFIG_REQUIRED');
}
const draftPath = 'docs/reports/doc14-pgvector-relation-review-v1.json';
const draftBytes = readFileSync(resolve(root, draftPath));
const draft = JSON.parse(draftBytes.toString('utf8'));
const { sourceCandidate: row } = draft;
const binding = row.candidate.evidence_binding;
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });
try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout = '5s'");
    const result = await searchDocCorpus({
      pool: client, root, q: 'hnsw.iterative_scan', limit: 5, product: 'pgvector', canonicalOfficialOnly: true,
    });
    const hit = result.hits.find(({ chunkId }) => chunkId === row.chunk_id);
    if (!hit || result.postgresNote) throw new Error('DOC14_EXACT_PROPOSAL_CHUNK_NOT_RETRIEVED');
    const adversarial = await readVerifiedCanonicalDocChunksV1({
      pool: client, hits: [{ ...hit, chunkEvidenceRevision: `sha256:${'0'.repeat(64)}` }],
    });
    if (adversarial.status !== 'BLOCKED' || adversarial.citations.length ||
        !adversarial.blockers.some(({ reason }) => reason === 'CANONICAL_PAGE_OR_CHUNK_REVISION_CHANGED')) {
      throw new Error('DOC14_STALE_REVISION_PROBE_FAILED');
    }
    const readback = await readVerifiedCanonicalDocChunksV1({ pool: client, hits: [hit] });
    const citation = readback.citations[0];
    if (readback.status !== 'VERIFIED' || readback.citations.length !== 1 ||
        citation.sourceRevision !== row.source_revision || citation.chunkEvidenceRevision !== row.chunk_evidence_revision ||
        citation.chunkChecksum !== row.chunk_checksum || citation.url !== binding.source_url) {
      throw new Error('DOC14_LIVE_PROPOSAL_BINDING_MISMATCH');
    }
    const start = binding.start_byte - citation.startByte;
    const end = binding.end_byte - citation.startByte;
    const bytes = Buffer.from(citation.verifiedText, 'utf8');
    const span = bytes.subarray(start, end);
    if (start < 0 || end <= start || end > bytes.length ||
        !span.equals(Buffer.from(binding.evidence_text, 'utf8')) || sha(span) !== binding.evidence_checksum) {
      throw new Error('DOC14_LIVE_PROPOSAL_SPAN_MISMATCH');
    }
    await client.query('COMMIT');
    const recommendation = await recommendFromOfficialDocReadbackV1({
      requestId: 'doc14-pgvector-relation-proof-v1',
      query: 'What ordering options do pgvector iterative scans support?',
      readback, repoRoot: root, python: PYTHON_PATH, llamaUrl: LLAMA_SERVER_URL,
    });
    const citesProposalSpan = recommendation.recommendation?.claims.some((claim) =>
      claim.chunkId === row.chunk_id && claim.startByte >= binding.start_byte && claim.endByte <= binding.end_byte
        && /\bstrict\b/i.test(claim.quote) && /\brelaxed\b/i.test(claim.quote),
    ) ?? false;
    const receipt = {
      schema: 'atlas.doc14-pgvector-relation-ace-proof.v1',
      status: citesProposalSpan ? 'PROPOSAL_SPAN_CITED_REVIEW_REQUIRED' : 'PROPOSAL_SPAN_NOT_CITED',
      draft: { sourceRef: draftPath, sha256: `sha256:${sha(draftBytes)}` },
      sourceRevision: citation.sourceRevision,
      chunkId: row.chunk_id,
      chunkEvidenceRevision: citation.chunkEvidenceRevision,
      verifiedSpan: { startByte: binding.start_byte, endByte: binding.end_byte, sha256: binding.evidence_checksum },
      staleRevisionProbe: 'CANONICAL_PAGE_OR_CHUNK_REVISION_CHANGED',
      recommendation,
      admittedGraphEdgeUsed: false,
      canonicalAuthority: false,
      writesPerformed: false,
    };
    writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ status: receipt.status, chunkId: receipt.chunkId, staleRevisionProbe: receipt.staleRevisionProbe, recommendationStatus: recommendation.status, reason: recommendation.reason }));
    if (!citesProposalSpan) process.exitCode = 2;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
