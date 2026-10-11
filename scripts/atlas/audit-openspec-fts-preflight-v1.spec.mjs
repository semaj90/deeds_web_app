import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifySourceSet,verify,inspect} from './audit-openspec-fts-preflight-v1.mjs';
test('missing source owner blocks',()=>{const r=classifySourceSet({});assert.equal(r.status,'BLOCKED_MISSING_OWNER');assert.equal(r.dbWrites,false)});
test('SQL capability source evidence does not prove deployed index',()=>{const r=classifySourceSet({parser:'x',ingestion:'x',schema:'pgTable(',retrievalSql:"CREATE INDEX x ON t USING gin (to_tsvector('simple',content)); CREATE INDEX y USING gin (task_text gin_trgm_ops);"});
 assert.equal(r.status,'SOURCE_PREFLIGHT_ONLY');assert.equal(r.sqlChecks.nativeFts,true);assert.equal(r.sqlChecks.trigramChallenger,true);assert.equal(r.deployedIndexVerified,false);});
test('current source fingerprint readback and checksum',async()=>{const r=await inspect();assert.equal(verify(r),true);assert.equal(r.dbWrites,false);assert.ok(r.files.parser.sha256);r.dbWrites=true;assert.throws(()=>verify(r),/PREFLIGHT_CHECKSUM_MISMATCH/);});
