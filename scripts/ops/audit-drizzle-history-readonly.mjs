import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const frontendRoot = path.join(repositoryRoot, 'sveltekit-frontend');
const drizzleRoot = path.join(frontendRoot, 'drizzle');
const outputDirectory = path.join(
	process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData/Local'),
	'DeedsWebApp/inventory'
);
const outputPath = path.join(outputDirectory, 'drizzle-history-readonly-latest.json');
const container = process.env.ATLAS_PG_CONTAINER ?? 'legal-ai-postgres';
const database = process.env.ATLAS_PG_DATABASE ?? 'legal_ai_db';
const user = process.env.ATLAS_PG_USER ?? 'legal_admin';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const journal = JSON.parse(readFileSync(path.join(drizzleRoot, 'meta/_journal.json'), 'utf8'));
const sidecarDocument = JSON.parse(readFileSync(path.join(drizzleRoot, 'sidecar-migrations.json'), 'utf8'));
const journalTags = new Set(journal.entries.map((entry) => `${entry.tag}.sql`));
function resolveSidecarReference(reference) {
	const candidates = [
		path.resolve(drizzleRoot, reference),
		path.resolve(frontendRoot, reference),
		path.resolve(repositoryRoot, reference)
	];
	const declaredPath = candidates.find((candidate) => existsSync(candidate));
	if (declaredPath) return { path: declaredPath, resolution: 'DECLARED_PATH' };
	const manualFallback = path.join(drizzleRoot, 'manual', path.basename(reference));
	if (existsSync(manualFallback)) {
		return { path: manualFallback, resolution: 'CANONICAL_MANUAL_BASENAME_FALLBACK' };
	}
	return { path: null, resolution: 'NOT_FOUND' };
}

function resolveSidecarFile(reference) {
	return resolveSidecarReference(reference).path;
}

function removeSqlComments(sql) {
	return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\r\n]*/g, ' ');
}

function expectedObjects(sql) {
	const source = removeSqlComments(sql);
	const objects = [];
	const patterns = [
		{
			kind: 'relation',
			regex: /\bCREATE\s+(?:UNLOGGED\s+|TEMP(?:ORARY)?\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(?:"?([\w]+)"?)\s*\.\s*)?"?([\w]+)"?/gi
		},
		{
			kind: 'index',
			regex: /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(?:(?:"?([\w]+)"?)\s*\.\s*)?"?([\w]+)"?/gi
		},
		{
			kind: 'relation',
			regex: /\bCREATE\s+(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(?:"?([\w]+)"?)\s*\.\s*)?"?([\w]+)"?/gi
		},
		{
			kind: 'relation',
			regex: /\bCREATE\s+SEQUENCE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(?:"?([\w]+)"?)\s*\.\s*)?"?([\w]+)"?/gi
		}
	];
	for (const { kind, regex } of patterns) {
		for (const match of source.matchAll(regex)) {
			const schema = match[1] ?? 'public';
			const name = match[2];
			objects.push({ kind, schema, name, key: `${schema}.${name}` });
		}
	}
	return [...new Map(objects.map((item) => [`${item.kind}:${item.key}`, item])).values()];
}

function compareObjects(objects) {
	const checked = objects.map((item) => ({
		...item,
		present: item.kind === 'index' ? indexKeys.has(item.key) : relationKeys.has(item.key)
	}));
	return {
		objects: checked,
		missing: checked.filter((item) => !item.present).map((item) => item.key),
		status: checked.length === 0
			? 'NO_RELATION_OR_INDEX_DDL_REQUIRES_MANUAL_REVIEW'
			: checked.every((item) => item.present)
				? 'EXPECTED_RELATION_AND_INDEX_NAMES_PRESENT_ONLY'
				: 'EXPECTED_RELATION_OR_INDEX_NAME_MISSING'
	};
}

