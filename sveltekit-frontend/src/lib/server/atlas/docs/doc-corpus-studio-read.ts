/**
 * DOC-CORPUS-STUDIO read model (STUDIO-DOCS-SSR-01 / DOC-CORPUS-VALIDATION-01 / DOC-CORPUS-SEARCH-01).
 *
 * READ ONLY. Never writes Postgres/Qdrant/Valkey/Neo4j, never crawls, never runs DDL.
 * Pool is injected (same style as external-doc-admission.ts) so the module has no $lib dependency
 * and can run from tsx scripts and vitest as well as SvelteKit.
 *
 * Authority: PostgreSQL atlas_external_doc_pages/chunks is the only canonical documentation evidence
 * owner. docs/.okf/dev (TS crawler corpus) and docs/.okf/pinned (python pipeline captures) are
 * local reference/generated corpora and are labelled as such, never CANONICAL.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { Pool } from 'pg';

export const STALE_AFTER_DAYS = 30;

export const REQUIRED_TERMS = [
	'halfvec', 'halfvec_cosine_ops', 'vector_cosine_ops', 'hnsw.iterative_scan', 'strict_order',
	'relaxed_order', 'hnsw.max_scan_tuples', 'hnsw.scan_mem_multiplier', 'io_method',
	'effective_io_concurrency', 'maintenance_io_concurrency', 'pg_aios', 'bitmap heap', 'uuidv7',
	'drizzle-kit', 'operator class'
] as const;

/** Required pinned coverage groups -> capture directory under docs/.okf/pinned. */
export const PINNED_GROUPS = [
	{ group: 'drizzle', dir: 'drizzle-orm', runtimeKey: 'drizzleOrm' },
	{ group: 'pgvector', dir: 'pgvector', runtimeKey: 'pgvector' },
	{ group: 'postgresql18', dir: 'postgresql-18', runtimeKey: 'postgres' }
] as const;

export type VersionQualification = 'EXACT_PIN' | 'MAJOR_VERSION_PIN' | 'CURRENT_UPSTREAM' | 'UNVERSIONED';
export type RuntimeCompatibility = 'MATCH' | 'NEWER_UPSTREAM' | 'UNKNOWN';
export type CoverageStatus = 'CAPTURED_CURRENT' | 'CAPTURED_STALE' | 'VERSION_UNQUALIFIED' | 'MISSING';
export type AuthorityBadge = 'CANONICAL' | 'REFERENCE_ONLY' | 'GENERATED_CORPUS';

export interface SourceCapture {
	sourceId: string;
	sourceUrl: string;
	title: string;
	provenance: 'PINNED_CAPTURE' | 'DEV_CORPUS';
	authorityClass: 'OFFICIAL_PRIMARY' | 'SECONDARY_ISSUE_EVIDENCE' | 'GENERATED';
	capturedAt: string | null;
	contentChecksum: string | null;
	versionQualification: VersionQualification;
	runtimeCompatibility: RuntimeCompatibility;
	markdownPath: string | null;
	fileExists: boolean;
	checksumMatches: boolean | null;
}

export interface ValidationIssue {
	code: string;
	detail: string;
}

export interface RuntimeVersions {
	postgres: string | null;
	pgvector: string | null;
	drizzleOrm: string | null;
	drizzleKit: string | null;
	pg: string | null;
}

export interface IndexInfo {
	table: string;
	name: string;
	accessMethod: string;
	operatorClass: string | null;
	predicate: string | null;
	definition: string;
}

export interface PostgresCorpusReadout {
	available: boolean;
	error: string | null;
	tablesPresent: string[];
	pageCount: number | null;
	chunkCount: number | null;
	columns: Record<string, string>;
	ftsAvailable: boolean;
	vectorColumnAvailable: boolean;
	indexes: IndexInfo[];
	empty: boolean;
}

