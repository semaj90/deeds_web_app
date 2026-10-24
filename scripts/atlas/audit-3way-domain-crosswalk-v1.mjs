import pg from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import {
  buildDomainVocabularyCrosswalkCensusV2,
  buildDomainVocabularyCrosswalkReceiptV2,
  parseCodeTaxonomySourceV1,
  sha256CanonicalDomainCrosswalkV2,
  verifyDomainVocabularyCrosswalkReceiptV2,
} from './lib/domain-vocabulary-crosswalk-census-v2.mjs';

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1 });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const crosswalkQuery = `
WITH chunk_domains AS (
    SELECT DISTINCT domain AS chunk_domain
    FROM codebase_chunk_index
),
feature_domains AS (
    SELECT DISTINCT domain_class AS feat_domain_class
    FROM feature_domain
),
canonical_tax AS (
    SELECT id AS canonical_uuid, domain_id AS taxonomy_slug
    FROM domain_taxonomy_v1
)
SELECT
    c.chunk_domain,
    f.feat_domain_class,
    t.canonical_uuid,
    t.taxonomy_slug,
    COALESCE(t.taxonomy_slug, 'UNRESOLVED') AS resolved_status
FROM chunk_domains c
FULL OUTER JOIN canonical_tax t
    ON LOWER(c.chunk_domain) = LOWER(t.taxonomy_slug)
FULL OUTER JOIN feature_domains f
    ON LOWER(f.feat_domain_class) = LOWER(t.taxonomy_slug)
ORDER BY canonical_uuid NULLS LAST, chunk_domain, feat_domain_class;
`;

const packetLabelsQuery = `
SELECT domain_class AS label, count(*)::bigint AS row_count
FROM public.atlas_packets
GROUP BY domain_class
ORDER BY domain_class NULLS FIRST;
`;