const localSources = [
	...journal.entries.map((entry) => path.join(drizzleRoot, `${entry.tag}.sql`)),
	...sidecarDocument.sidecars.map((entry) => resolveSidecarFile(entry.file)).filter(Boolean)
];
const expectedCatalogObjects = [...new Map(
	localSources.flatMap((sourcePath) => expectedObjects(readFileSync(sourcePath, 'utf8')))
		.map((item) => [`${item.kind}:${item.key}`, item])
).values()];
const expectedJson = JSON.stringify(expectedCatalogObjects.map(({ kind, schema, name }) => ({
	kind,
	schema_name: schema,
	object_name: name
})));
const catalogSql = `
BEGIN READ ONLY;
SET LOCAL statement_timeout = '20000';
WITH expected AS (
  SELECT * FROM json_to_recordset($$${expectedJson}$$::json) AS x(kind text, schema_name text, object_name text)
)
SELECT json_build_object(
  'database', current_database(),
  'serverVersion', current_setting('server_version'),
  'ledger', json_build_object(
    'tableExists', to_regclass('drizzle.__drizzle_migrations') IS NOT NULL,
    'rows', (SELECT count(*) FROM drizzle.__drizzle_migrations),
    'hashes', (SELECT coalesce(json_agg(hash ORDER BY created_at), '[]'::json) FROM drizzle.__drizzle_migrations)
  ),
  'relations', (SELECT coalesce(json_agg(json_build_object('schema', n.nspname, 'name', c.relname, 'kind', c.relkind)), '[]'::json)
    FROM expected e JOIN pg_namespace n ON n.nspname = e.schema_name JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = e.object_name
    WHERE e.kind = 'relation'),
  'indexes', (SELECT coalesce(json_agg(json_build_object('schema', schemaname, 'name', indexname)), '[]'::json)
    FROM pg_indexes i JOIN expected e ON e.kind = 'index' AND e.schema_name = i.schemaname AND e.object_name = i.indexname),
  'extensions', (SELECT coalesce(json_agg(extname ORDER BY extname), '[]'::json) FROM pg_extension)
)::text;
ROLLBACK;`;
let catalogText;
try {
	catalogText = execFileSync(
		'docker',
		['exec', '-i', container, 'psql', '-X', '-qAt', '-U', user, '-d', database, '-v', 'ON_ERROR_STOP=1', '-f', '-'],
		{ encoding: 'utf8', input: catalogSql, stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 }
	).trim();
} catch (error) {
	const catalogStatus = error?.code === 'ETIMEDOUT' || error?.killed === true
		? 'BLOCKED_DB_TIMEOUT'
		: 'BLOCKED_DB_UNAVAILABLE';
	const fallbackJournalRows = journal.entries.map((entry) => {
		const filename = `${entry.tag}.sql`;
		const sqlPath = path.join(drizzleRoot, filename);
		const present = existsSync(sqlPath);
		const content = present ? readFileSync(sqlPath, 'utf8') : '';
		return {
			idx: entry.idx,
			tag: entry.tag,
			when: entry.when,
			sqlFilePresent: present,
			sqlSha256: present ? sha256(content) : null,
			ledgerRowPresent: null,
			liveObjectCheck: null
		};
	});
	const fallbackSidecarRows = sidecarDocument.sidecars.map((entry) => {
		const fileResolution = resolveSidecarReference(entry.file);
		const resolvedPath = fileResolution.path;
		const present = Boolean(resolvedPath);
		const content = present ? readFileSync(resolvedPath, 'utf8') : '';
		return {
			file: entry.file,
			status: entry.status,
			requiresJournalEntry: entry.requiresJournalEntry ?? null,
			appliedAt: entry.appliedAt ?? null,
			sourceFilePresent: present,
			sourcePathResolution: fileResolution.resolution,
			resolvedPath: resolvedPath ? path.relative(repositoryRoot, resolvedPath).replaceAll(path.sep, '/') : null,
			sqlSha256: present ? sha256(content) : null,
			journalEntryPresent: journalTags.has(path.basename(entry.file)),
			ledgerRowPresent: null,
			liveObjectCheck: null,
			statusInterpretation: !present
				? 'SOURCE_FILE_MISSING_CLAIM_UNVERIFIABLE'
				: entry.requiresJournalEntry && !journalTags.has(path.basename(entry.file))
					? 'REQUIRED_JOURNAL_ENTRY_MISSING'
					: entry.status?.startsWith('applied')
						? 'APPLIED_CLAIM_NOT_CHECKED_LIVE_CATALOG_UNAVAILABLE'
						: 'NON_APPLIED_STATE_REVIEW_AS_PLANNED_OR_CANDIDATE'
		};
	});
	if (existsSync(outputPath)) {
		const archiveTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const archivePath = path.join(outputDirectory, `drizzle-history-readonly-${archiveTimestamp}.json`);
		try {
			writeFileSync(archivePath, readFileSync(outputPath));
		} catch {}
	}
	const localReceipt = {
		schema: 'atlas.drizzle-history-readonly-audit.v1',
		generatedAt: new Date().toISOString(),
		status: 'BLOCKED_CATALOG_UNAVAILABLE',
		catalogStatus,
		readOnly: true,
		writesPerformed: false,
		writeBoundary: 'Catalog query failed or timed out before a result; no database writes were issued.',
		catalogError: {
			code: typeof error?.code === 'string' ? error.code : 'UNKNOWN',
			name: typeof error?.name === 'string' ? error.name : 'Error',
			timedOut: catalogStatus === 'BLOCKED_DB_TIMEOUT'
		},
		catalog: {
			database,
			container,
			available: false,
			errorCode: typeof error?.code === 'string' ? error.code : 'UNKNOWN',
			errorName: typeof error?.name === 'string' ? error.name : 'Error',
			ledger: { exists: null, rows: null, hashes: null },
			relations: null,
			indexes: null,
			extensions: null
		},
		local: {
			journalCount: fallbackJournalRows.length,
			journalSqlFilesPresent: fallbackJournalRows.filter((entry) => entry.sqlFilePresent).length,
			sidecarCount: fallbackSidecarRows.length,
			appliedSidecarCount: sidecarDocument.sidecars.filter((entry) => entry.status?.startsWith('applied')).length,
			sidecarSourcesMissing: sidecarDocument.sidecars.filter((entry) => !resolveSidecarFile(entry.file)).map((entry) => entry.file),
			sidecarsRequiringJournalMissingEntry: sidecarDocument.sidecars
				.filter((entry) => entry.requiresJournalEntry && !journalTags.has(path.basename(entry.file)))
				.map((entry) => entry.file),
			journalRows: fallbackJournalRows,
			sidecarRows: fallbackSidecarRows
		},
		journalRows: fallbackJournalRows,
		sidecarRows: fallbackSidecarRows,
		limitations: ['No live ledger, schema, or migration-application state was verified. Local journal and sidecar counts are not evidence of database application.']
	};
	mkdirSync(outputDirectory, { recursive: true });
	writeFileSync(outputPath, `${JSON.stringify(localReceipt, null, 2)}\n`, 'utf8');
	console.log(JSON.stringify({
		outputPath,
		status: localReceipt.status,
		catalogStatus: localReceipt.catalogStatus,
		journalEntries: localReceipt.local.journalCount,
		journalSqlFilesPresent: localReceipt.local.journalSqlFilesPresent,
		sidecars: localReceipt.local.sidecarCount,
		errorCode: localReceipt.catalog.errorCode
	}, null, 2));
	process.exit(1);
}
const catalog = JSON.parse(catalogText);
const relationKeys = new Set(catalog.relations.map((item) => `${item.schema}.${item.name}`));
const indexKeys = new Set(catalog.indexes.map((item) => `${item.schema}.${item.name}`));

