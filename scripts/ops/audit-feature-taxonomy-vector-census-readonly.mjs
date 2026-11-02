import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outputPath = path.join(repositoryRoot, '.tmp/atlas/feature-taxonomy-vector-census-readonly-v1.json');
const container = process.env.ATLAS_PG_CONTAINER ?? 'legal-ai-postgres';
const database = process.env.ATLAS_PG_DATABASE ?? 'legal_ai_db';
const user = process.env.ATLAS_PG_USER ?? 'legal_admin';

const digest = (value) => createHash('sha256').update(value).digest('hex');

const query = `
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30000';
SELECT json_build_object(
  'database', current_database(),
  'serverVersion', current_setting('server_version'),
  'vectorExtension', (SELECT extversion FROM pg_extension WHERE extname = 'vector'),
  'tables', json_build_object(
    'featureRegistryPresent', to_regclass('public.feature_registry') IS NOT NULL,
    'featureConceptsPresent', to_regclass('public.atlas_feature_concepts') IS NOT NULL,
    'featureSourceIdentitiesPresent', to_regclass('public.atlas_feature_source_identities') IS NOT NULL,
    'featureConceptCrosswalkPresent', to_regclass('public.atlas_feature_concept_crosswalk') IS NOT NULL,
    'featureRegistryVectorsPresent', to_regclass('public.feature_registry_vectors') IS NOT NULL
  ),
  'featureMap', (SELECT json_build_object(
    'rows', count(*),
    'withFeatureId', count(*) FILTER (WHERE feature_id IS NOT NULL AND btrim(feature_id) <> ''),
    'distinctFeatureIds', count(DISTINCT feature_id) FILTER (WHERE feature_id IS NOT NULL AND btrim(feature_id) <> ''),
    'missingFeatureId', count(*) FILTER (WHERE feature_id IS NULL OR btrim(feature_id) = '')
  ) FROM public.atlas_feature_map),
  'featureVectors', (SELECT json_build_object(
    'rows', count(*),
    'distinctFeatureIds', count(DISTINCT feature_id),
    'withLabel', count(*) FILTER (WHERE feature_label IS NOT NULL AND btrim(feature_label) <> ''),
    'withDomainClass', count(*) FILTER (WHERE domain_class IS NOT NULL AND btrim(domain_class) <> ''),
    'domainValues', coalesce(array_agg(DISTINCT domain_class) FILTER (WHERE domain_class IS NOT NULL), '{}')
  ) FROM public.atlas_feature_vectors),
  'mapFeatureVectorJoin', (SELECT json_build_object(
    'matchedDistinctFeatureIds', count(DISTINCT m.feature_id) FILTER (WHERE v.feature_id IS NOT NULL),
    'unmatchedDistinctFeatureIds', count(DISTINCT m.feature_id) FILTER (WHERE v.feature_id IS NULL)
  ) FROM (SELECT DISTINCT feature_id FROM public.atlas_feature_map WHERE feature_id IS NOT NULL AND btrim(feature_id) <> '') m
    LEFT JOIN public.atlas_feature_vectors v ON v.feature_id = m.feature_id),
  'featureEmbeddingRows', (SELECT count(*) FROM public.atlas_feature_embeddings),
  'embedding768Rows', (SELECT count(*) FROM public.atlas_embeddings_768),
  'latent64EmbeddingRows', (SELECT count(*) FROM public.atlas_embeddings_64_latent),
  'featureCandidates', (SELECT json_build_object(
    'rows', count(*),
    'withSourceRevision', count(*) FILTER (WHERE source_revision IS NOT NULL)
  ) FROM public.atlas_fi_features),
  'domainCrosswalk', (SELECT json_build_object(
    'rows', count(*),
    'canonicalRows', count(*) FILTER (WHERE canonical),
    'withTaxonomyTarget', count(*) FILTER (WHERE taxonomy_domain_id IS NOT NULL)
  ) FROM public.atlas_domain_vocabulary_crosswalk_v1),
  'taxonomyDomains', (SELECT json_build_object(
    'rows', count(*),
    'activeRows', count(*) FILTER (WHERE is_active)
  ) FROM public.domain_taxonomy_v1),
  'codebaseChunks', (SELECT json_build_object(
    'rows', count(*),
    'withEmbedding768', count(*) FILTER (WHERE content_embedding_768 IS NOT NULL),
    'embeddingGemmaRows', count(*) FILTER (WHERE embedding_model ILIKE 'embeddinggemma%'),
    'withSourceRevision', count(*) FILTER (WHERE source_revision IS NOT NULL),
    'withWorkspaceRevision', count(*) FILTER (WHERE workspace_revision IS NOT NULL),
    'withLineageBindingChecksum', count(*) FILTER (WHERE lineage_binding_checksum IS NOT NULL),
    'withLatent256', count(*) FILTER (WHERE latent_256 IS NOT NULL),
    'withLatent128', count(*) FILTER (WHERE latent_128 IS NOT NULL),
    'withLatent64', count(*) FILTER (WHERE latent_64 IS NOT NULL),
    'withKmeansCluster', count(*) FILTER (WHERE kmeans_cluster IS NOT NULL),
    'withSomCluster', count(*) FILTER (WHERE som_cluster IS NOT NULL)
  ) FROM public.codebase_chunk_index),
  'indexes', (SELECT coalesce(json_agg(json_build_object(
    'table', i.tablename,
    'name', i.indexname,
    'valid', x.indisvalid,
    'ready', x.indisready,
    'definition', i.indexdef
  ) ORDER BY i.tablename, i.indexname), '[]'::json)
    FROM pg_indexes i
    JOIN pg_class c ON c.relname = i.indexname
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = i.schemaname
    JOIN pg_index x ON x.indexrelid = c.oid
    WHERE i.schemaname = 'public'
      AND i.tablename IN ('atlas_feature_embeddings', 'atlas_embeddings_768', 'atlas_embeddings_64_latent', 'codebase_chunk_index'))
)::text;
ROLLBACK;
`;

const catalogText = execFileSync(
	'docker',
	['exec', '-i', container, 'psql', '-X', '-qAt', '-U', user, '-d', database, '-v', 'ON_ERROR_STOP=1', '-f', '-'],
	{ encoding: 'utf8', input: query, stdio: ['pipe', 'pipe', 'pipe'], timeout: 45000 }
).trim();
const data = JSON.parse(catalogText);
if (data.database !== database || !data.serverVersion.startsWith('18.') || !data.vectorExtension) {
	throw new Error('FEATURE_CENSUS_DATABASE_IDENTITY_OR_PGVECTOR_GATE_FAILED');
}

const report = {
	schema: 'atlas.feature-taxonomy-vector-census-readonly.v1',
	generatedAt: new Date().toISOString(),
	readOnly: true,
	writesPerformed: false,
	writeBoundary: 'PostgreSQL transaction explicitly BEGIN READ ONLY and ROLLBACK; only a local receipt is written.',
	querySha256: digest(query),
	data
};
const serialized = `${JSON.stringify(report, null, 2)}\n`;
mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, serialized, 'utf8');
console.log(JSON.stringify({
	outputPath: path.relative(repositoryRoot, outputPath).replaceAll(path.sep, '/'),
	database: data.database,
	serverVersion: data.serverVersion,
	featureMapRows: data.featureMap.rows,
	featureVectorRows: data.featureVectors.rows,
	codebaseChunkRows: data.codebaseChunks.rows,
	querySha256: report.querySha256,
	receiptSha256: digest(readFileSync(outputPath))
}, null, 2));