let client;
try {
  client = await pool.connect();
  await client.query('BEGIN READ ONLY');
  await client.query("SET LOCAL statement_timeout = '15000ms'");
  const metadata = await client.query("SELECT current_database() AS database, current_setting('server_version') AS server_version");
  const [crosswalkResult, packetLabelsResult] = await Promise.all([
    client.query(crosswalkQuery),
    client.query(packetLabelsQuery),
  ]);
  await client.query('ROLLBACK');

  const taxonomyPath = '.okf/domains/atlas-domain-taxonomy.yaml';
  const codeTaxonomyPath = 'sveltekit-frontend/src/lib/server/atlas/domain-taxonomy.ts';
  const proposalPath = 'docs/reports/domain-crosswalk-proposal-v1.json';
  const taxonomyBytes = fs.readFileSync(path.join(root, taxonomyPath));
  const codeTaxonomyBytes = fs.readFileSync(path.join(root, codeTaxonomyPath));
  const proposalBytes = fs.readFileSync(path.join(root, proposalPath));
  const taxonomyText = taxonomyBytes.toString('utf8');
  const okfGroupIds = [...taxonomyText.matchAll(/^\s*-\s*group_id:\s*([^\s#]+)\s*$/gm)].map((match) => match[1]);
  const codeTaxonomySource = codeTaxonomyBytes.toString('utf8');
  const codeTaxonomy = parseCodeTaxonomySourceV1(codeTaxonomySource);
  const featureProposal = JSON.parse(proposalBytes.toString('utf8'));
  const crosswalkRows = crosswalkResult.rows;
  const packetLabelRows = packetLabelsResult.rows
    .map((row) => ({ label: row.label, rowCount: Number(row.row_count) }))
    .sort((left, right) => String(left.label ?? '').localeCompare(String(right.label ?? '')));
  const sourceRowsDigestSha256 = `sha256:${sha256CanonicalDomainCrosswalkV2({ crosswalkRows, packetLabelRows })}`;
  const census = buildDomainVocabularyCrosswalkCensusV2({
    database: metadata.rows[0].database,
    serverVersion: metadata.rows[0].server_version,
    crosswalkRows,
    packetLabelRows,
    okfGroupIds,
    codeTaxonomy,
    sourceArtifacts: {
      okfTaxonomy: { path: taxonomyPath, sha256: `sha256:${createHash('sha256').update(taxonomyBytes).digest('hex')}` },
      codeTaxonomy: { path: codeTaxonomyPath, sha256: `sha256:${createHash('sha256').update(codeTaxonomyBytes).digest('hex')}` },
      featureProposal: { path: proposalPath, sha256: `sha256:${createHash('sha256').update(proposalBytes).digest('hex')}` },
    },
    featureProposalRows: featureProposal.rows,
  });
  const capturedAt = new Date().toISOString();
  const runId = `domain-crosswalk-v2-${capturedAt.replace(/[-:.]/g, '')}-${randomUUID()}`;
  const receipt = buildDomainVocabularyCrosswalkReceiptV2({ census, sourceRowsDigestSha256, capturedAt, runId });
  const runDirectory = path.join(root, '.tmp', 'atlas', 'domain-crosswalk-census', runId);
  fs.mkdirSync(runDirectory, { recursive: true });
  const receiptPath = path.join(runDirectory, 'receipt.json');
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  const readbackBytes = fs.readFileSync(receiptPath);
  const readback = JSON.parse(readbackBytes.toString('utf8'));
  verifyDomainVocabularyCrosswalkReceiptV2(readback);
  const sourceDigestOnReadback = `sha256:${sha256CanonicalDomainCrosswalkV2({
    crosswalkRows: readback.legacyJoinRows,
    packetLabelRows: readback.packetRowsByLabel,
  })}`;
  if (sourceDigestOnReadback !== readback.sourceRowsDigestSha256) throw new Error('SOURCE_ROWS_READBACK_DIGEST_MISMATCH');

  process.stdout.write(`${JSON.stringify({
    schema: receipt.schema,
    runId,
    database: receipt.database,
    serverVersion: receipt.serverVersion,
    packetRows: receipt.packetRowCount,
    packetLabels: receipt.vocabularies.packet.labelCount,
    codeChunkLabels: receipt.vocabularies.codeChunk.labelCount,
    featureLabels: receipt.vocabularies.featureDomain.labelCount,
    taxonomyIdsMatch: receipt.taxonomyIdentitySetsMatch,
    codeDomains: receipt.codeTaxonomy.canonicalDomainIds.length,
    codeDomainsWithExactGroupIds: receipt.codeTaxonomy.exactOkfGroupIdMatches.length,
    codeDomainsWithoutExactGroupIds: receipt.codeTaxonomy.canonicalDomainsWithoutExactOkfGroupId,
    legacyAliasReviewRows: receipt.codeTaxonomy.legacyAliases.filter((row) => row.disposition === 'REVIEW_REQUIRED').length,
    exactSlugMatches: {
      packet: receipt.vocabularies.packet.exactCaseFoldedSlugMatches.length,
      codeChunk: receipt.vocabularies.codeChunk.exactCaseFoldedSlugMatches.length,
      featureDomain: receipt.vocabularies.featureDomain.exactCaseFoldedSlugMatches.length,
    },
    currentFeatureProposalCoverage: receipt.featureProposal.currentLabelCount - receipt.featureProposal.currentLabelsMissingFromProposal.length,
    packetOnlyLabelsComparedWithFeatureDomain: receipt.packetOnlyLabelsComparedWithFeatureDomain,
    semanticCrosswalk: receipt.semanticCrosswalk,
    canonicalAuthority: receipt.canonicalAuthority,
    mappingsApplied: receipt.mappingsApplied,
    persistentWrites: receipt.persistentWrites,
    sourceRowsDigestSha256,
    receiptPath: path.relative(root, receiptPath).split(path.sep).join('/'),
    receiptChecksumSha256: receipt.checksumSha256,
    receiptFileSha256: `sha256:${createHash('sha256').update(readbackBytes).digest('hex')}`,
    independentReadback: true,
  }, null, 2)}\n`);
} catch (err) {
  try { await client?.query('ROLLBACK'); } catch {}
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
