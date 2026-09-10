import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { observeSnapshot } from './lib/workspace-snapshot-capture-v1.mts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const REPORT = path.resolve(ROOT, 'docs/reports/workspace-snapshot-namespace-dedup-v1.json');
const workspaceId = process.env.ATLAS_WORKSPACE_ID ?? 'parent-atlas-local';
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const normalize = (value: string) => value.replaceAll('\\', '/').replace(/^\/+/, '').toLowerCase();

function classify(sourceRef: string) {
  const value = normalize(sourceRef);
  if (value.startsWith('docs/reports/') || value.startsWith('.tmp/') || value.startsWith('coverage/') || value.startsWith('dist/') || value.startsWith('build/')) return 'GENERATED_ARTIFACT';
  if (value.includes('/node_modules/') || value.startsWith('node_modules/') || value.includes('/vendor/')) return 'VENDORED';
  if (value.startsWith('models/') || value.includes('/models/') || value.includes('/checkpoints/')) return 'MODEL_ARTIFACT';
  return 'SOURCE_INPUT';
}

async function sourceMembershipTable() {
  const connectionString = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
  const pool = new pg.Pool({ connectionString, max: 1, connectionTimeoutMillis: 2500 });
  try {
    const result = await pool.query(`
      SELECT to_regclass('public.workspace_source_membership') AS relation,
             COALESCE((SELECT json_agg(column_name ORDER BY ordinal_position)
                       FROM information_schema.columns
                       WHERE table_schema = 'public' AND table_name = 'workspace_source_membership'), '[]'::json) AS columns
    `);
    const row = result.rows[0] ?? {};
    const columns = Array.isArray(row.columns) ? row.columns : [];
    const required = ['workspace_revision', 'repository_id', 'source_ref', 'source_revision', 'content_digest', 'source_ordinal'];
    return { reachable: true, relation: row.relation ?? null, columns, requiredColumnsPresent: required.every((column) => columns.includes(column)) };
  } catch (error) {
    return { reachable: false, relation: null, columns: [], requiredColumnsPresent: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    await pool.end().catch(() => undefined);
  }
}

const observed = observeSnapshot(ROOT, workspaceId);
const records = observed.sources.map((source: any) => ({ ...source, classification: classify(source.sourceRef) }));
const identityKeys = records.map((source: any) => source.sourceIdentityKey);
const contentGroups = new Map<string, any[]>();
for (const source of records) contentGroups.set(source.contentDigest, [...(contentGroups.get(source.contentDigest) ?? []), source]);
const duplicateContentGroups = [...contentGroups.values()].filter((group) => group.length > 1);
const serializedMetadata = JSON.stringify(records.map((source: any) => ({
  repositoryId: source.repositoryId, repositoryRelativePath: source.repositoryRelativePath,
  sourceIdentityKey: source.sourceIdentityKey, sourceRevision: source.sourceRevision,
  contentDigest: source.contentDigest, byteLength: source.byteLength, classification: source.classification,
})));
const categories = Object.fromEntries(['SOURCE_INPUT', 'SUBMODULE_SOURCE', 'GENERATED_ARTIFACT', 'VENDORED', 'MODEL_ARTIFACT', 'IGNORED'].map((key) => [key, records.filter((source: any) => source.classification === key).length]));
const membership = await sourceMembershipTable();
const report = {
  schema: 'atlas.workspace-snapshot-namespace-dedup.v1', generatedAt: new Date().toISOString(), mode: 'READ_ONLY',
  workspaceId, canonicalAuthority: false, workspaceRevision: null, writesPerformed: false,
  status: observed.violations.length ? 'NAMESPACE_AUDIT_PARTIAL' : 'NAMESPACE_AUDIT_COMPLETE',
  counts: { totalFiles: records.length, repositoryCount: observed.repositories.length, sourceInputCount: categories.SOURCE_INPUT, generatedArtifactCount: categories.GENERATED_ARTIFACT, modelArtifactCount: categories.MODEL_ARTIFACT, ...categories },
  duplicateSourceKeys: [...new Set(identityKeys)].length === identityKeys.length ? 0 : identityKeys.length - new Set(identityKeys).size,
  duplicateContentDigests: duplicateContentGroups.length, uniqueContentDigestCount: contentGroups.size,
  largestContentDuplicateGroup: Math.max(0, ...duplicateContentGroups.map((group) => group.length)),
  contentDuplicateGroups: duplicateContentGroups.slice(0, 25).map((group) => ({ contentDigest: group[0].contentDigest, count: group.length, sourceIdentityKeys: group.map((source) => source.sourceIdentityKey) })),
  generatedPathPolicy: { paths: ['docs/reports/**', '.tmp/**', 'coverage/**', 'dist/**', 'build/**'], participatesInWorkspaceRevision: false },
  modelPathPolicy: { paths: ['models/**', '**/models/**', '**/checkpoints/**'], participatesInWorkspaceRevision: false },
  nestedRepositories: observed.repositories.map((repository: any) => ({ repositoryId: repository.relativePath ? `repo:${repository.relativePath}` : 'repo:root', rootPath: repository.relativePath || '.', repositoryRevision: repository.head, sourceCount: records.filter((source: any) => source.repositoryPath === repository.relativePath).length, identityNamespaceIsolated: true })),
  estimatedManifestBytes: { serializedMetadataBytes: Buffer.byteLength(serializedMetadata), estimateRangeBytes: [Buffer.byteLength(serializedMetadata), Math.ceil(Buffer.byteLength(serializedMetadata) * 1.8)] },
  sourceNamespace: { duplicateIdentityPolicy: 'repositoryId + repositoryRelativePath', contentDuplicatesAllowed: true, sourceIdentityChecksum: `sha256:${digest(identityKeys)}` },
  postgresSourceMembership: membership,
  violations: observed.violations,
  reportChecksum: null,
};
report.reportChecksum = `sha256:${digest({ ...report, reportChecksum: null })}`;
mkdirSync(path.dirname(REPORT), { recursive: true });
writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, counts: report.counts, duplicateSourceKeys: report.duplicateSourceKeys, duplicateContentDigests: report.duplicateContentDigests, postgresSourceMembership: membership, reportPath: path.relative(ROOT, REPORT).replaceAll('\\', '/') }, null, 2));
