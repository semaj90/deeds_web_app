import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pool } from '$lib/server/db/client.js';
import { buildIndexedSourcePacket } from '$lib/server/ace/indexed-source-packet.js';

export interface LocalRepositoryFeatureSource {
  sourceRef: string;
  localPath: string;
  sourceType: string;
  authorityClass: string;
  title?: string;
}

export interface LocalRepositoryFeatureIngestionResult {
  sourceRef: string;
  localPath: string;
  accepted: boolean;
  documentId: string | null;
  packetId: string | null;
  contentHash: string | null;
  chunkCount: number;
  status: 'created' | 'reused' | 'updated' | 'rejected' | 'failed';
  reason?: string;
}

const MAX_FILE_BYTES = 256_000;
const REPO_ROOT = path.resolve(process.cwd(), '..');
const FRONTEND_ROOT = path.resolve(process.cwd());

function normalizeFsPath(value: string): string {
  return path.normalize(value);
}

function detectMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.md':
      return 'text/markdown';
    case '.ts':
    case '.js':
    case '.json':
      return 'text/plain';
    case '.yaml':
    case '.yml':
      return 'application/yaml';
    default:
      return 'text/plain';
  }
}

function toWorkspaceStorageKey(sourceRef: string): string {
  return `workspace/feature-docs/${sourceRef.replace(/[^\w./-]+/g, '_')}`;
}

function resolveChunkHeading(sourceRef: string): string {
  return path.basename(sourceRef);
}

function chunkContent(content: string, maxChars = 1200): string[] {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';
  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length > maxChars && current) {
      chunks.push(current);
      current = paragraph;
      continue;
    }
    current = next;
  }
  if (current) chunks.push(current);

  return chunks.length > 0 ? chunks : [normalized.slice(0, maxChars)];
}

function normalizeSourceRef(sourceRef: string): string {
  return sourceRef.replace(/\\/g, '/').replace(/^\.\/+/, '').trim();
}

function ensureApprovedFile(localPath: string): { ok: true; absolutePath: string } | { ok: false; reason: string } {
  const candidate = path.normalize(localPath);
  if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
    return { ok: false, reason: 'missing_local_source' };
  }

  const realPath = normalizeFsPath(fs.realpathSync.native(candidate));
  const allowedRoots = [FRONTEND_ROOT, REPO_ROOT].map((root) => normalizeFsPath(fs.realpathSync.native(root)));
  const allowed = allowedRoots.some((root) => realPath === root || realPath.startsWith(`${root}${path.sep}`));
  if (!allowed) return { ok: false, reason: 'local_path_outside_workspace_roots' };

  return { ok: true, absolutePath: realPath };
}

async function getFederalJurisdictionId(): Promise<number | null> {
  const result = await pool.query(`SELECT id FROM jurisdictions WHERE code = 'federal' LIMIT 1`);
  return result.rows[0]?.id ?? null;
}

