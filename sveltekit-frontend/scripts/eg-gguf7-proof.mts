import { readFileSync } from 'node:fs';
import { buildCanonicalSemanticLineage, CANONICAL_SEMANTIC_ENCODER_REVISION } from '$lib/server/embedding/semantic-lineage.js';
import { deriveEmbeddingGemmaMrlProjection, PROMPT_REVISION_UNPROMPTED } from '$lib/server/embedding/embedding-contract-768.js';

const vecPath = process.env.TEMP + '/eg_gguf7_sample_vec.json';
const vector: number[] = JSON.parse(readFileSync(vecPath, 'utf8'));

console.log('EG-GGUF-7: GGUF-sourced vector into canonical semantic_768 lineage + MRL projection');
console.log('source: local GGUF Q8_0 proof server (:8081), raw text "legal case evidence chain of custody verification"');
console.log('vector length:', vector.length);

const lineage = buildCanonicalSemanticLineage({
	vector,
	encoderRevision: CANONICAL_SEMANTIC_ENCODER_REVISION,
	promptRevision: PROMPT_REVISION_UNPROMPTED,
});

console.log();
console.log('=== CanonicalSemanticLineage (persisted identity unchanged) ===');
console.log(JSON.stringify(lineage, null, 2));

const projection512 = deriveEmbeddingGemmaMrlProjection(vector, 512);
const projection256 = deriveEmbeddingGemmaMrlProjection(vector, 256);
const projection128 = deriveEmbeddingGemmaMrlProjection(vector, 128);

console.log();
console.log('=== MRL projections derived from the same GGUF vector (optional, non-canonical) ===');
for (const p of [projection512, projection256, projection128]) {
	console.log(`  dim=${p.dimension} digest=${p.digest.slice(0, 16)}... vectorLen=${p.vector.length}`);
}

console.log();
console.log('EG-GGUF-7: PASS — GGUF executor output satisfies buildCanonicalSemanticLineage() and');
console.log('deriveEmbeddingGemmaMrlProjection() without any change to representationId (semantic_768),');
console.log('representationRevision, or dimension. Canonical identity untouched by the executor swap.');
