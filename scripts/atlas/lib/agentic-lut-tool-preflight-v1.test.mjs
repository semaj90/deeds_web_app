import {test} from 'node:test';import assert from 'node:assert/strict';
import {proposeReadOnlyToolLookupV1 as run} from './agentic-lut-tool-preflight-v1.mjs';
const d='sha256:'+'a'.repeat(64);
const fixture=()=>({query:'diagnose graph dependencies',workspaceRevision:d,evidenceChecksum:d,registryRevision:'registry:v1',profiles:[
 {serverAuthorityId:'trace',toolName:'find_dependencies',toolSchemaDigest:d,capabilities:['graph','dependencies'],readOnly:true,registryAllowed:true},
 {serverAuthorityId:'trace',toolName:'ops.propose_patch',toolSchemaDigest:d,capabilities:['graph'],readOnly:false,registryAllowed:true,operatorGated:true}]});
test('selects only read-only registry-allowed tools',()=>{const r=run(fixture());assert.equal(r.toolCandidates.length,1);assert.equal(r.toolCandidates[0].id,'trace::find_dependencies');assert.equal(r.executionAuthorized,false);assert.equal(r.viterbiExecuted,false);});
test('rejects missing workspace revision',()=>{const x=fixture();x.workspaceRevision='';assert.throws(()=>run(x),/LUT_WORKSPACE_REVISION_UNRESOLVED/);});
test('rejects conflicting tool identity',()=>{const x=fixture();x.profiles.push({...x.profiles[0]});assert.throws(()=>run(x),/LUT_DUPLICATE_TOOL/);});
test('rejects invalid schema digest',()=>{const x=fixture();x.profiles[0].toolSchemaDigest='bad';assert.throws(()=>run(x),/LUT_TOOL_SCHEMA_DIGEST_INVALID/);});
test('empty eligible inventory fails closed',()=>{const x=fixture();x.profiles=[];const r=run(x);assert.equal(r.status,'NO_ELIGIBLE_TOOLS');assert.equal(r.executionAuthorized,false);});
test('proposals are deterministic',()=>{const x=fixture();assert.deepEqual(run(x),run(x));});