async function upsertLocalRepositoryDocument(args: {
  source: LocalRepositoryFeatureSource;
  content: string;
  contentHash: string;
}): Promise<{ documentId: string; status: 'created' | 'reused' | 'updated'; chunkCount: number }> {
  const sourceRef = normalizeSourceRef(args.source.sourceRef);
  const existingByHash = await pool.query(
    `SELECT id FROM library_documents WHERE source_hash = $1 LIMIT 1`,
    [args.contentHash]
  );
  if (existingByHash.rows[0]?.id) {
    return {
      documentId: String(existingByHash.rows[0].id),
      status: 'reused',
      chunkCount: 0,
    };
  }

  const existingByTitle = await pool.query(
    `SELECT id FROM library_documents WHERE title = $1 AND source_kind = 'feature_repository_doc' LIMIT 1`,
    [sourceRef]
  );

  const documentId = String(existingByTitle.rows[0]?.id ?? randomUUID());
  const versionId = randomUUID();
  const rootNodeId = randomUUID();
  const jurisdictionId = await getFederalJurisdictionId();
  const chunks = chunkContent(args.content);
  const isUpdate = Boolean(existingByTitle.rows[0]?.id);

  await pool.query(
    `INSERT INTO library_documents
       (id, source_type, corpus_type, jurisdiction_id, title, short_title, source_hash,
        mime_type, minio_key, minio_key_normalized, source_kind, source_confidence,
        processing_status, is_official, created_at, updated_at)
     VALUES ($1, 'upload', 'treatise', $2, $3, $4, $5, $6, $7, $7, 'feature_repository_doc', $8, 'complete', $9, now(), now())
     ON CONFLICT (id) DO UPDATE
       SET source_hash = EXCLUDED.source_hash,
           mime_type = EXCLUDED.mime_type,
           minio_key = EXCLUDED.minio_key,
           minio_key_normalized = EXCLUDED.minio_key_normalized,
           source_confidence = EXCLUDED.source_confidence,
           processing_status = 'complete',
           updated_at = now()`,
    [
      documentId,
      jurisdictionId,
      sourceRef,
      args.source.title ?? path.basename(sourceRef),
      args.contentHash,
      detectMimeType(args.source.localPath),
      toWorkspaceStorageKey(sourceRef),
      args.source.authorityClass,
      args.source.authorityClass === 'official',
    ]
  );

  if (isUpdate) {
    await pool.query(
      `DELETE FROM legal_chunks
        WHERE legal_node_id IN (SELECT id FROM legal_nodes WHERE document_id = $1)`,
      [documentId]
    );
    await pool.query(`DELETE FROM legal_nodes WHERE document_id = $1`, [documentId]);
  }

  await pool.query(
    `INSERT INTO library_document_versions (id, document_id, version_label, source_date, is_current)
     VALUES ($1, $2, 'feature-doc-local', now(), true)
     ON CONFLICT DO NOTHING`,
    [versionId, documentId]
  );

  await pool.query(
    `INSERT INTO legal_nodes
       (id, document_id, version_id, parent_node_id, node_type, heading, citation_label, node_path, depth, full_text, text_clean)
     VALUES ($1, $2, $3, NULL, 'document', $4, NULL, 'root', 0, $5, $5)
     ON CONFLICT DO NOTHING`,
    [
      rootNodeId,
      documentId,
      versionId,
      resolveChunkHeading(sourceRef),
      args.content.slice(0, 100_000),
    ]
  );

  for (const [index, chunk] of chunks.entries()) {
    await pool.query(
      `INSERT INTO legal_chunks
         (id, legal_node_id, chunk_index, chunk_text, token_count, char_start, char_end)
       VALUES ($1, $2, $3, $4, $5, 0, 0)
       ON CONFLICT (legal_node_id, chunk_index) DO UPDATE
         SET chunk_text = EXCLUDED.chunk_text,
             token_count = EXCLUDED.token_count`,
      [randomUUID(), rootNodeId, index, chunk, Math.ceil(chunk.length / 4)]
    );
  }

  return {
    documentId,
    status: isUpdate ? 'updated' : 'created',
    chunkCount: chunks.length,
  };
}

export async function ingestLocalRepositoryFeatureSources(args: {
  featureId: string;
  sources: LocalRepositoryFeatureSource[];
}): Promise<LocalRepositoryFeatureIngestionResult[]> {
  const results: LocalRepositoryFeatureIngestionResult[] = [];

  for (const source of args.sources) {
    const checked = ensureApprovedFile(source.localPath);
    if (checked.ok === false) {
      results.push({
        sourceRef: source.sourceRef,
        localPath: source.localPath,
        accepted: false,
        documentId: null,
        packetId: null,
        contentHash: null,
        chunkCount: 0,
        status: 'rejected',
        reason: checked.reason,
      });
      continue;
    }

    const buffer = fs.readFileSync(checked.absolutePath);
    if (buffer.byteLength > MAX_FILE_BYTES) {
      results.push({
        sourceRef: source.sourceRef,
        localPath: checked.absolutePath,
        accepted: false,
        documentId: null,
        packetId: null,
        contentHash: null,
        chunkCount: 0,
        status: 'rejected',
        reason: 'local_source_exceeds_byte_limit',
      });
      continue;
    }

    const content = buffer.toString('utf8');
    const contentHash = crypto.createHash('sha256').update(content).digest('hex');

    try {
      const document = await upsertLocalRepositoryDocument({
        source,
        content,
        contentHash,
      });
      const packet = await buildIndexedSourcePacket({
        sourceRef: normalizeSourceRef(source.sourceRef),
        featureId: args.featureId,
      });

      results.push({
        sourceRef: source.sourceRef,
        localPath: checked.absolutePath.replace(/\\/g, '/'),
        accepted: true,
        documentId: document.documentId,
        packetId: packet.packet.packet_id,
        contentHash,
        chunkCount: document.chunkCount,
        status: document.status,
      });
    } catch (error) {
      results.push({
        sourceRef: source.sourceRef,
        localPath: checked.absolutePath.replace(/\\/g, '/'),
        accepted: false,
        documentId: null,
        packetId: null,
        contentHash,
        chunkCount: 0,
        status: 'failed',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}
