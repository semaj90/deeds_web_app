import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checksum, verifyNode } from '../verify-nes-lut-v2-cross-language.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const sha=x=>'sha256:'+createHash('sha256').update(x).digest('hex');

test('same candidate has valid Node checksums and 17 ontology rollups',()=>{
 const v=verifyNode(root);
 assert.equal(v.domains,14);
 assert.equal(v.ontologyGroups,17);
 assert.match(v.v2Checksum,/^sha256:[a-f0-9]{64}$/);
});

test('cross-language run compares Python against Node on identical files',()=>{
 const run=spawnSync(process.env.ATLAS_NODE||'node',[resolve(root,'scripts/atlas/verify-nes-lut-v2-cross-language.mjs'),'--root',root],{encoding:'utf8'});
 assert.equal(run.status,0,run.stderr);
 const j=JSON.parse(run.stdout.trim());
 assert.equal(j.status,'PARITY_PASS');
 assert.equal(j.nodePythonCompared,true);
 assert.equal(j.databaseWrites,0);
});

test('independent checksum matches pinned candidate',()=>{
 const v=JSON.parse(readFileSync(resolve(root,'scripts/atlas/data/nes-domain-palette-v2.candidate.json')));
 assert.equal(v.checksum,checksum(v));
 assert.equal(v.checksum,'sha256:9aa054b012ff29a5a9a050533b25db86b8dfafca0a469569c043b466b42a1334');
 assert.equal(sha(readFileSync(resolve(root,'scripts/atlas/data/nes-domain-palette-v2.candidate.json'))).length,71);
});

test('migration SQL render fails if both incompatible v2 variants are present',()=>{
  const {mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync}=requireFs();
  const {tmpdir}=requireOs();
  const p=mkdtempSync(resolve(tmpdir(),'atlas-nes-v2-conflict-'));
  try {
    for(const name of ['migrate-nes-lut-v2.mjs','build-nes-lut-palette-v2.mjs','lib-nes-lut-v2-migration-core.mjs']){
      const to=resolve(p,'scripts/atlas',name);mkdirSync(dirname(to),{recursive:true});
      copyFileSync(resolve(root,'scripts/atlas',name),to);
    }
    writeFileSync(resolve(p,'package.json'),'{"type":"module"}\n');
    const to=resolve(p,'scripts/atlas/data/nes-domain-palette-v2-PROPOSED.json');
    mkdirSync(dirname(to),{recursive:true});writeFileSync(to,'{}');
    const run=spawnSync('node',[resolve(p,'scripts/atlas/migrate-nes-lut-v2.mjs'),'--render-sql'],{encoding:'utf8'});
    assert.notEqual(run.status,0);
    assert.match(run.stderr,/COMPETING_V2_CANDIDATES_NOT_RECONCILED/);
  }finally{rmSync(p,{recursive:true,force:true});}
});

function requireFs(){return {mkdtempSync:fs.mkdtempSync,mkdirSync:fs.mkdirSync,copyFileSync:fs.copyFileSync,writeFileSync:fs.writeFileSync,rmSync:fs.rmSync};}
function requireOs(){return {tmpdir:os.tmpdir};}
