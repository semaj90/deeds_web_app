import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function redact(value) {
	if (typeof value === 'string') {
		return value
			.replace(/(\:\/\/)[^/@\s]+@/g, '$1***@')
			.replace(/([?&](?:password|token|api[_-]?key)=)[^&\s]+/gi, '$1***');
	}
	if (Array.isArray(value)) return value.map(redact);
	if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, redact(entry)]));
	return value;
}

export function writeLaneReportV1(lane, report) {
	const configuredOutput = process.env.ATLAS_VERIFY_OUTPUT_FILE;
	const outputFile = configuredOutput
		? path.resolve(configuredOutput)
		: path.join(ROOT, '.tmp', `verify-${lane}-${randomUUID()}.json`);
	const tmpRoot = `${path.resolve(ROOT, '.tmp')}${path.sep}`;
	if (!outputFile.startsWith(tmpRoot)) throw new Error('VERIFY_OUTPUT_OUTSIDE_TMP');
	fs.mkdirSync(path.dirname(outputFile), { recursive: true });
	fs.writeFileSync(outputFile, JSON.stringify(redact(report), null, 2), { flag: 'wx' });
	return outputFile;
}