export interface CapabilityReadout {
	available: boolean;
	error: string | null;
	settings: Record<string, string | null>;
	pgAiosAvailable: boolean;
	uuidv7Available: boolean;
	pgvectorVersion: string | null;
	halfvecAvailable: boolean;
	hnswIndexPresent: boolean;
	bitmap: {
		plannerCanGenerateBitmap: boolean;
		plannerSelectedBitmap: boolean;
		aioRelevant: boolean;
		ioMethod: string | null;
		fixtures: { name: string; nodeTypes: string[] }[];
	};
}

export interface DocSearchHit {
	title: string;
	sourceId: string;
	url: string | null;
	product: string | null;
	productVersion: string | null;
	authorityClass: string;
	revision: string | null;
	excerpt: string;
	badge: AuthorityBadge;
}

export interface DocSearchResult {
	query: string;
	mode: 'POSTGRES_FTS' | 'LOCAL_LEXICAL';
	hits: DocSearchHit[];
	postgresNote: string | null;
}

export interface DocCorpusStudioSnapshotV1 {
	schema: 'atlas.doc-corpus-studio-snapshot.v1';
	generatedAt: string;
	runtimeVersions: RuntimeVersions;
	localCorpus: {
		sourceCount: number;
		pageCount: number;
		capturedAt: string | null;
		staleSources: string[];
		missingSources: string[];
	};
	postgresCorpus: {
		pageCount: number | null;
		chunkCount: number | null;
		ftsAvailable: boolean;
		vectorColumnAvailable: boolean;
		indexes: IndexInfo[];
		status: 'PRESENT' | 'EMPTY' | 'UNAVAILABLE';
	};
	capabilities: {
		aio: { ioMethod: string | null; pgAiosAvailable: boolean };
		bitmap: CapabilityReadout['bitmap'];
		hnsw: boolean;
		halfvec: boolean;
	};
	coverage: { group: string; status: CoverageStatus; bestQualification: VersionQualification | null; runtimeCompatibility: RuntimeCompatibility; captures: number }[];
	sources: SourceCapture[];
	validation: { status: 'PASS' | 'PARTIAL' | 'FAIL'; issues: ValidationIssue[] };
	canonicalAuthority: 'POSTGRES';
	generatedCorpusAuthority: false;
}

// ---------------------------------------------------------------------------------------------
// filesystem helpers

export function findRepoRoot(start = process.cwd()): string {
	for (const candidate of [start, resolve(start, '..'), resolve(start, '..', '..')]) {
		if (existsSync(join(candidate, 'docs', '.okf'))) return candidate;
	}
	return start;
}

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
/** Captures are written in text mode on Windows (CRLF); the contract hash is over LF text. */
const normalizeNewlines = (text: string) => text.replace(/\r\n/g, '\n');

function readJsonl(path: string): { rows: Record<string, unknown>[]; badLines: number } {
	if (!existsSync(path)) return { rows: [], badLines: 0 };
	const rows: Record<string, unknown>[] = [];
	let badLines = 0;
	for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
		if (!line.trim()) continue;
		try {
			rows.push(JSON.parse(line) as Record<string, unknown>);
		} catch {
			badLines += 1;
		}
	}
	return { rows, badLines };
}

function listFiles(dir: string, suffix: string): string[] {
	if (!existsSync(dir)) return [];
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...listFiles(full, suffix));
		else if (entry.name.endsWith(suffix)) out.push(full);
	}
	return out;
}

