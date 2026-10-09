#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveOkfDevPublishedCorpusV1 } from '../docs-atlas/lib/okf-dev-publication-v1.mjs';
import { alignOkfPublishedPagesToAdmissionEnvelopesV1 } from './lib/okf-dev-admission-publication-alignment-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const value = (flag: string) => args.find((arg) => arg.startsWith(`${flag}=`))?.slice(flag.length + 1);
const docsRoot = path.resolve(root, value('--docs-root') ?? 'docs/.okf/dev');
const envelopesPath = value('--envelopes') ? path.resolve(root, value('--envelopes')!) : null;
const reportPath = path.resolve(root, value('--report') ?? '.tmp/atlas/okf-dev-admission-publication-alignment-v1.json');
const report: Record<string, unknown> = {
	schema: 'atlas.okf-dev-admission-publication-alignment-report.v1',
	result: 'OKF_ADMISSION_ALIGNMENT_BLOCKED',
	canonicalAuthority: false,
	writesPerformed: false,
	persistentStoreWritesPerformed: false,
	blockers: []
};

try {
	const published = resolveOkfDevPublishedCorpusV1(docsRoot);
	if (!published) throw new Error('PUBLISHED_GENERATION_MISSING');
	if (!envelopesPath || !fs.existsSync(envelopesPath)) throw new Error('REVIEWED_ADMISSION_ENVELOPES_REQUIRED');
	const entries = fs.readFileSync(published.corpusPath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
	const envelopes = JSON.parse(fs.readFileSync(envelopesPath, 'utf8'));
	const alignment = alignOkfPublishedPagesToAdmissionEnvelopesV1(entries, envelopes);
	const { validateExternalDocAdmissionHandoff } = await import('../../sveltekit-frontend/src/lib/server/atlas/docs/external-doc-intelligence-contracts-v1.js');
	const admission = validateExternalDocAdmissionHandoff(envelopes);
	const ready = alignment.result === 'OKF_ADMISSION_ALIGNMENT_MATCHED' && admission.result === 'EXTERNAL_DOC_ADMISSION_HANDOFF_READY';
	Object.assign(report, {
		result: ready ? 'OKF_ADMISSION_ALIGNMENT_MATCHED' : 'OKF_ADMISSION_ALIGNMENT_BLOCKED',
		publicationRunId: published.pointer.run_id,
		generationManifestChecksum: published.pointer.generation_manifest_checksum,
		publishedEntryCount: entries.length,
		alignment,
		admission,
		note: 'This validates exact alignment and the existing DB-free handoff contract only. It does not call the canonical writer or establish persisted admission.'
	});
} catch (error) {
	(report.blockers as unknown[]).push({ code: error instanceof Error ? error.message : 'UNCLASSIFIED_ERROR' });
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'w' });
console.log(`${report.result} report=${path.relative(root, reportPath).replaceAll('\\', '/')}`);
if (report.result !== 'OKF_ADMISSION_ALIGNMENT_MATCHED') process.exitCode = 1;
