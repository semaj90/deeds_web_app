import test from 'node:test';import assert from 'node:assert/strict';
import {verifyFactManifestReadbackV1 as verify} from './verify-fact-manifest-readback-v1.mjs';
const sample={relation:{kind:'RELATION',evidenceRef:'e',sourceRevision:'s'},
 factRow:{factId:'f',relationEvidenceRef:'e',sourceRevision:'s',checksum:'c'},
 factReceipt:{factId:'f',readbackChecksum:'c'},
 manifest:{admittedFactIds:['f'],identityChecksum:'m'},
 manifestReceipt:{manifestChecksum:'m',factId:'f',sourceRevision:'s'}};
test('consistent fixture never authorizes admission',()=>{const x=verify(sample);assert.equal(x.status,'CONSISTENT_RECORD_CLAIMS');assert.equal(x.admissionAuthorized,false)});
test('concept mention blocks',()=>assert(verify({...sample,relation:{...sample.relation,kind:'CONCEPT'}}).failures.includes('TYPED_RELATION_REQUIRED')));
test('fact revision mismatch blocks',()=>assert(verify({...sample,factRow:{...sample.factRow,sourceRevision:'older'}}).failures.includes('FACT_IDENTITY_OR_REVISION_MISMATCH')));
test('unbound manifest blocks',()=>assert(verify({...sample,manifestReceipt:{...sample.manifestReceipt,manifestChecksum:'other'}}).failures.includes('MANIFEST_CHECKSUM_UNBOUND')));
test('missing admitted fact blocks',()=>assert(verify({...sample,manifest:{...sample.manifest,admittedFactIds:[]}}).failures.includes('MANIFEST_FACT_NOT_INCLUDED')));
