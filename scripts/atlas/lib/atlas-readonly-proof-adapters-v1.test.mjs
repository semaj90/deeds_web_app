import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import{createHash}from'node:crypto';
import{readReceiptFromWorkspaceV1 as read,planEvidenceOwnerReadsV1 as plan}from'./atlas-readonly-proof-adapters-v1.mjs';
const digest=b=>createHash('sha256').update(b).digest('hex');
function fixture(fn){const root=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-proof-'));try{return fn(root)}finally{fs.rmSync(root,{recursive:true,force:true})}}
test('byte hash is verified but authority is not',()=>fixture(root=>{const b=Buffer.from('{"state":"fixture"}');fs.writeFileSync(path.join(root,'r.json'),b);const r=read({workspaceRoot:root,relativePath:'r.json',expectedSha256:digest(b)});assert.equal(r.record.state,'fixture');assert.equal(r.authenticated,false)}));
test('stale digest rejected',()=>fixture(root=>{fs.writeFileSync(path.join(root,'r.json'),'{}');assert.throws(()=>read({workspaceRoot:root,relativePath:'r.json',expectedSha256:'a'.repeat(64)}),/DIGEST_MISMATCH/)}));
test('path traversal rejected',()=>fixture(root=>assert.throws(()=>read({workspaceRoot:root,relativePath:'../outside',expectedSha256:'a'.repeat(64)}),/PATH_OUTSIDE_WORKSPACE/)));
test('symlink receipt rejected',()=>fixture(root=>{fs.writeFileSync(path.join(root,'target.json'),'{}');fs.symlinkSync(path.join(root,'target.json'),path.join(root,'link.json'));assert.throws(()=>read({workspaceRoot:root,relativePath:'link.json',expectedSha256:digest('{}')}),/UNSAFE_RECEIPT_FILE/)}));
test('oversized receipt rejected',()=>fixture(root=>{fs.writeFileSync(path.join(root,'r.json'),'123');assert.throws(()=>read({workspaceRoot:root,relativePath:'r.json',expectedSha256:digest('123'),maxBytes:2}),/UNSAFE_RECEIPT_FILE/)}));
test('unapplied schema and synthetic claims never authorize',()=>{const x=plan({migrationStatus:'DESIGN_UNAPPLIED',task:{currentRevision:1},receipt:{taskRevision:1}});assert.equal(x.checks[0].status,'BLOCKED');assert.equal(x.runtimeAdmissionAuthorized,false);assert.equal(x.checks.at(-1).status,'BLOCKED')});
