/** Emits binary32 LE / presence-mask hex from the original SvelteKit owner. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { buildCandidateFeatureMatrix } from '../../sveltekit-frontend/src/lib/server/retrieval/retrieval-candidate-feature-matrix-v1.ts';
const root = dirname(fileURLToPath(import.meta.url));
const source = process.argv[2] ?? resolve(root, 'c25-parity-fixture.json');
const fixture = JSON.parse(readFileSync(source, 'utf8'));
if (!Array.isArray(fixture.candidates) || fixture.candidates.length === 0 || fixture.candidates.length > 1000) throw new Error('INVALID_C25_FIXTURE');
const matrix = buildCandidateFeatureMatrix(fixture.candidates.map((item: {packet_key: string; values: Record<string, number | null>}) => ({
  packet_key: item.packet_key, ...item.values
})));
const bytes = Buffer.alloc(matrix.candidate_features.length * 4);
matrix.candidate_features.forEach((v, i) => bytes.writeFloatLE(v, i * 4));
process.stdout.write(JSON.stringify({
  packet_keys: matrix.candidate_packet_keys,
  features_le_f32_hex: bytes.toString('hex'),
  presence_mask_hex: Buffer.from(matrix.presence_mask).toString('hex'),
  candidate_count: matrix.candidate_count,
  feature_count: matrix.feature_count,
})+'\n');
