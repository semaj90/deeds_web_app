import test from 'node:test';
import assert from 'node:assert/strict';
import {censusOrfRegistrySources} from './orf-registry-census-v1.mjs';
const inputs={
 projectionSource:"export const ORF_AST_OBSERVATION_KINDS = ['FUNCTION_DECL','TYPE_ALIAS'] as const;",
 aggregationSource:"const astKinds = new Map([['function', 'FUNCTION_DECL'], ['enum', 'TYPE_ALIAS']]);",
 compilerSource:"function buildObservationFeatureRegistry() {} function observationFeatureChecksum() {}",
};
test('deterministic, unapproved candidate registry census',()=>{
 const a=censusOrfRegistrySources(inputs),b=censusOrfRegistrySources(inputs);
 assert.deepEqual(a,b);assert.equal(a.approved,false);assert.equal(a.registryArtifactPromoted,false);
 assert.equal(a.candidates.length,2);
});
test('unknown AST kind fails closed',()=>{
 const x={...inputs,aggregationSource:"const astKinds = new Map([['x','UNKNOWN_KIND']]);"};
 assert.throws(()=>censusOrfRegistrySources(x),/OUTSIDE_VOCABULARY/);
});
test('missing registry builder fails closed',()=>{
 assert.throws(()=>censusOrfRegistrySources({...inputs,compilerSource:''}),/BUILDER_NOT_VERIFIED/);
});
