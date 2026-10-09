/** Read-only identity gates for Atlas retrieval and centroid routing.
 * Separate domain taxonomy, ORF registry, embedding recipe and cache snapshot.
 * No database/cache/model access; caller supplies independently verified descriptors.
 */
import { createHash } from 'node:crypto';
const required = (value,name) => {
  if (typeof value !== 'string' || !value.trim() || /^(unknown|pending|workspace:0)$/i.test(value.trim()))
    throw new Error('ATLAS_IDENTITY_MISSING:' + name);
  return value.trim();
};
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const hex64 = (s,name) => {
  if (typeof s !== 'string' || !/^[a-f0-9]{64}$/i.test(s)) throw new Error('ATLAS_INVALID_DIGEST:' + name);
  return s.toLowerCase();
};
export function embeddingSpaceIdentityV1(input) {
  if (!input || typeof input !== 'object') throw new Error('ATLAS_EMBEDDING_DESCRIPTOR_MISSING');
  const recipe = {
    modelArtifactSha256:hex64(input.modelArtifactSha256,'modelArtifactSha256'),
    tokenizerSha256:hex64(input.tokenizerSha256,'tokenizerSha256'),
    modelFamily:required(input.modelFamily,'modelFamily'),
    promptRecipeRevision:required(input.promptRecipeRevision,'promptRecipeRevision'),
    pooling:required(input.pooling,'pooling'),
    normalization:required(input.normalization,'normalization'),
    dimension:input.dimension,
    metric:required(input.metric,'metric')
  };
  if (!Number.isSafeInteger(recipe.dimension) || recipe.dimension<=0) throw Error('ATLAS_INVALID_VECTOR_DIMENSION');
  if (!['cosine','dot','l2'].includes(recipe.metric)) throw Error('ATLAS_UNSUPPORTED_METRIC');
  return {schema:'atlas.embedding-space-identity.v1',recipe,embeddingSpaceId:'sha256:'+digest(recipe)};
}
export function assertSameEmbeddingSpaceV1(a,b) {
  const x=embeddingSpaceIdentityV1(a),y=embeddingSpaceIdentityV1(b);
  if(x.embeddingSpaceId!==y.embeddingSpaceId) throw Error('ATLAS_EMBEDDING_SPACE_MISMATCH');
  return x.embeddingSpaceId;
}
export function centroidCacheDescriptorV1(input) {
  const embedding = embeddingSpaceIdentityV1(input.embedding);
  const taxonomyRevision=required(input.taxonomyRevision,'taxonomyRevision');
  const clusterSnapshotRevision=required(input.clusterSnapshotRevision,'clusterSnapshotRevision');
  const clusterId=required(String(input.clusterId ?? ''),'clusterId');
  if(!/^[a-zA-Z0-9_-]+$/.test(clusterId)) throw Error('ATLAS_INVALID_CLUSTER_ID');
  const manifestChecksum=hex64(input.clusterManifestChecksum,'clusterManifestChecksum');
  const namespace = 'atlas:centroid:v1:'+embedding.embeddingSpaceId.slice(7)+':'+
    digest([taxonomyRevision,clusterSnapshotRevision,manifestChecksum]).slice(0,24);
  return {schema:'atlas.centroid-cache-descriptor.v1',
    cacheKey:namespace+':'+clusterId,
    embeddingSpaceId:embedding.embeddingSpaceId,taxonomyRevision,
    clusterSnapshotRevision,clusterManifestChecksum:manifestChecksum,
    clusterId,authority:'ROUTING_HINT_ONLY'};
}
export function assertRetrievalBindingV1(input) {
  const embeddingSpaceId=assertSameEmbeddingSpaceV1(input.queryEmbedding,input.indexEmbedding);
  const domainTaxonomyRevision=required(input.domainTaxonomyRevision,'domainTaxonomyRevision');
  const orfRegistryRevision=required(input.orfRegistryRevision,'orfRegistryRevision');
  const orfRegistryChecksum=hex64(input.orfRegistryChecksum,'orfRegistryChecksum');
  const packetKey=required(input.packetKey,'packetKey');
  const sourceRevision=required(input.sourceRevision,'sourceRevision');
  const evidenceRef=required(input.evidenceRef,'evidenceRef');
  if(input.admitted !== true) throw Error('ATLAS_EVIDENCE_NOT_ADMITTED');
  return {schema:'atlas.retrieval-binding-check.v1',eligible:true,
    embeddingSpaceId,domainTaxonomyRevision,orfRegistryRevision,orfRegistryChecksum,
    packetKey,sourceRevision,evidenceRef,canonicalAuthority:false};
}
