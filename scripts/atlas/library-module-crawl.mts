#!/usr/bin/env node
import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
	crawlLibraryModuleSources,
	defaultLibraryModuleSourceFile,
	renderLibraryModuleIndexJsonl,
	renderLibraryModuleIndexMarkdown,
	LibraryModuleSourcesFileSchema,
	type LibraryModuleSource
} from '../../sveltekit-frontend/src/lib/server/atlas/library-module-crawl.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const OUT_DIR = path.resolve(REPO_ROOT, 'docs', '.okf', 'library-module-index');
const REPORTS_DIR = path.resolve(REPO_ROOT, 'docs', 'reports');

const CliSchema = z.object({
	'dry-run': z.boolean().default(false),
	'sources-file': z.string().optional(),
	'output-dir': z.string().optional(),
	'timeout-ms': z.coerce.number().int().positive().optional()
}).passthrough();

function parseCli(argv: string[]) {
	const parsed: Record<string, unknown> = { 'dry-run': false };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--dry-run') parsed['dry-run'] = true;
		else if (arg.startsWith('--sources-file=')) parsed['sources-file'] = arg.split('=', 2)[1];
		else if (arg === '--sources-file') parsed['sources-file'] = argv[++i];
		else if (arg.startsWith('--output-dir=')) parsed['output-dir'] = arg.split('=', 2)[1];
		else if (arg === '--output-dir') parsed['output-dir'] = argv[++i];
		else if (arg.startsWith('--timeout-ms=')) parsed['timeout-ms'] = arg.split('=', 2)[1];
		else if (arg === '--timeout-ms') parsed['timeout-ms'] = argv[++i];
	}
	return CliSchema.parse(parsed);
}

async function loadSources(repoRoot: string, sourcesFile?: string): Promise<LibraryModuleSource[]> {
	const filePath = sourcesFile
		? path.resolve(repoRoot, sourcesFile)
		: defaultLibraryModuleSourceFile(repoRoot);
	const raw = JSON.parse(await readFile(filePath, 'utf8'));
	const parsed = LibraryModuleSourcesFileSchema.parse(raw);
	return parsed.sources;
}

async function main() {
	const cli = parseCli(process.argv.slice(2));
	const outputDir = path.resolve(cli['output-dir'] ? path.resolve(REPO_ROOT, cli['output-dir'] as string) : OUT_DIR);
	const sources = await loadSources(REPO_ROOT, cli['sources-file'] as string | undefined);

	if (cli['dry-run']) {
		console.log(JSON.stringify({
			repo_root: REPO_ROOT,
			source_count: sources.length,
			output_dir: outputDir,
			sources: sources.map((source) => ({
				ecosystem: source.ecosystem,
				module_name: source.module_name,
				source_type: source.source_type,
				source_url: source.source_url ?? null
			}))
		}, null, 2));
		return;
	}

	const report = await crawlLibraryModuleSources(REPO_ROOT, sources, {
		timeoutMs: cli['timeout-ms'] as number | undefined
	});

	await mkdir(outputDir, { recursive: true });
	await mkdir(REPORTS_DIR, { recursive: true });

	const jsonlPath = path.join(outputDir, 'index.jsonl');
	const mdPath = path.join(outputDir, 'index.md');
	const summaryPath = path.join(outputDir, 'summary.json');
	const reportStem = `library-module-crawl-${new Date().toISOString().slice(0, 10)}`;
	const reportJsonPath = path.join(REPORTS_DIR, `${reportStem}.json`);
	const reportMdPath = path.join(REPORTS_DIR, `${reportStem}.md`);

	await writeFile(jsonlPath, renderLibraryModuleIndexJsonl(report), 'utf8');
	await writeFile(mdPath, renderLibraryModuleIndexMarkdown(report), 'utf8');
	await writeFile(summaryPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
	await writeFile(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
	await writeFile(reportMdPath, `${renderLibraryModuleIndexMarkdown(report)}\n`, 'utf8');

	console.log(JSON.stringify({
		output_dir: outputDir,
		report_json: path.relative(REPO_ROOT, reportJsonPath),
		report_md: path.relative(REPO_ROOT, reportMdPath),
		rows: report.row_count,
		status_counts: report.status_counts
	}, null, 2));
}

main().catch((error) => {
	console.error(error instanceof Error ? error.stack ?? error.message : String(error));
	process.exitCode = 1;
});

