import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

export const LibraryModuleEcosystemSchema = z.enum(['npm', 'pip', 'global', 'openwiki']);
export const LibraryModuleSourceTypeSchema = z.enum([
	'npm_registry',
	'pypi_json',
	'github_release',
	'web_page',
	'local_openwiki'
]);

export const LibraryModuleSourceSchema = z.object({
	ecosystem: LibraryModuleEcosystemSchema,
	module_name: z.string().min(1),
	package_id: z.string().min(1).optional(),
	source_url: z.string().min(1).optional(),
	release_url: z.string().min(1).optional(),
	source_type: LibraryModuleSourceTypeSchema.default('web_page'),
	declared_version: z.string().min(1).optional(),
	homepage_url: z.string().min(1).optional(),
	notes: z.string().min(1).optional()
}).strict();

export const LibraryModuleSourcesFileSchema = z.object({
	version: z.number().int().positive().default(1),
	sources: z.array(LibraryModuleSourceSchema).min(1)
}).strict();

export type LibraryModuleEcosystem = z.infer<typeof LibraryModuleEcosystemSchema>;
export type LibraryModuleSourceType = z.infer<typeof LibraryModuleSourceTypeSchema>;
export type LibraryModuleSource = z.infer<typeof LibraryModuleSourceSchema>;

export type LibraryModuleIndexStatus = 'verified' | 'stale' | 'partial' | 'missing' | 'conflict';

export interface LibraryModuleIndexRow {
	ecosystem: LibraryModuleEcosystem;
	module_name: string;
	package_id: string;
	declared_version?: string | null;
	latest_version?: string | null;
	source_url: string | null;
	source_type: LibraryModuleSourceType | 'missing';
	retrieved_at: string;
	license?: string | null;
	confidence: number;
	status: LibraryModuleIndexStatus;
	notes: string[];
	evidence_hash: string;
}

export interface LibraryModuleCrawlReport {
	schema_version: 'okf.library-module-index.v1';
	generated_at: string;
	repo_root: string;
	source_count: number;
	row_count: number;
	status_counts: Record<LibraryModuleIndexStatus, number>;
	rows: LibraryModuleIndexRow[];
}

const SEMVER_RE = /\bv?(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)(?:[-+][0-9A-Za-z.-]+)?\b/g;

function sha256(text: string): string {
	return createHash('sha256').update(text).digest('hex');
}

function buildEvidenceHash(row: Omit<LibraryModuleIndexRow, 'evidence_hash'>): string {
	return sha256(JSON.stringify({
		ecosystem: row.ecosystem,
		module_name: row.module_name,
		package_id: row.package_id,
		latest_version: row.latest_version ?? null,
		source_url: row.source_url,
		source_type: row.source_type,
		license: row.license ?? null,
		status: row.status,
		notes: row.notes
	}));
}

