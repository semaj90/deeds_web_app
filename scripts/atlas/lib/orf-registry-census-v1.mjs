/** Pure, non-authoritative ORF vocabulary census. No registry promotion. */
import { createHash } from 'node:crypto';
export function censusOrfRegistrySources({ projectionSource, aggregationSource, compilerSource }) {
  const match = projectionSource.match(/export const ORF_AST_OBSERVATION_KINDS\s*=\s*\[([\s\S]*?)\]\s*as const/);
  if (!match) throw Error('AST_VOCABULARY_NOT_FOUND');
  const vocabulary = [...match[1].matchAll(/'([A-Z_]+)'/g)].map(x => x[1]);
  if (!vocabulary.length || new Set(vocabulary).size !== vocabulary.length) throw Error('AST_VOCABULARY_INVALID');
  const mapBlock = aggregationSource.match(/const astKinds\s*=\s*new Map\(\[([\s\S]*?)\]\);/);
  if (!mapBlock) throw Error('AST_MAPPING_NOT_FOUND');
  const pairs = [...mapBlock[1].matchAll(/\['([^']+)',\s*'([^']+)'\]/g)].map(m => ({producerKind:m[1],astKind:m[2]}));
  if (!pairs.length) throw Error('AST_MAPPING_EMPTY');
  const unexpected = pairs.filter(p => !vocabulary.includes(p.astKind));
  if (unexpected.length) throw Error('AST_MAPPING_OUTSIDE_VOCABULARY:' + unexpected.map(x=>x.astKind).join(','));
  if (!compilerSource.includes('buildObservationFeatureRegistry') ||
      !compilerSource.includes('observationFeatureChecksum')) throw Error('REGISTRY_BUILDER_NOT_VERIFIED');
  const candidates = [...new Set(pairs.map(p=>p.astKind))].sort().map(kind => ({
    astKind:kind, suggestedFeatureId:'ast.'+kind.toLowerCase(),
    producerKinds:pairs.filter(p=>p.astKind===kind).map(p=>p.producerKind).sort(),
    reviewState:'UNREVIEWED', provenanceAdmission:false,
  }));
  const body={schema:'atlas.orf-registry-producer-census.v1',approved:false,
    storageWrites:false,registryArtifactPromoted:false,
    vocabularySize:vocabulary.length,mappingCount:pairs.length,candidates};
  return {...body,checksum:createHash('sha256').update(JSON.stringify(body)).digest('hex')};
}
