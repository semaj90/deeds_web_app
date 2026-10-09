import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRepairEvidenceReadiness, smokeRepairEvidenceReadiness } from './agentic-repair-evidence-readiness-v1.mjs';

test('smoke is read-only and fail-closed', () => assert.equal(smokeRepairEvidenceReadiness().status,'PASS'));
test('missing owners print actionable TODOs, no mutation', () => {
 const r=evaluateRepairEvidenceReadiness({});
 assert.equal(r.status,'BLOCKED_MISSING_EVIDENCE');
 assert.equal(r.canMutate,false);
 assert.equal(r.canonicalAuthority,false);
 assert.equal(r.writesPerformed,false);
 assert.ok(r.todos.some(x=>x.includes('astGrepRevision')));
 assert.ok(r.todos.some(x=>x.includes('LongMemEval')));
});
test('present fields are not treated as independently verified', () => {
 const keys={source:['workspaceRevision','sourceRevision','sourceRef','sourceSha256','chunkId','packetKey'],structural:['treeSitterRevision','astGrepRevision','symbolVersionId','structuralEvidenceRef'],retrieval:['candidateSnapshotRevision','ordinalMapChecksum','contextManifestChecksum','representationRevision','retrievalReceiptRef'],grounding:['extractorRevision','evidenceSpanChecksum','groundedReceiptRef','canonicalPacketReadbackRef'],synthesis:['ornithModelRevision','promptManifestChecksum','answerEvaluationRef']};
 const input=Object.fromEntries(Object.entries(keys).map(([k,v])=>[k,Object.fromEntries(v.map(x=>[x,'fixture']))]));
 input.source.byteStart=0;input.source.byteEnd=1;input.synthesis.answerEvidenceRefs=['fixture'];
 const r=evaluateRepairEvidenceReadiness(input);
 assert.equal(r.status,'REVIEW_ONLY_OWNER_READBACK_REQUIRED');
 assert.equal(r.checks.source.status,'FIELDS_PRESENT_UNVERIFIED');
 assert.equal(r.canMutate,false);
});
test('invalid ranges are rejected', () => {
 const r=evaluateRepairEvidenceReadiness({source:{byteStart:4,byteEnd:2}});
 assert.equal(r.checks.source.status,'BLOCKED');
});
test('checksum deterministic', () => {
 const a=evaluateRepairEvidenceReadiness({source:{sourceRef:'x'}});
 const b=evaluateRepairEvidenceReadiness({source:{sourceRef:'x'}});
 assert.equal(a.checksum,b.checksum);
});
