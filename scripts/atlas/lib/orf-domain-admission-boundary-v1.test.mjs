import test from 'node:test';import assert from 'node:assert/strict';
import {reviewObservationDomainBindingV1 as review} from './orf-domain-admission-boundary-v1.mjs';
const obs={source_ref:'src/a.ts',source_revision:'r1',byte_start:4,byte_end:12,observation_kind:'FUNCTION_DECL',observation_id:'o1',extractor_revision:'ast-v1'};
const x={observation:obs,definitions:[{feature_id:'ast.function_decl',family:'AST_BINARY',value_kind:'BINARY'}],domainLabel:'ui',ontologyGroupIds:['frontend']};
test('crosswalk is deterministic and never approves facts',()=>{const a=review(x);assert.deepEqual(a,review(x));assert.equal(a.domainResolutionState,'UNRESOLVED');assert.equal(a.orfApproved,false);assert.equal(a.relationAdmitted,false)});
test('rejects unknown feature',()=>assert.throws(()=>review({...x,definitions:[]}),/UNMAPPED_AST_OBSERVATION/));
test('rejects invalid bytes',()=>assert.throws(()=>review({...x,observation:{...obs,byte_end:4}}),/INVALID_BYTE_SPAN/));
test('rejects placeholder revision',()=>assert.throws(()=>review({...x,observation:{...obs,source_revision:'workspace:0'}}),/UNQUALIFIED_SOURCE_REVISION/));
test('exact ontology label still not admission',()=>{const a=review({...x,domainLabel:'frontend'});assert.equal(a.domainResolutionState,'EXACT_STRING_CANDIDATE');assert.equal(a.ontologyAdmitted,false)});