export function qualifyUrl(url: string, runtime: RuntimeVersions): { q: VersionQualification; c: RuntimeCompatibility; authority: SourceCapture['authorityClass'] } {
	const u = url.toLowerCase();
	if (/github\.com\/[^/]+\/[^/]+\/issues\//.test(u)) return { q: 'UNVERSIONED', c: 'UNKNOWN', authority: 'SECONDARY_ISSUE_EVIDENCE' };
	const pgMajor = /postgresql\.org\/docs\/(\d+)\//.exec(u);
	if (pgMajor) {
		const localMajor = runtime.postgres?.match(/^(\d+)/)?.[1] ?? null;
		return { q: 'MAJOR_VERSION_PIN', c: localMajor === pgMajor[1] ? 'MATCH' : localMajor ? 'NEWER_UPSTREAM' : 'UNKNOWN', authority: 'OFFICIAL_PRIMARY' };
	}
	// Everything else fetched from a live "latest" page: current upstream, not qualified to the local pin.
	return { q: 'CURRENT_UPSTREAM', c: 'UNKNOWN', authority: 'OFFICIAL_PRIMARY' };
}

// ---------------------------------------------------------------------------------------------
// local corpus validation (docs/.okf/dev corpus + docs/.okf/pinned captures)

export function collectLocalCaptures(root: string, runtime: RuntimeVersions): { sources: SourceCapture[]; issues: ValidationIssue[]; devRows: number } {
	const issues: ValidationIssue[] = [];
	const sources: SourceCapture[] = [];
	const dev = join(root, 'docs', '.okf', 'dev');

	if (!existsSync(join(dev, 'manifest.json'))) issues.push({ code: 'DEV_MANIFEST_MISSING', detail: 'docs/.okf/dev/manifest.json' });
	if (!existsSync(join(dev, 'index.md'))) issues.push({ code: 'DEV_INDEX_MISSING', detail: 'docs/.okf/dev/index.md' });
	if (existsSync(join(dev, 'summary.json'))) {
		try { JSON.parse(readFileSync(join(dev, 'summary.json'), 'utf8')); } catch { issues.push({ code: 'DEV_SUMMARY_UNPARSEABLE', detail: 'docs/.okf/dev/summary.json' }); }
	} else issues.push({ code: 'DEV_SUMMARY_MISSING', detail: 'docs/.okf/dev/summary.json' });

	const corpusPath = join(dev, 'corpus.jsonl');
	if (!existsSync(corpusPath)) issues.push({ code: 'DEV_CORPUS_MISSING', detail: 'docs/.okf/dev/corpus.jsonl' });
	const { rows, badLines } = readJsonl(corpusPath);
	if (badLines) issues.push({ code: 'DEV_CORPUS_UNPARSEABLE_LINES', detail: String(badLines) });

	const seenRef = new Set<string>();
	const seenUrl = new Set<string>();
	for (const row of rows) {
		const missing = ['source_id', 'source_ref', 'url', 'title', 'content_hash', 'fetched_at', 'markdown_path'].filter((k) => !row[k]);
		if (missing.length) issues.push({ code: 'DEV_ROW_MISSING_FIELDS', detail: `${String(row.source_ref ?? row.url ?? '?')}: ${missing.join(',')}` });
		const ref = String(row.source_ref ?? '');
		if (ref && seenRef.has(ref)) issues.push({ code: 'DEV_DUPLICATE_SOURCE_REF', detail: ref });
		seenRef.add(ref);
		const urlKey = String(row.url ?? '');
		if (urlKey && seenUrl.has(urlKey)) issues.push({ code: 'DEV_DUPLICATE_URL', detail: urlKey });
		seenUrl.add(urlKey);

		const mdPath = row.markdown_path ? resolve(String(row.markdown_path)) : null;
		const fileExists = !!mdPath && existsSync(mdPath);
		let checksumMatches: boolean | null = null;
		if (mdPath && fileExists) {
			checksumMatches = sha256(normalizeNewlines(readFileSync(mdPath, 'utf8'))) === row.content_hash;
			if (!checksumMatches) issues.push({ code: 'DEV_CHECKSUM_MISMATCH', detail: `${ref}: hash contract is over the crawler's own text form; recompute differs` });
		} else if (mdPath) issues.push({ code: 'DEV_MARKDOWN_MISSING', detail: `${ref}: ${mdPath}` });
		sources.push({
			sourceId: String(row.source_id ?? ''), sourceUrl: urlKey, title: String(row.title ?? ''), provenance: 'DEV_CORPUS',
			authorityClass: 'GENERATED', capturedAt: row.fetched_at ? String(row.fetched_at) : null,
			contentChecksum: row.content_hash ? String(row.content_hash) : null,
			versionQualification: 'UNVERSIONED', runtimeCompatibility: 'UNKNOWN',
			markdownPath: mdPath ? relative(root, mdPath).replace(/\\/g, '/') : null, fileExists, checksumMatches
		});
	}

	const pinnedRoot = join(root, 'docs', '.okf', 'pinned');
	const seenPinned = new Set<string>();
	for (const receiptPath of listFiles(pinnedRoot, '.json').filter((p) => /[\\/]raw[\\/]/.test(p))) {
		let r: Record<string, unknown>;
		try { r = JSON.parse(readFileSync(receiptPath, 'utf8')) as Record<string, unknown>; } catch { issues.push({ code: 'PINNED_RECEIPT_UNPARSEABLE', detail: receiptPath }); continue; }
		const url = String(r.resolved_url ?? r.requested_url ?? '');
		const key = `${r.source_id}|${url}`;
		if (seenPinned.has(key)) issues.push({ code: 'PINNED_DUPLICATE_SOURCE_URL', detail: key });
		seenPinned.add(key);
		const mdPath = receiptPath.replace(/\.json$/, '.md');
		const fileExists = existsSync(mdPath);
		let checksumMatches: boolean | null = null;
		if (fileExists) {
			checksumMatches = sha256(normalizeNewlines(readFileSync(mdPath, 'utf8'))) === r.normalized_checksum;
			if (!checksumMatches) issues.push({ code: 'PINNED_CHECKSUM_MISMATCH', detail: url });
		} else issues.push({ code: 'PINNED_MARKDOWN_MISSING', detail: url });
		const qual = qualifyUrl(url, runtime);
		sources.push({
			sourceId: String(r.source_id ?? ''), sourceUrl: url, title: String(r.title ?? ''), provenance: 'PINNED_CAPTURE',
			authorityClass: qual.authority, capturedAt: r.fetched_at ? String(r.fetched_at) : null,
			contentChecksum: r.normalized_checksum ? String(r.normalized_checksum) : null,
			versionQualification: qual.q, runtimeCompatibility: qual.c,
			markdownPath: relative(root, mdPath).replace(/\\/g, '/'), fileExists, checksumMatches
		});
	}
	return { sources, issues, devRows: rows.length };
}

export function computeCoverage(sources: SourceCapture[], now = new Date()) {
	const rank: Record<VersionQualification, number> = { EXACT_PIN: 3, MAJOR_VERSION_PIN: 2, CURRENT_UPSTREAM: 1, UNVERSIONED: 0 };
	return PINNED_GROUPS.map(({ group, dir }) => {
		const caps = sources.filter((s) => s.provenance === 'PINNED_CAPTURE' && s.sourceId === dir && s.authorityClass === 'OFFICIAL_PRIMARY');
		if (!caps.length) return { group, status: 'MISSING' as CoverageStatus, bestQualification: null, runtimeCompatibility: 'UNKNOWN' as RuntimeCompatibility, captures: 0 };
		const best = caps.reduce((a, b) => (rank[b.versionQualification] > rank[a.versionQualification] ? b : a));
		const newest = Math.max(...caps.map((c) => (c.capturedAt ? Date.parse(c.capturedAt) : 0)));
		const ageDays = (now.getTime() - newest) / 86_400_000;
		const status: CoverageStatus = best.versionQualification === 'UNVERSIONED' ? 'VERSION_UNQUALIFIED' : !newest || ageDays > STALE_AFTER_DAYS ? 'CAPTURED_STALE' : 'CAPTURED_CURRENT';
		return { group, status, bestQualification: best.versionQualification, runtimeCompatibility: best.runtimeCompatibility, captures: caps.length };
	});
}

export function scanRequiredTerms(root: string, terms: readonly string[] = REQUIRED_TERMS) {
	const files = [...listFiles(join(root, 'docs', '.okf', 'dev', 'raw'), '.md'), ...listFiles(join(root, 'docs', '.okf', 'pinned'), '.md')];
	const texts = files.map((f) => {
		const rel = relative(join(root, 'docs', '.okf'), f).replace(/\\/g, '/');
		const sourceId = rel.startsWith('pinned/') ? rel.split('/')[1] : `dev:${rel.split('/')[2] ?? 'dev'}`;
		const text = readFileSync(f, 'utf8').toLowerCase();
		return { sourceId, text, compact: text.replace(/\s+/g, '') };
	});
	const count = (haystack: string, needle: string) => {
		let n = 0;
		for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + needle.length)) n += 1;
		return n;
	};
	return terms.map((term) => {
		const needle = term.toLowerCase();
		const compactNeedle = needle.replace(/\s+/g, '');
		const bySource: Record<string, number> = {};
		let split = 0;
		for (const { sourceId, text, compact } of texts) {
			const literal = count(text, needle);
			if (literal) bySource[sourceId] = (bySource[sourceId] ?? 0) + literal;
			// GitHub-highlighted code is captured one token per line ("hnsw" / "." / "iterative_scan"): a literal search
			// misses it. Whitespace-insensitive hits are reported separately and never counted as literal support.
			split += Math.max(0, count(compact, compactNeedle) - literal);
		}
		return { term, totalHits: Object.values(bySource).reduce((a, b) => a + b, 0), tokenSplitHits: split, sources: bySource };
	});
}

