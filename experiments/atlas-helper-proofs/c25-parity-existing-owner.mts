/** Read-only comparison against the existing SvelteKit [C,25] runtime projection owner. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { buildCandidateFeatureMatrix } from '../../sveltekit-frontend/src/lib/server/retrieval/retrieval-candidate-feature-matrix-v1.ts';

const currentDir = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(currentDir, 'c25-parity-fixture.json');
const input = JSON.parse(readFileSync(fixturePath, 'utf8'));
if (!Array.isArray(input.candidates) || input.candidates.length > 1000) throw new Error('INVALID_FIXTURE');
const canonical = buildCandidateFeatureMatrix(input.candidates.map((c: Record<string, unknown>) => ({
  packet_key: c.packet_key,
  ...(c.values as object),
})));
const output = {
  candidate_packet_keys: canonical.candidate_packet_keys,
  candidate_features: Array.from(canonical.candidate_features),
  presence_mask: Array.from(canonical.presence_mask),
  candidate_count: canonical.candidate_count,
  feature_count: canonical.feature_count,
};
process.stdout.write(JSON.stringify(output) + '\n');
