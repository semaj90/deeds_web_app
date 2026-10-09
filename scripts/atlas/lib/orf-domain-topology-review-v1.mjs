/** Pure review crosswalk. NOT an ontology normalizer, registry loader, or promotion mechanism. */
import {createHash} from 'node:crypto';
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const required=(x,n)=>{if(typeof x!=='string'||!x.trim())throw Error('MISSING_'+n);return x;};
export function proposeOrfDomainTopologyReviewV1({observedAstKinds, producerMappings, domainLabels, ontologyGroups, topology}) {
 if(!Array.isArray(observedAstKinds)||!Array.isArray(producerMappings)||!Array.isArray(domainLabels)||!Array.isArray(ontologyGroups)) throw Error('INVALID_INPUT');
 const kinds=[...new Set(observedAstKinds.map(x=>required(x,'AST_KIND')))].sort();
 const mapping=new Map();
 for(const pair of producerMappings){
   const astKind=required(pair.astKind,'AST_KIND'),kind=required(pair.producerKind,'PRODUCER_KIND');
   if(!mapping.has(astKind))mapping.set(astKind,new Set());mapping.get(astKind).add(kind);
 }
 const ast=kinds.map(kind=>({observedKind:kind,candidateFeatureId:'ast.'+kind.toLowerCase(),
  producerKinds:[...(mapping.get(kind)??[])].sort(),reviewState:'UNREVIEWED',eligible:false,
  missingProducerMapping:!(mapping.get(kind)?.size)}));
 const ontology=new Set(ontologyGroups.map(x=>required(x,'ONTOLOGY_GROUP')));
 const domains=[...new Set(domainLabels.map(x=>required(x,'DOMAIN_LABEL')))].sort().map(label=>({
   label,matchingOntologyGroup:ontology.has(label)?label:null,
   state:ontology.has(label)?'EXACT_STRING_CANDIDATE':'UNRESOLVED',admitted:false
 }));
 const topologyState=topology&&topology.coordinateFunctionRevisions&&topology.candidateOrdinalMapChecksum?
 'PROJECTION_REVIEW_ONLY':'UNAVAILABLE';
 const body={schema:'atlas.orf-domain-topology-review.v1',ast,domains,
  topologyState,registryApproved:false,ontologyWrites:false,semanticIndexWrites:false,
  topologyAuthority:false,admission:'NOT_PERFORMED'};
 return {...body,checksum:sha(body)};
}
