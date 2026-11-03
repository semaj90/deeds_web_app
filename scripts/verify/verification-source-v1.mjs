import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const VERIFICATION_SOURCE_FILES_V1 = Object.freeze([
	'scripts/verify/smoke-validation.mjs',
	'scripts/verify/feature-memory-story.mjs',
	'scripts/verify/parent-atlas-traversal.mjs',
	'scripts/verify/cubic-adversarial-tests.mjs',
	'scripts/verify/strict-verdict.mjs',
	'scripts/verify/verification-admission-v1.mjs',
	'scripts/verify/lane-report-v1.mjs',
	'scripts/verify/run-verification.mjs',
	'scripts/verify/verification-source-v1.mjs',
	'scripts/verify/verification-gate.ts',
	'sveltekit-frontend/src/routes/api/ai/chat/server.route.spec.ts',
	'sveltekit-frontend/src/routes/api/embed/server.route.spec.ts',
	'sveltekit-frontend/src/lib/server/atlas/graph/graph-expansion-adapter.spec.ts',
	'sveltekit-frontend/src/lib/server/atlas/graph/graph-expansion-adapter.unavailable.integration.spec.ts',
	'sveltekit-frontend/package.json',
].sort());

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function computeVerificationSourceRevisionV1() {
	const hash = createHash('sha256');
	for (const relative of VERIFICATION_SOURCE_FILES_V1) {
		const bytes = fs.readFileSync(path.join(ROOT, relative));
		hash.update(relative.replaceAll(path.sep, '/')).update('\0').update(bytes).update('\0');
	}
	return `sha256:${hash.digest('hex')}`;
}
