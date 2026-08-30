import { postProcessCandidates } from '../../src/lib/server/retrieval/post-process-reranker.ts';

const candidates = [
  { packetKey: 'a', sourceRef: 'src/foo.ts', fusionScore: 0.9, rankBefore: 1, score: 0.9, scoreSource: 'test', blendedScore: 0.9, scorerVersion: 'test-v1', modelScored: false },
  { packetKey: 'b', sourceRef: 'src/bar.ts', fusionScore: 0.8, rankBefore: 2, score: 0.8, scoreSource: 'test', blendedScore: 0.8, scorerVersion: 'test-v1', modelScored: false },
  { packetKey: 'c', sourceRef: 'src/baz.ts', fusionScore: 0.7, rankBefore: 3, score: 0.7, scoreSource: 'test', blendedScore: 0.7, scorerVersion: 'test-v1', modelScored: false },
];

const latent256Map = new Map([
  ['a', [1, 0, 0]],
  ['b', [1, 0, 0]],
  ['c', [0, 1, 0]],
]);

const result = postProcessCandidates(
  candidates,
  { dedupPrefixDepth: 0, latent256SimilarityThreshold: 0.99 },
  new Map(),
  new Map(),
  undefined,
  latent256Map,
);

console.log(JSON.stringify(result.map(r => ({ packetKey: r.packetKey, semanticDedupRemoved: r.adjustments.semanticDedupRemoved })), null, 2));
console.log('final count:', result.length, '(expect 2: a and c, b removed)');

// Backward-compat check: default config (threshold=0) must not remove anything based on latent256
const resultDefault = postProcessCandidates(candidates, { dedupPrefixDepth: 0 }, new Map(), new Map(), undefined, latent256Map);
console.log('default-config count (expect 3, no semantic dedup applied):', resultDefault.length);