// ---------------------------------------------------------------------------------------------
// postgres readbacks (SELECT / SHOW / EXPLAIN only)

const DOC_TABLES = ['atlas_external_doc_pages', 'atlas_external_doc_chunks'];
const WANTED_COLUMNS = ['provider', 'product', 'product_version', 'architecture', 'evidence_revision', 'text', 'content_embedding', 'search_vector'];

export async function readIndexes(pool: Pool, tables: string[]): Promise<IndexInfo[]> {
	const { rows } = await pool.query(
		`SELECT t.relname AS tbl, i.relname AS name, am.amname AS am, pg_get_indexdef(i.oid) AS def,
		        pg_get_expr(x.indpred, x.indrelid) AS predicate
		   FROM pg_index x
		   JOIN pg_class i ON i.oid = x.indexrelid
		   JOIN pg_class t ON t.oid = x.indrelid
		   JOIN pg_am am ON am.oid = i.relam
		  WHERE t.relname = ANY($1) AND t.relnamespace = 'public'::regnamespace
		  ORDER BY t.relname, i.relname`,
		[tables]
	);
	return rows.map((r: Record<string, string | null>) => ({
		table: String(r.tbl), name: String(r.name), accessMethod: String(r.am),
		operatorClass: /\b([a-z0-9_]+_ops)\b/.exec(String(r.def))?.[1] ?? null,
		predicate: r.predicate ?? null, definition: String(r.def)
	}));
}