export function extractVersionCandidate(input: string): string | null {
	const compact = input.replace(/\s+/g, ' ').trim();
	const keywordPatterns = [
		/(?:latest|current|release|version)\s*[:=]?\s*(?:v)?(?<version>\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/i,
		/(?:tag|tag_name)\s*[:=]?\s*(?:v)?(?<version>\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/i
	];

	for (const pattern of keywordPatterns) {
		const match = compact.match(pattern);
		if (match?.groups?.version) return match.groups.version;
	}

	const semverMatches = [...compact.matchAll(SEMVER_RE)].map((match) => match.groups?.major ? `${match.groups.major}.${match.groups.minor}.${match.groups.patch}` : match[0]);
	return semverMatches[0] ?? null;
}

async function fetchJson(url: string, timeoutMs: number, headers: HeadersInit = {}): Promise<any> {
	const response = await fetch(url, {
		headers: {
			'user-agent': 'Parent-Atlas-OKF-Library-Crawler/1.0',
			...headers
		},
		signal: AbortSignal.timeout(timeoutMs)
	});
	if (!response.ok) {
		throw new Error(`http_${response.status}`);
	}
	return response.json();
}

async function fetchText(url: string, timeoutMs: number): Promise<string> {
	const response = await fetch(url, {
		headers: {
			'user-agent': 'Parent-Atlas-OKF-Library-Crawler/1.0'
		},
		signal: AbortSignal.timeout(timeoutMs)
	});
	if (!response.ok) {
		throw new Error(`http_${response.status}`);
	}
	return response.text();
}

function inferGithubApiReleaseUrl(sourceUrl: string): string | null {
	try {
		const parsed = new URL(sourceUrl);
		if (!/github\.com$/i.test(parsed.hostname)) return null;
		const parts = parsed.pathname.split('/').filter(Boolean);
		if (parts.length < 2) return null;
		return `https://api.github.com/repos/${parts[0]}/${parts[1]}/releases/latest`;
	} catch {
		return null;
	}
}

function inferNpmRegistryUrl(packageId: string): string {
	return `https://registry.npmjs.org/${encodeURIComponent(packageId)}/latest`;
}

function inferPypiUrl(packageId: string): string {
	return `https://pypi.org/pypi/${encodeURIComponent(packageId)}/json`;
}

function inferPackageId(source: LibraryModuleSource): string {
	return source.package_id ?? source.module_name;
}

function makeRow(input: Omit<LibraryModuleIndexRow, 'evidence_hash'>): LibraryModuleIndexRow {
	return {
		...input,
		evidence_hash: buildEvidenceHash(input)
	};
}

async function crawlNpmSource(source: LibraryModuleSource, timeoutMs: number): Promise<LibraryModuleIndexRow> {
	const packageId = inferPackageId(source);
	const registryUrl = inferNpmRegistryUrl(packageId);
	try {
		const payload = await fetchJson(registryUrl, timeoutMs);
		const latestVersion = payload?.version ?? payload?.['dist-tags']?.latest ?? null;
		const license = typeof payload?.license === 'string'
			? payload.license
			: Array.isArray(payload?.licenses)
				? payload.licenses.map((item: any) => item?.type ?? item?.license ?? '').filter(Boolean).join(', ') || null
				: null;
		return makeRow({
			ecosystem: 'npm',
			module_name: source.module_name,
			package_id: packageId,
			declared_version: source.declared_version ?? null,
			latest_version: latestVersion,
			source_url: source.source_url ?? `https://www.npmjs.com/package/${packageId}`,
			source_type: 'npm_registry',
			retrieved_at: new Date().toISOString(),
			license,
			confidence: latestVersion ? 0.98 : 0.6,
			status: latestVersion ? (source.declared_version && source.declared_version !== latestVersion ? 'stale' : 'verified') : 'partial',
			notes: [
				source.notes ?? '',
				`registry=${registryUrl}`,
				payload?.homepage ? `homepage=${payload.homepage}` : '',
				payload?.repository?.url ? `repository=${payload.repository.url}` : ''
			].filter(Boolean)
		});
	} catch (error) {
		return makeRow({
			ecosystem: 'npm',
			module_name: source.module_name,
			package_id: packageId,
			declared_version: source.declared_version ?? null,
			latest_version: null,
			source_url: source.source_url ?? `https://www.npmjs.com/package/${packageId}`,
			source_type: 'npm_registry',
			retrieved_at: new Date().toISOString(),
			license: null,
			confidence: 0.2,
			status: 'partial',
			notes: [source.notes ?? '', `registry_error=${error instanceof Error ? error.message : String(error)}`].filter(Boolean)
		});
	}
}

async function crawlPypiSource(source: LibraryModuleSource, timeoutMs: number): Promise<LibraryModuleIndexRow> {
	const packageId = inferPackageId(source);
	const pypiUrl = inferPypiUrl(packageId);
	try {
		const payload = await fetchJson(pypiUrl, timeoutMs);
		const info = payload?.info ?? {};
		const latestVersion = info?.version ?? null;
		const license = info?.license || info?.license_expression || null;
		return makeRow({
			ecosystem: 'pip',
			module_name: source.module_name,
			package_id: packageId,
			declared_version: source.declared_version ?? null,
			latest_version: latestVersion,
			source_url: source.source_url ?? info?.home_page ?? `https://pypi.org/project/${packageId}/`,
			source_type: 'pypi_json',
			retrieved_at: new Date().toISOString(),
			license: license || null,
			confidence: latestVersion ? 0.98 : 0.6,
			status: latestVersion ? (source.declared_version && source.declared_version !== latestVersion ? 'stale' : 'verified') : 'partial',
			notes: [
				source.notes ?? '',
				`pypi=${pypiUrl}`,
				info?.summary ? `summary=${String(info.summary).slice(0, 160)}` : ''
			].filter(Boolean)
		});
	} catch (error) {
		return makeRow({
			ecosystem: 'pip',
			module_name: source.module_name,
			package_id: packageId,
			declared_version: source.declared_version ?? null,
			latest_version: null,
			source_url: source.source_url ?? `https://pypi.org/project/${packageId}/`,
			source_type: 'pypi_json',
			retrieved_at: new Date().toISOString(),
			license: null,
			confidence: 0.2,
			status: 'partial',
			notes: [source.notes ?? '', `pypi_error=${error instanceof Error ? error.message : String(error)}`].filter(Boolean)
		});
	}
}

async function crawlGithubReleaseSource(source: LibraryModuleSource, timeoutMs: number): Promise<LibraryModuleIndexRow> {
	const packageId = inferPackageId(source);
	const releaseUrl = source.release_url ?? (source.source_url ? inferGithubApiReleaseUrl(source.source_url) : null);
	if (!releaseUrl) {
		return makeRow({
			ecosystem: 'global',
			module_name: source.module_name,
			package_id: packageId,
			declared_version: source.declared_version ?? null,
			latest_version: null,
			source_url: source.source_url ?? null,
			source_type: 'github_release',
			retrieved_at: new Date().toISOString(),
			license: null,
			confidence: 0.2,
			status: 'partial',
			notes: [source.notes ?? '', 'missing_release_url'].filter(Boolean)
		});
	}

	try {
		const payload = await fetchJson(releaseUrl, timeoutMs, { accept: 'application/vnd.github+json' });
		const latestVersion = typeof payload?.tag_name === 'string'
			? payload.tag_name.replace(/^v/i, '')
			: extractVersionCandidate(JSON.stringify(payload)) ?? null;
		const sourceUrl = source.source_url ?? payload?.html_url ?? null;
		return makeRow({
			ecosystem: source.ecosystem,
			module_name: source.module_name,
			package_id: packageId,
			declared_version: source.declared_version ?? null,
			latest_version: latestVersion,
			source_url: sourceUrl,
			source_type: 'github_release',
			retrieved_at: new Date().toISOString(),
			license: payload?.license?.spdx_id ?? payload?.license?.name ?? null,
			confidence: latestVersion ? 0.95 : 0.55,
			status: latestVersion ? (source.declared_version && source.declared_version !== latestVersion ? 'stale' : 'verified') : 'partial',
			notes: [source.notes ?? '', `release=${releaseUrl}`, payload?.name ? `release_name=${payload.name}` : ''].filter(Boolean)
		});
	} catch (error) {
		return makeRow({
			ecosystem: source.ecosystem,
			module_name: source.module_name,
			package_id: packageId,
			declared_version: source.declared_version ?? null,
			latest_version: null,
			source_url: source.source_url ?? null,
			source_type: 'github_release',
			retrieved_at: new Date().toISOString(),
			license: null,
			confidence: 0.2,
			status: 'partial',
			notes: [source.notes ?? '', `github_error=${error instanceof Error ? error.message : String(error)}`].filter(Boolean)
		});
	}
}

async function crawlGenericPageSource(source: LibraryModuleSource, timeoutMs: number): Promise<LibraryModuleIndexRow> {
	const packageId = inferPackageId(source);
	if (!source.source_url) {
		return makeRow({
			ecosystem: source.ecosystem,
			module_name: source.module_name,
			package_id: packageId,
			declared_version: source.declared_version ?? null,
			latest_version: null,
			source_url: null,
			source_type: source.source_type,
			retrieved_at: new Date().toISOString(),
			license: null,
			confidence: 0.1,
			status: 'missing',
			notes: [source.notes ?? '', 'missing_source_url'].filter(Boolean)
		});
	}

	try {
		const html = await fetchText(source.source_url, timeoutMs);
		const title = html.match(/<title[^>]*>(.*?)<\/title>/is)?.[1]?.trim() ?? '';
		const metaVersion = html.match(/<meta[^>]+(?:name|property)=["'](?:version|og:version|softwareVersion)["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? null;
		const ldJsonMatches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
		const ldVersion = ldJsonMatches
			.map((match) => {
				try {
					const parsed = JSON.parse(match[1]);
					const candidates = Array.isArray(parsed) ? parsed : [parsed];
					for (const candidate of candidates) {
						const version = candidate?.version ?? candidate?.softwareVersion ?? candidate?.software_version;
						if (typeof version === 'string' && version.trim()) return version.trim();
					}
				} catch {
					return null;
				}
				return null;
			})
			.find(Boolean) ?? null;
		const version = metaVersion ?? ldVersion ?? extractVersionCandidate(`${title}\n${html.slice(0, 12000)}`);
		return makeRow({
			ecosystem: source.ecosystem,
			module_name: source.module_name,
			package_id: packageId,
			declared_version: source.declared_version ?? null,
			latest_version: version,
			source_url: source.source_url,
			source_type: source.source_type,
			retrieved_at: new Date().toISOString(),
			license: null,
			confidence: version ? 0.7 : 0.3,
			status: version ? (source.declared_version && source.declared_version !== version ? 'stale' : 'verified') : 'partial',
			notes: [source.notes ?? '', title ? `title=${title}` : '', metaVersion ? `meta_version=${metaVersion}` : '', ldVersion ? `ldjson_version=${ldVersion}` : ''].filter(Boolean)
		});
	} catch (error) {
		return makeRow({
			ecosystem: source.ecosystem,
			module_name: source.module_name,
			package_id: packageId,
			declared_version: source.declared_version ?? null,
			latest_version: null,
			source_url: source.source_url ?? null,
			source_type: source.source_type,
			retrieved_at: new Date().toISOString(),
			license: null,
			confidence: 0.2,
			status: 'partial',
			notes: [source.notes ?? '', `page_error=${error instanceof Error ? error.message : String(error)}`].filter(Boolean)
		});
	}
}

async function crawlLocalOpenWikiSource(repoRoot: string, source: LibraryModuleSource): Promise<LibraryModuleIndexRow> {
	const packageId = inferPackageId(source);
	const openwikiRoot = source.source_url?.startsWith('file://')
		? path.resolve(repoRoot, source.source_url.slice('file://'.length))
		: path.resolve(repoRoot, 'docs', 'openwiki');

	if (!existsSync(openwikiRoot)) {
		return makeRow({
			ecosystem: 'openwiki',
			module_name: source.module_name,
			package_id: packageId,
			declared_version: source.declared_version ?? null,
			latest_version: null,
			source_url: source.source_url ?? `file://${openwikiRoot}`,
			source_type: 'local_openwiki',
			retrieved_at: new Date().toISOString(),
			license: null,
			confidence: 0.1,
			status: 'missing',
			notes: [source.notes ?? '', 'openwiki_root_missing'].filter(Boolean)
		});
	}

	const entries = await readdir(openwikiRoot, { recursive: true });
	const markdownFiles = entries.filter((entry) => typeof entry === 'string' && /\.(md|mdx|yaml|yml|json)$/i.test(entry));
	if (markdownFiles.length === 0) {
		return makeRow({
			ecosystem: 'openwiki',
			module_name: source.module_name,
			package_id: packageId,
			declared_version: source.declared_version ?? null,
			latest_version: null,
			source_url: source.source_url ?? `file://${openwikiRoot}`,
			source_type: 'local_openwiki',
			retrieved_at: new Date().toISOString(),
			license: null,
			confidence: 0.1,
			status: 'missing',
			notes: [source.notes ?? '', 'openwiki_root_empty'].filter(Boolean)
		});
	}

	const candidateFile = markdownFiles.sort().at(-1)!;
	const candidatePath = path.join(openwikiRoot, candidateFile);
	const text = await readFile(candidatePath, 'utf8').catch(() => '');
	const version = extractVersionCandidate(text);
	return makeRow({
		ecosystem: 'openwiki',
		module_name: source.module_name,
		package_id: packageId,
		declared_version: source.declared_version ?? null,
		latest_version: version,
		source_url: source.source_url ?? `file://${candidatePath}`,
		source_type: 'local_openwiki',
		retrieved_at: new Date().toISOString(),
		license: null,
		confidence: version ? 0.5 : 0.2,
		status: version ? 'partial' : 'missing',
		notes: [source.notes ?? '', `candidate_file=${candidateFile}`].filter(Boolean)
	});
}

export async function crawlLibraryModuleSource(
	repoRoot: string,
	source: LibraryModuleSource,
	options: { timeoutMs?: number } = {}
): Promise<LibraryModuleIndexRow> {
	const timeoutMs = options.timeoutMs ?? 20_000;
	const normalized = LibraryModuleSourceSchema.parse(source);
	switch (normalized.source_type) {
		case 'npm_registry':
			return crawlNpmSource(normalized, timeoutMs);
		case 'pypi_json':
			return crawlPypiSource(normalized, timeoutMs);
		case 'github_release':
			return crawlGithubReleaseSource(normalized, timeoutMs);
		case 'local_openwiki':
			return crawlLocalOpenWikiSource(repoRoot, normalized);
		case 'web_page':
		default:
			return crawlGenericPageSource(normalized, timeoutMs);
	}
}

export async function crawlLibraryModuleSources(
	repoRoot: string,
	sources: LibraryModuleSource[],
	options: { timeoutMs?: number } = {}
): Promise<LibraryModuleCrawlReport> {
	const rows: LibraryModuleIndexRow[] = [];
	for (const source of sources) {
		rows.push(await crawlLibraryModuleSource(repoRoot, source, options));
	}

	const statusCounts: Record<LibraryModuleIndexStatus, number> = {
		verified: 0,
		stale: 0,
		partial: 0,
		missing: 0,
		conflict: 0
	};
	for (const row of rows) {
		statusCounts[row.status] += 1;
	}

	return {
		schema_version: 'okf.library-module-index.v1',
		generated_at: new Date().toISOString(),
		repo_root: repoRoot,
		source_count: sources.length,
		row_count: rows.length,
		status_counts: statusCounts,
		rows
	};
}

export function renderLibraryModuleIndexMarkdown(report: LibraryModuleCrawlReport): string {
	const lines = [
		'# OKF Library Module Index',
		'',
		`- generated_at: ${report.generated_at}`,
		`- source_count: ${report.source_count}`,
		`- row_count: ${report.row_count}`,
		`- verified: ${report.status_counts.verified}`,
		`- stale: ${report.status_counts.stale}`,
		`- partial: ${report.status_counts.partial}`,
		`- missing: ${report.status_counts.missing}`,
		`- conflict: ${report.status_counts.conflict}`,
		'',
		'| ecosystem | module | package_id | latest_version | status | source_type | source_url | confidence |',
		'|---|---|---|---|---|---|---|---:|'
	];

	for (const row of report.rows) {
		lines.push([
			row.ecosystem,
			row.module_name,
			row.package_id,
			row.latest_version ?? '',
			row.status,
			row.source_type,
			row.source_url ?? '',
			row.confidence.toFixed(2)
		].join(' | '));
	}

	lines.push('');
	lines.push('## Missing or partial rows', '');
	for (const row of report.rows.filter((entry) => entry.status !== 'verified')) {
		lines.push(`- ${row.ecosystem}:${row.module_name} — ${row.status}; ${row.notes.join('; ') || 'no notes'}`);
	}
	if (report.rows.every((entry) => entry.status === 'verified')) {
		lines.push('- none');
	}

	return lines.join('\n');
}

export function renderLibraryModuleIndexJsonl(report: LibraryModuleCrawlReport): string {
	return report.rows.map((row) => JSON.stringify(row)).join('\n') + '\n';
}

export function defaultLibraryModuleSourceFile(repoRoot: string): string {
	return path.resolve(repoRoot, 'docs', 'okf', 'library-module-sources.json');
}
