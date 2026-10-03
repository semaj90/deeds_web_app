#!/usr/bin/env node

/** Read-only census of the repository-qualified membership bridge for one execution. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const root = path.resolve(import.meta.dirname, '../..');
const executionId = process.argv.includes('--execution-id')
  ? process.argv[process.argv.indexOf('--execution-id') + 1]
  : '14667026-459c-4a99-b3c2-c20b739a6e0d';
const reportPath = path.join(root, 'docs/reports/selected-membership-bridge-v1.json');
const namespaceAuthorityPath = path.join(root, 'docs/reports/source-namespace-authority-v1.json');
const namespaceAuthority = fs.existsSync(namespaceAuthorityPath)
  ? JSON.parse(fs.readFileSync(namespaceAuthorityPath, 'utf8'))
  : null;
const executionNamespaceAliases = namespaceAuthority?.status === 'SOURCE_NAMESPACE_AUTHORITY_PROVEN'
  && Array.isArray(namespaceAuthority.executionNamespaceAliases)
  ? namespaceAuthority.executionNamespaceAliases.filter((row) => row?.value && row?.canonicalRepositoryId)
  : [];
const normalize = (value) => String(value ?? '').trim().replaceAll('\\', '/').replace(/^\.\//, '').toLowerCase();
const digest = (value) => normalize(value).replace(/^sha256:/, '');
const pool = new Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv()),
  max: 1,
  statement_timeout: 120000,
  application_name: 'atlas-selected-membership-bridge-v1',
});

const columns = async (table) => new Set((await pool.query(
  `select column_name from information_schema.columns where table_schema='public' and table_name=$1`,
  [table],
)).rows.map((row) => row.column_name));
const count = async (sql, params = []) => Number((await pool.query(sql, params)).rows[0]?.n ?? 0);

let report;
try {
  const membership = await columns('graphify_execution_file_membership_v2');
  const sourceRefs = await columns('atlas_source_refs');
  const identityLinks = await columns('atlas_chunk_packet_identity_links');
  const lineage = await columns('atlas_packet_chunk_lineage');
  const required = ['execution_id', 'repository_id', 'repository_relative_path', 'source_ref', 'code_source_revision', 'workspace_revision'];
  if (!required.every((column) => membership.has(column))) throw new Error('MEMBERSHIP_V2_REQUIRED_COLUMNS_MISSING');

  const total = await count(
    `select count(*)::int n from public.graphify_execution_file_membership_v2 where execution_id=$1::uuid`,
    [executionId],
  );
  const repositories = await count(
    `select count(distinct repository_id)::int n from public.graphify_execution_file_membership_v2 where execution_id=$1::uuid`,
    [executionId],
  );
  const membershipSamples = (await pool.query(
    `select repository_id::text, repository_relative_path::text, source_ref::text
       from public.graphify_execution_file_membership_v2
      where execution_id=$1::uuid order by repository_id, repository_relative_path limit 3`,
    [executionId],
  )).rows;
  const sourceRefSamples = sourceRefs.has('source_ref_key') && sourceRefs.has('repo_id')
    ? (await pool.query(
      `select repo_id::text, source_ref_key::text
         from public.atlas_source_refs order by repo_id, source_ref_key limit 3`,
    )).rows
    : [];
  const membershipRepositories = (await pool.query(
    `select distinct repository_id::text from public.graphify_execution_file_membership_v2 where execution_id=$1::uuid order by 1`,
    [executionId],
  )).rows.map((row) => row.repository_id);
  const sourceRefRepositories = sourceRefs.has('repo_id')
    ? (await pool.query(`select distinct repo_id::text from public.atlas_source_refs order by 1`)).rows.map((row) => row.repo_id)
    : [];

  const sourceJoin = sourceRefs.has('source_ref_key') && sourceRefs.has('repo_id')
    ? await count(
      `select count(*)::int n
         from (select distinct repository_id, repository_relative_path
                 from public.graphify_execution_file_membership_v2 where execution_id=$1::uuid) m
         join public.atlas_source_refs s
           on lower(trim(s.repo_id::text))=lower(coalesce((select a->>'canonicalRepositoryId'
                 from jsonb_array_elements($2::jsonb) a
                where lower(a->>'value')=lower(trim(m.repository_id::text))
                limit 1), regexp_replace(lower(trim(m.repository_id::text)),'^repo:','')))
          and lower(regexp_replace(regexp_replace(split_part(trim(s.source_ref_key::text),'#',1),'\\\\','/','g'),'^\\./',''))
              = lower(regexp_replace(regexp_replace(trim(m.repository_relative_path::text),'\\\\','/','g'),'^\\./',''))`,
       [executionId, JSON.stringify(executionNamespaceAliases)],
    )
    : 0;

  const pathOnlySourceJoin = sourceRefs.has('source_ref_key')
    ? await count(
      `select count(*)::int n
         from (select distinct repository_relative_path
                 from public.graphify_execution_file_membership_v2 where execution_id=$1::uuid) m
         join public.atlas_source_refs s
           on lower(regexp_replace(regexp_replace(split_part(trim(s.source_ref_key::text),'#',1),'\\\\','/','g'),'^\\./',''))
              = lower(regexp_replace(regexp_replace(trim(m.repository_relative_path::text),'\\\\','/','g'),'^\\./',''))`,
      [executionId],
    )
    : 0;
  const pathOnlyRepositoryPairs = sourceRefs.has('source_ref_key') && sourceRefs.has('repo_id')
    ? (await pool.query(
      `select m.repository_id::text as membership_repository,
              s.repo_id::text as source_repository,
              count(distinct m.repository_relative_path)::int as path_matches
         from (select distinct repository_id, repository_relative_path
                 from public.graphify_execution_file_membership_v2 where execution_id=$1::uuid) m
         join public.atlas_source_refs s
           on lower(regexp_replace(regexp_replace(split_part(trim(s.source_ref_key::text),'#',1),'\\\\','/','g'),'^\\./',''))
              = lower(regexp_replace(regexp_replace(trim(m.repository_relative_path::text),'\\\\','/','g'),'^\\./',''))
        group by m.repository_id, s.repo_id
        order by path_matches desc, membership_repository, source_repository`,
      [executionId],
    )).rows
    : [];

  const sourceRevisionJoin = sourceRefs.has('source_ref_key') && sourceRefs.has('repo_id') && sourceRefs.has('content_hash')
    ? await count(
      `select count(*)::int n
         from public.graphify_execution_file_membership_v2 m
         join public.atlas_source_refs s
           on lower(trim(s.repo_id::text))=lower(coalesce((select a->>'canonicalRepositoryId'
                 from jsonb_array_elements($2::jsonb) a
                where lower(a->>'value')=lower(trim(m.repository_id::text))
                limit 1), regexp_replace(lower(trim(m.repository_id::text)),'^repo:','')))
          and lower(regexp_replace(regexp_replace(split_part(trim(s.source_ref_key::text),'#',1),'\\\\','/','g'),'^\\./',''))
              = lower(regexp_replace(regexp_replace(trim(m.repository_relative_path::text),'\\\\','/','g'),'^\\./',''))
          and regexp_replace(lower(trim(s.content_hash::text)),'^sha256:','')
              = regexp_replace(lower(trim(m.code_source_revision::text)),'^sha256:','')
        where m.execution_id=$1::uuid`,
       [executionId, JSON.stringify(executionNamespaceAliases)],
    )
    : 0;

  const linkCount = identityLinks.has('source_ref')
    ? await count(
      `select count(distinct m.repository_id||'|'||m.repository_relative_path)::int n
         from public.graphify_execution_file_membership_v2 m
         join public.atlas_chunk_packet_identity_links l
           on lower(trim(l.source_ref::text)) = lower(trim(m.source_ref::text))
        where m.execution_id=$1::uuid`,
      [executionId],
    )
    : 0;
  const linkCoverageByRepository = identityLinks.has('source_ref')
    ? (await pool.query(
      `select m.repository_id::text,
              count(distinct m.repository_id||'|'||m.repository_relative_path)::int as selected,
              count(distinct case when l.source_ref is not null then m.repository_id||'|'||m.repository_relative_path end)::int as linked
         from public.graphify_execution_file_membership_v2 m
         left join public.atlas_chunk_packet_identity_links l
           on lower(trim(l.source_ref::text)) = lower(trim(m.source_ref::text))
        where m.execution_id=$1::uuid
        group by m.repository_id order by m.repository_id`,
      [executionId],
    )).rows
    : [];
  const provenLineageCount = lineage.has('source_ref') && lineage.has('source_revision') && lineage.has('revision_status')
    ? await count(
      `select count(distinct m.repository_id||'|'||m.repository_relative_path)::int n
         from public.graphify_execution_file_membership_v2 m
         join public.atlas_packet_chunk_lineage l
           on lower(trim(l.source_ref::text)) = lower(trim(m.source_ref::text))
          and regexp_replace(lower(trim(l.source_revision::text)),'^sha256:','')
              = regexp_replace(lower(trim(m.code_source_revision::text)),'^sha256:','')
          and l.revision_status='PROVEN'
        where m.execution_id=$1::uuid`,
      [executionId],
    )
    : 0;

  report = {
    schema: 'atlas.selected-membership-bridge.v1',
    gate: 'CURRENT-MEMBERSHIP-BRIDGE-CENSUS-01',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY',
    executionId,
    counts: {
      selectedMembershipRows: total,
      repositoryCount: repositories,
      exactRepositoryPathSourceRefJoins: sourceJoin,
      canonicalSourceReferenceMissing: Math.max(total - sourceJoin, 0),
      pathOnlySourceReferenceMatches: pathOnlySourceJoin,
      pathOnlyMatchesWithRepositoryMismatch: Math.max(pathOnlySourceJoin - sourceJoin, 0),
      exactSourceRevisionJoins: sourceRevisionJoin,
      sourceIdentityLinkRows: linkCount,
      provenLineageSourceRows: provenLineageCount,
    },
    diagnosticSamples: { membership: membershipSamples, sourceRefs: sourceRefSamples, membershipRepositories, sourceRefRepositories, pathOnlyRepositoryPairs, linkCoverageByRepository },
    namespaceAuthority: {
      reportPath: path.relative(root, namespaceAuthorityPath).replaceAll('\\', '/'),
      status: namespaceAuthority?.status ?? null,
      aliasesApplied: executionNamespaceAliases,
    },
    identityContract: 'repository_id + repository_relative_path → source reference; source_ref + source_revision → proven packet/chunk lineage',
    nonAdmissionComparisons: ['Qdrant point IDs', 'bare paths', 'whole-file hash to per-chunk content_hash'],
    status: sourceJoin === total && provenLineageCount === total && total > 0 ? 'CURRENT_MEMBERSHIP_BRIDGE_PROVEN' : 'CURRENT_MEMBERSHIP_BRIDGE_INCOMPLETE',
    firstBlocker: sourceJoin < total
      ? pathOnlySourceJoin > sourceJoin
        ? 'REPOSITORY_NAMESPACE_MISMATCH'
        : 'CANONICAL_SOURCE_REFERENCE_MISSING'
      : provenLineageCount < total
        ? 'CURRENT_PACKET_CHUNK_LINEAGE_BRIDGE_INCOMPLETE'
        : null,
    writesPerformed: false,
  };
} catch (error) {
  report = { schema: 'atlas.selected-membership-bridge.v1', gate: 'CURRENT-MEMBERSHIP-BRIDGE-CENSUS-01', generatedAt: new Date().toISOString(), mode: 'READ_ONLY', executionId, status: 'AUDIT_ERROR', firstBlocker: error instanceof Error ? error.message : String(error), writesPerformed: false };
} finally {
  await pool.end();
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const tempPath = `${reportPath}.${process.pid}.tmp`;
fs.writeFileSync(tempPath, JSON.stringify(report, null, 2) + '\n');
fs.renameSync(tempPath, reportPath);
console.log(JSON.stringify(report, null, 2));
