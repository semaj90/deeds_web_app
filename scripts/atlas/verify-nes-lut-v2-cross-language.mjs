#!/usr/bin/env node
/** Fail-closed, read-only Node + Python verification on identical v2 files. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPaletteV2, buildOntologyCrosswalkV2 } from './build-nes-lut-palette-v2.mjs';

const sha = b => 'sha256:' + createHash('sha256').update(b).digest('hex');
export const checksum = v => { const {checksum: _, ...unsigned} = v; return sha(JSON.stringify(unsigned)); };
function readJson(p) { return JSON.parse(readFileSync(p, 'utf8')); }
export function verifyNode(root) {
  const path = x => resolve(root, x);
  const v1Path = existsSync(path('scripts/atlas/data/nes-domain-palette-v1.json'))
    ? path('scripts/atlas/data/nes-domain-palette-v1.json') : path('fixtures/nes-domain-palette-v1.json');
  const yamlPath = existsSync(path('.okf/domains/atlas-domain-taxonomy.yaml'))
    ? path('.okf/domains/atlas-domain-taxonomy.yaml') : path('fixtures/atlas-domain-taxonomy.yaml');
  const v2Path = path('scripts/atlas/data/nes-domain-palette-v2.candidate.json');
  const v1 = readJson(v1Path), v2 = readJson(v2Path), cross = readJson(path('docs/reports/domain-ontology-nes-v2-crosswalk.candidate.json'));
  if (existsSync(path('scripts/atlas/data/nes-domain-palette-v2-PROPOSED.json')))
    throw new Error('COMPETING_V2_CANDIDATES_NOT_RECONCILED');
  for (const doc of [v1,v2,cross]) if (doc.checksum !== checksum(doc)) throw new Error('NODE_CHECKSUM_DRIFT');
  if (cross.sourceTaxonomyYamlSha256 !== sha(readFileSync(yamlPath))) throw new Error('NODE_YAML_HASH_DRIFT');
  const generatedPalette = buildPaletteV2(v1);
  const generatedCrosswalk = buildOntologyCrosswalkV2(readFileSync(yamlPath, 'utf8'), generatedPalette);
  if (JSON.stringify(v2) !== JSON.stringify(generatedPalette) || JSON.stringify(cross) !== JSON.stringify(generatedCrosswalk))
    throw new Error('CANDIDATE_ARTIFACT_DIFFERS_FROM_VERSIONED_GENERATOR');
  if (cross.paletteChecksum !== v2.checksum || v2.baselineV1Checksum !== v1.checksum) throw new Error('NODE_ARTIFACT_BINDING_DRIFT');
  if (cross.canonicalAuthority !== false || cross.writesPerformed !== false || v2.canonicalAuthority !== false) throw new Error('AUTHORITY_FORBIDDEN');
  if (v2.domains.general?.lutByte !== 10 || v2.unresolved?.lutByte !== 0) throw new Error('GENERAL_UNRESOLVED_DRIFT');
  return {v1Checksum:v1.checksum,v2Checksum:v2.checksum,crosswalkChecksum:cross.checksum,yamlSha256:sha(readFileSync(yamlPath)),v2FileSha256:sha(readFileSync(v2Path)),domains:Object.keys(v2.domains).length,ontologyGroups:cross.rows.length};
}

function flag(args,name,def) { const i=args.indexOf(name);return i<0?def:args[i+1]; }
function main() {
  const args=process.argv.slice(2);
  const root=resolve(flag(args,'--root',resolve(dirname(fileURLToPath(import.meta.url)),'../..')));
  const python=flag(args,'--python',process.env.ATLAS_PYTHON || 'python');
  const pythonArg=flag(args,'--python-arg',null);
  const node=verifyNode(root);
  const pyPath=resolve(root,'python/atlas_compute/verify_nes_v2_parity.py');
  if(!existsSync(pyPath)) throw new Error('PYTHON_PARITY_SCRIPT_MISSING');
  const cmd=[...(pythonArg?[pythonArg]:[]),pyPath,'--root',root];
  const child=spawnSync(python,cmd,{encoding:'utf8',timeout:30000,maxBuffer:1024*1024,shell:false});
  if(child.error) throw new Error('PYTHON_VERIFY_EXEC_FAILED:'+child.error.code);
  if(child.status!==0) throw new Error('PYTHON_PARITY_REJECTED:'+child.stdout.trim().slice(0,300));
  const py=JSON.parse(child.stdout.trim());
  if(py.status!=='PARITY_PASS')throw new Error('PYTHON_PARITY_STATUS_MISMATCH');
  for(const [key,val] of Object.entries(node))if(py[key]!==val)throw new Error(`CROSS_LANGUAGE_MISMATCH:${key}`);
  process.stdout.write(JSON.stringify({status:'PARITY_PASS',nodePythonCompared:true, ...node, databaseWrites:0, canonicalAuthority:false})+'\n');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))try{main();}catch(e){console.error('NES_V2_PARITY_BLOCKED:',String(e.message).slice(0,400));process.exitCode=1;}