export async function readPostgresCorpus(pool: Pool): Promise<PostgresCorpusReadout> {
	const empty: PostgresCorpusReadout = { available: false, error: null, tablesPresent: [], pageCount: null, chunkCount: null, columns: {}, ftsAvailable: false, vectorColumnAvailable: false, indexes: [], empty: false };
	try {
		const tables = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1)`, [DOC_TABLES]);
		const tablesPresent = tables.rows.map((r: { table_name: string }) => r.table_name);
		if (tablesPresent.length < DOC_TABLES.length) return { ...empty, available: true, tablesPresent };
		const cols = await pool.query(
			`SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type
			   FROM pg_attribute a WHERE a.attrelid IN ('public.atlas_external_doc_pages'::regclass, 'public.atlas_external_doc_chunks'::regclass)
			    AND a.attnum > 0 AND NOT a.attisdropped AND a.attname = ANY($1)`,
			[WANTED_COLUMNS]
		);
		const columns: Record<string, string> = {};
		for (const r of cols.rows as { name: string; type: string }[]) columns[r.name] = r.type;
		const pages = Number((await pool.query('SELECT count(*)::int AS n FROM atlas_external_doc_pages')).rows[0].n);
		const chunks = Number((await pool.query('SELECT count(*)::int AS n FROM atlas_external_doc_chunks')).rows[0].n);
		const indexes = await readIndexes(pool, DOC_TABLES);
		return {
			available: true, error: null, tablesPresent, pageCount: pages, chunkCount: chunks, columns,
			ftsAvailable: !!columns.search_vector && indexes.some((i) => i.accessMethod === 'gin' && /search_vector/.test(i.definition)),
			vectorColumnAvailable: /^(half)?vec/.test(columns.content_embedding ?? ''),
			indexes, empty: chunks === 0
		};
	} catch (error) {
		return { ...empty, error: error instanceof Error ? error.message : String(error) };
	}
}

const BITMAP_FIXTURES = [
	{ name: 'codebase_chunk_index.semantic_tags GIN containment', sql: `EXPLAIN (FORMAT JSON) SELECT id FROM codebase_chunk_index WHERE semantic_tags @> ARRAY['__doc_corpus_probe__']::text[]` },
	{ name: 'atlas_external_doc_chunks.domain_tags GIN containment', sql: `EXPLAIN (FORMAT JSON) SELECT id FROM atlas_external_doc_chunks WHERE domain_tags @> ARRAY['__doc_corpus_probe__']::text[]` }
];

function planNodeTypes(plan: unknown, acc: string[] = []): string[] {
	if (!plan || typeof plan !== 'object') return acc;
	const node = plan as Record<string, unknown>;
	if (typeof node['Node Type'] === 'string') acc.push(node['Node Type'] as string);
	for (const child of (node.Plans as unknown[] | undefined) ?? []) planNodeTypes(child, acc);
	if (node.Plan) planNodeTypes(node.Plan, acc);
	return acc;
}

export async function readCapabilities(pool: Pool): Promise<CapabilityReadout> {
	const unavailable: CapabilityReadout = {
		available: false, error: null, settings: {}, pgAiosAvailable: false, uuidv7Available: false, pgvectorVersion: null,
		halfvecAvailable: false, hnswIndexPresent: false,
		bitmap: { plannerCanGenerateBitmap: false, plannerSelectedBitmap: false, aioRelevant: false, ioMethod: null, fixtures: [] }
	};
	try {
		const settings: Record<string, string | null> = { server_version: null, io_method: null, effective_io_concurrency: null, maintenance_io_concurrency: null };
		for (const name of Object.keys(settings)) settings[name] = String((await pool.query(`SELECT current_setting($1) AS v`, [name])).rows[0].v);
		const vec = (await pool.query(`SELECT extversion FROM pg_extension WHERE extname='vector'`)).rows[0]?.extversion ?? null;
		const pgAios = (await pool.query(`SELECT count(*)::int AS n FROM pg_class WHERE relname='pg_aios' AND relnamespace='pg_catalog'::regnamespace`)).rows[0].n > 0;
		const uuid7 = (await pool.query(`SELECT count(*)::int AS n FROM pg_proc WHERE proname='uuidv7'`)).rows[0].n > 0;
		const halfvec = (await pool.query(`SELECT count(*)::int AS n FROM pg_type WHERE typname='halfvec'`)).rows[0].n > 0;
		const hnsw = (await pool.query(`SELECT count(*)::int AS n FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_am am ON am.oid=i.relam WHERE am.amname='hnsw'`)).rows[0].n > 0;
		const fixtures: { name: string; nodeTypes: string[] }[] = [];
		let capable = false;
		for (const fixture of BITMAP_FIXTURES) {
			try {
				const r = await pool.query(fixture.sql);
				fixtures.push({ name: fixture.name, nodeTypes: planNodeTypes(r.rows[0]['QUERY PLAN'][0]) });
			} catch {
				fixtures.push({ name: fixture.name, nodeTypes: ['UNAVAILABLE'] });
			}
		}
		// A GIN index cannot serve a plain index scan: an existing GIN index on a fixture's predicate column means the
		// planner CAN produce a Bitmap Index Scan (capability), independent of what it picked for an empty/rare probe.
		const gin = await readIndexes(pool, ['codebase_chunk_index', 'atlas_external_doc_chunks']);
		capable = gin.some((i) => i.accessMethod === 'gin');
		const selected = fixtures.some((f) => f.nodeTypes.some((n) => n.startsWith('Bitmap')));
		return {
			available: true, error: null, settings, pgAiosAvailable: pgAios, uuidv7Available: uuid7, pgvectorVersion: vec,
			halfvecAvailable: halfvec, hnswIndexPresent: hnsw,
			bitmap: { plannerCanGenerateBitmap: capable, plannerSelectedBitmap: selected, aioRelevant: settings.io_method !== 'sync', ioMethod: settings.io_method, fixtures }
		};
	} catch (error) {
		return { ...unavailable, error: error instanceof Error ? error.message : String(error) };
	}
}

// ---------------------------------------------------------------------------------------------
// search: canonical Postgres FTS first, local lexical fallback second (never web, never Qdrant)

function localLexicalSearch(root: string, q: string, limit: number, sources: SourceCapture[]): DocSearchHit[] {
	const tokens = q.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
	if (!tokens.length) return [];
	const hits: (DocSearchHit & { score: number })[] = [];
	for (const s of sources) {
		if (!s.markdownPath || !s.fileExists) continue;
		const text = readFileSync(join(root, s.markdownPath), 'utf8');
		const lower = text.toLowerCase();
		if (!tokens.every((t) => lower.includes(t))) continue;
		const at = lower.indexOf(tokens[0]);
		const score = tokens.reduce((n, t) => n + lower.split(t).length - 1, 0);
		hits.push({
			title: s.title, sourceId: s.sourceId, url: s.sourceUrl, product: null, productVersion: null,
			authorityClass: s.authorityClass, revision: s.contentChecksum ? `sha256:${s.contentChecksum.slice(0, 16)}` : null,
			excerpt: text.slice(Math.max(0, at - 80), at + 220).replace(/\s+/g, ' ').trim(),
			badge: s.provenance === 'DEV_CORPUS' ? 'GENERATED_CORPUS' : 'REFERENCE_ONLY', score
		});
	}
	return hits.sort((a, b) => b.score - a.score).slice(0, limit).map(({ score: _score, ...hit }) => hit);
}

export async function searchDocCorpus(opts: { pool: Pool | null; root: string; q: string; limit?: number; runtime?: RuntimeVersions }): Promise<DocSearchResult> {
	const limit = Math.min(Math.max(opts.limit ?? 10, 1), 25);
	const q = opts.q.trim().slice(0, 300);
	let postgresNote: string | null = null;
	if (q.length >= 2 && opts.pool) {
		try {
			const counts = await opts.pool.query(`SELECT count(*)::int AS n FROM atlas_external_doc_chunks`);
			if (counts.rows[0].n > 0) {
				const { rows } = await opts.pool.query(
					`SELECT c.chunk_id, p.title, p.product, p.product_version, p.url, p.source_authority, p.evidence_revision,
					        ts_headline('english', c.text, query, 'MaxFragments=1,MaxWords=35,MinWords=12') AS excerpt
					   FROM atlas_external_doc_chunks c
					   JOIN atlas_external_doc_pages p ON p.id = c.page_id, plainto_tsquery('english', $1) query
					  WHERE c.search_vector @@ query
					  ORDER BY ts_rank(c.search_vector, query) DESC LIMIT $2`,
					[q, limit]
				);
				return {
					query: q, mode: 'POSTGRES_FTS', postgresNote: null,
					hits: rows.map((r: Record<string, string | null>) => ({
						title: String(r.title), sourceId: String(r.product ?? ''), url: r.url, product: r.product, productVersion: r.product_version,
						authorityClass: String(r.source_authority ?? ''), revision: r.evidence_revision, excerpt: String(r.excerpt ?? ''), badge: 'CANONICAL' as const
					}))
				};
			}
			postgresNote = 'DOC_CORPUS_POSTGRES_EMPTY';
		} catch (error) {
			postgresNote = `POSTGRES_UNAVAILABLE:${error instanceof Error ? error.message : String(error)}`;
		}
	}
	const runtime = opts.runtime ?? { postgres: null, pgvector: null, drizzleOrm: null, drizzleKit: null, pg: null };
	const { sources } = collectLocalCaptures(opts.root, runtime);
	return { query: q, mode: 'LOCAL_LEXICAL', postgresNote, hits: q.length >= 2 ? localLexicalSearch(opts.root, q, limit, sources) : [] };
}

// ---------------------------------------------------------------------------------------------
// runtime versions + snapshot

export function readRepoVersions(root: string): Pick<RuntimeVersions, 'drizzleOrm' | 'drizzleKit' | 'pg'> {
	const candidates = [join(root, 'sveltekit-frontend', 'package.json'), join(root, 'package.json')];
	const pkgPath = candidates.find((c) => existsSync(c) && /drizzle-orm/.test(readFileSync(c, 'utf8')));
	if (!pkgPath) return { drizzleOrm: null, drizzleKit: null, pg: null };
	const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
	const all = { ...pkg.devDependencies, ...pkg.dependencies };
	return { drizzleOrm: all['drizzle-orm'] ?? null, drizzleKit: all['drizzle-kit'] ?? null, pg: all.pg ?? null };
}

export async function buildDocCorpusStudioSnapshotV1(opts: { pool: Pool | null; root?: string; now?: Date }): Promise<DocCorpusStudioSnapshotV1> {
	const root = opts.root ?? findRepoRoot();
	const now = opts.now ?? new Date();
	const repo = readRepoVersions(root);
	const pg = opts.pool ? await readPostgresCorpus(opts.pool) : null;
	const caps = opts.pool ? await readCapabilities(opts.pool) : null;
	const runtimeVersions: RuntimeVersions = { postgres: caps?.settings.server_version ?? null, pgvector: caps?.pgvectorVersion ?? null, ...repo };
	const local = collectLocalCaptures(root, runtimeVersions);
	const coverage = computeCoverage(local.sources, now);
	const pinned = local.sources.filter((s) => s.provenance === 'PINNED_CAPTURE');
	const issues = [...local.issues];
	for (const c of coverage) if (c.status === 'MISSING') issues.push({ code: 'PINNED_SOURCE_MISSING', detail: c.group });
	if (pg && pg.available && pg.empty) issues.push({ code: 'DOC_CORPUS_POSTGRES_EMPTY', detail: 'atlas_external_doc_* has 0 admitted rows' });
	if (!pg?.available) issues.push({ code: 'POSTGRES_UNAVAILABLE', detail: pg?.error ?? 'no pool' });
	const hard = local.issues.length > 0 || coverage.some((c) => c.status === 'MISSING');
	const captured = pinned.map((s) => s.capturedAt).filter((x): x is string => !!x).sort();
	return {
		schema: 'atlas.doc-corpus-studio-snapshot.v1',
		generatedAt: now.toISOString(),
		runtimeVersions,
		localCorpus: {
			sourceCount: new Set(local.sources.map((s) => s.sourceId)).size,
			pageCount: local.sources.length,
			capturedAt: captured.at(-1) ?? null,
			staleSources: coverage.filter((c) => c.status === 'CAPTURED_STALE').map((c) => c.group),
			missingSources: coverage.filter((c) => c.status === 'MISSING').map((c) => c.group)
		},
		postgresCorpus: {
			pageCount: pg?.pageCount ?? null, chunkCount: pg?.chunkCount ?? null, ftsAvailable: pg?.ftsAvailable ?? false,
			vectorColumnAvailable: pg?.vectorColumnAvailable ?? false, indexes: pg?.indexes ?? [],
			status: !pg?.available ? 'UNAVAILABLE' : pg.empty ? 'EMPTY' : 'PRESENT'
		},
		capabilities: {
			aio: { ioMethod: caps?.settings.io_method ?? null, pgAiosAvailable: caps?.pgAiosAvailable ?? false },
			bitmap: caps?.bitmap ?? { plannerCanGenerateBitmap: false, plannerSelectedBitmap: false, aioRelevant: false, ioMethod: null, fixtures: [] },
			hnsw: caps?.hnswIndexPresent ?? false, halfvec: caps?.halfvecAvailable ?? false
		},
		coverage,
		sources: local.sources,
		validation: { status: hard ? 'FAIL' : issues.length ? 'PARTIAL' : 'PASS', issues },
		canonicalAuthority: 'POSTGRES',
		generatedCorpusAuthority: false
	};
}
