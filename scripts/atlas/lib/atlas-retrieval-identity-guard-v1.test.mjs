import test from 'node:test';
import assert from 'node:assert/strict';
import {embeddingSpaceIdentityV1,assertSameEmbeddingSpaceV1,centroidCacheDescriptorV1,assertRetrievalBindingV1} from './atlas-retrieval-identity-guard-v1.mjs';
const h=c=>c.repeat(64);
const embedding={modelArtifactSha256:h('a'),tokenizerSha256:h('b'),modelFamily:'EmbeddingGemma',
 promptRecipeRevision:'prompt-v1',pooling:'mean',normalization:'l2',dimension:768,metric:'cosine'};
test('same 768 dimensions do not imply same embedding space',()=>{
 assert.throws(()=>assertSameEmbeddingSpaceV1(embedding,{...embedding,pooling:'last-token'}),/SPACE_MISMATCH/);
});
test('embedding space is deterministic',()=>{
 assert.deepEqual(embeddingSpaceIdentityV1(embedding),embeddingSpaceIdentityV1({...embedding}));
});
test('centroid keys change across cluster/taxonomy/embedding revisions',()=>{
 const base={embedding,taxonomyRevision:'domain-v1',clusterSnapshotRevision:'cluster-v1',clusterManifestChecksum:h('c'),clusterId:7};
 const a=centroidCacheDescriptorV1(base);
 assert.equal(a.authority,'ROUTING_HINT_ONLY');
 assert.notEqual(a.cacheKey,centroidCacheDescriptorV1({...base,taxonomyRevision:'domain-v2'}).cacheKey);
 assert.notEqual(a.cacheKey,centroidCacheDescriptorV1({...base,embedding:{...embedding,pooling:'last-token'}}).cacheKey);
});
test('query binding rejects pending and unadmitted evidence',()=>{
 const base={queryEmbedding:embedding,indexEmbedding:embedding,domainTaxonomyRevision:'domain-v1',
 orfRegistryRevision:'orf-v1',orfRegistryChecksum:h('d'),packetKey:'packet-1',
 sourceRevision:'src-r1',evidenceRef:'span:1',admitted:true};
 assert.equal(assertRetrievalBindingV1(base).eligible,true);
 assert.throws(()=>assertRetrievalBindingV1({...base,sourceRevision:'workspace:0'}),/IDENTITY_MISSING/);
 assert.throws(()=>assertRetrievalBindingV1({...base,admitted:false}),/NOT_ADMITTED/);
});