const journalRows = journal.entries.map((entry) => {
	const filename = `${entry.tag}.sql`;
	const sqlPath = path.join(drizzleRoot, filename);
	const present = existsSync(sqlPath);
	const content = present ? readFileSync(sqlPath, 'utf8') : '';
	const comparison = compareObjects(expectedObjects(content));
	return {
		idx: entry.idx,
		tag: entry.tag,
		when: entry.when,
		sqlFilePresent: present,
		sqlSha256: present ? sha256(content) : null,
		ledgerRowPresent: catalog.ledger.hashes.some((hash) => present && hash === sha256(content)),
		liveObjectCheck: comparison
	};
});

const sidecarRows = sidecarDocument.sidecars.map((entry) => {
	const fileResolution = resolveSidecarReference(entry.file);
	const resolvedPath = fileResolution.path;
	const present = Boolean(resolvedPath);
	const content = present ? readFileSync(resolvedPath, 'utf8') : '';
	const filename = path.basename(entry.file);
	const inJournal = journalTags.has(filename);
	return {
		file: entry.file,
		status: entry.status,
		requiresJournalEntry: entry.requiresJournalEntry ?? null,
		appliedAt: entry.appliedAt ?? null,
		sourceFilePresent: present,
		sourcePathResolution: fileResolution.resolution,
		resolvedPath: resolvedPath ? path.relative(repositoryRoot, resolvedPath).replaceAll(path.sep, '/') : null,
		sqlSha256: present ? sha256(content) : null,
		journalEntryPresent: inJournal,
		ledgerRowPresent: present && catalog.ledger.hashes.includes(sha256(content)),
		liveObjectCheck: present ? compareObjects(expectedObjects(content)) : null,
		statusInterpretation: !present
			? 'SOURCE_FILE_MISSING_CLAIM_UNVERIFIABLE'
			: entry.requiresJournalEntry && !inJournal
				? 'REQUIRED_JOURNAL_ENTRY_MISSING'
				: entry.status?.startsWith('applied')
					? 'APPLIED_CLAIM_REQUIRES_DEFINITION_AND_READBACK_REVIEW'
					: 'NON_APPLIED_STATE_REVIEW_AS_PLANNED_OR_CANDIDATE'
		};
});

