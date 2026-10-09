import test from 'node:test';
import assert from 'node:assert/strict';
import {proposeOrfDomainTopologyReviewV1 as review} from './orf-domain-topology-review-v1.mjs';
const source={observedAstKinds:['FUNCTION_DECL','TYPE_ALIAS'],producerMappings:[{astKind:'FUNCTION_DECL',producerKind:'method'}],
 domainLabels:['ml','ui'],ontologyGroups:['frontend','machine-learning']};
test('review is deterministic, not admitted',()=>{
 const a=review(source);assert.deepEqual(a,review(source));assert.equal(a.registryApproved,false);
 assert.equal(a.topologyState,'UNAVAILABLE');assert.equal(a.admission,'NOT_PERFORMED');
});
test('no silent aliasing of ui and ml',()=>{
 const a=review(source);assert(a.domains.every(d=>d.state==='UNRESOLVED'));
});
test('missing AST producer mapping cannot become eligible',()=>{
 const a=review(source);assert.equal(a.ast.find(x=>x.observedKind==='TYPE_ALIAS').missingProducerMapping,true);
 assert(a.ast.every(x=>x.eligible===false));
});
test('topology coordinate availability grants no identity authority',()=>{
 const a=review({...source,topology:{coordinateFunctionRevisions:{},candidateOrdinalMapChecksum:'fixture'}});
 assert.equal(a.topologyState,'PROJECTION_REVIEW_ONLY');assert.equal(a.topologyAuthority,false);
});
