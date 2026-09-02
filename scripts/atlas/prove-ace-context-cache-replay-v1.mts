import { buildContextManifestV2 } from '../../sveltekit-frontend/src/lib/server/atlas/graph/context-manifest-v2.js';
import { getValkeyClient } from '../../sveltekit-frontend/src/lib/server/cache/valkey-client.js';
import {
  buildRevisionedAceContextCacheKeyV1,
  getRevisionedAceContextPackV1,
  setRevisionedAceContextPackV1,
  type AceContextPack,
} from '../../sveltekit-frontend/src/lib/server/cache/ace-context-pack-cache.js';

const nonce = Date.now().toString(36);
const v1 = {
  schema: 'atlas.context-manifest.v1' as const,
  requestId: 'ace-replay-request:' + nonce,
  snapshotId: 'ace-replay-snapshot:' + nonce,
  graphRevision: 'graph:replay:' + nonce,
  query: 'revision-bound ACE replay',
  candidateBucket: 32 as const,
  candidateCount: 1,
  tokenBudget: 128,
  selectedNodeKeys: ['node:replay:1'],
  evidenceRefs: ['evidence:replay:1'],
  producerRevision: 'producer:replay:' + nonce,
};
const identityInput = {
  selectedOrdinalSetChecksum: 'sha256:selected',
  evidenceRevisions: {
    sourceRevision: 'sha256:source',
    representationRevision: 'semantic:replay:' + nonce,
    featureRevision: 'feature:replay:' + nonce,
    ontologyRevision: null,
    modelRevision: 'model:replay:' + nonce,
    promptTemplateRevision: 'prompt:replay:' + nonce,
  },
  ordinalMapChecksum: 'sha256:ordinal',
  retrievalPolicyRevision: 'retrieval:replay:v1',
  acePlaybookRevision: 'ace:replay:v1',
};
const manifest = buildContextManifestV2(v1, identityInput);
const staleManifest = buildContextManifestV2(v1, {
  ...identityInput,
  selectedOrdinalSetChecksum: 'sha256:selected:changed',
});
const pack: AceContextPack = {
  id: 'pack:' + nonce,
  contextId: manifest.v1.requestId,
  createdAt: new Date(0).toISOString(),
  summary: 'disposable ACE cache replay',
  sourceRefs: ['src/replay.ts'],
  chunkIds: ['chunk:replay:1'],
};
const client = getValkeyClient();
const key = buildRevisionedAceContextCacheKeyV1(manifest);

try {
  const before = await getRevisionedAceContextPackV1(manifest, { recordMetrics: false });
  await setRevisionedAceContextPackV1(manifest, pack, 120);
  const hit = await getRevisionedAceContextPackV1(manifest, { recordMetrics: false });
  const stale = await getRevisionedAceContextPackV1(staleManifest, { recordMetrics: false });
  if (before !== null || hit?.id !== pack.id || stale !== null) {
    throw new Error('ACE context cache replay admission failed');
  }
  console.log(JSON.stringify({
    status: 'ACE_CONTEXT_CACHE_REPLAY_PROVEN',
    missBeforeWrite: before === null,
    hitAfterWrite: hit !== null,
    staleChecksumMiss: stale === null,
    cacheWritePerformed: true,
    canonicalWritesPerformed: false,
    canonicalAuthority: false,
  }));
} finally {
  await client.del(key).catch(() => undefined);
  await client.quit().catch(() => undefined);
}