const report = {
	schema: 'atlas.drizzle-history-readonly-audit.v1',
	generatedAt: new Date().toISOString(),
	readOnly: true,
	writesPerformed: false,
	writeBoundary: 'PostgreSQL transaction explicitly BEGIN READ ONLY and ROLLBACK; only a local receipt is written.',
	catalog: {
		database: catalog.database,
		serverVersion: catalog.serverVersion,
		ledger: catalog.ledger,
		relationCount: catalog.relations.length,
		indexCount: catalog.indexes.length,
		extensions: catalog.extensions
	},
	local: {
		journalCount: journalRows.length,
		sidecarCount: sidecarRows.length,
		journalSqlFilesPresent: journalRows.filter((row) => row.sqlFilePresent).length,
		journalRowsWithMatchingLiveLedgerHash: journalRows.filter((row) => row.ledgerRowPresent).length,
		appliedSidecarCount: sidecarRows.filter((row) => row.status?.startsWith('applied')).length,
		appliedSidecarsMissingSource: sidecarRows.filter((row) => row.status?.startsWith('applied') && !row.sourceFilePresent).length,
		sidecarReferencesResolvedByCanonicalManualFallback: sidecarRows.filter((row) => row.sourcePathResolution === 'CANONICAL_MANUAL_BASENAME_FALLBACK').length,
		sidecarsRequiringJournalMissingEntry: sidecarRows.filter((row) => row.requiresJournalEntry && !row.journalEntryPresent).length
	},
	limitations: [
		'Presence of parsed relation or index names does not prove SQL definition, constraint, policy, ownership, or migration ordering equivalence.',
		'Unsupported DDL, dynamic SQL, triggers, functions, extensions, generated columns, and data backfills remain manual-review items.',
		'An empty migration ledger does not prove that schema objects are absent or safe to recreate.'
	],
	journalRows,
	sidecarRows
};

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
	outputPath,
	database: report.catalog.database,
	serverVersion: report.catalog.serverVersion,
	ledgerRows: report.catalog.ledger.rows,
	journalEntries: report.local.journalCount,
	journalSqlFilesPresent: report.local.journalSqlFilesPresent,
	appliedSidecars: report.local.appliedSidecarCount,
	appliedSidecarsMissingSource: report.local.appliedSidecarsMissingSource,
	sidecarsRequiringJournalMissingEntry: report.local.sidecarsRequiringJournalMissingEntry,
	sha256: sha256(readFileSync(outputPath))
}, null, 2));
