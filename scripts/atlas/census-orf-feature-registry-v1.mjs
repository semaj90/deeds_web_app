#!/usr/bin/env node
/** Source-only census. Does not open database connections or approve definitions.
 * Writes a scratch report only when --report=.tmp/... is provided.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {censusOrfRegistrySources} from './lib/orf-registry-census-v1.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const paths={
 projectionSource:'sveltekit-frontend/src/lib/server/atlas/contracts/observation-feature-projection-v1.ts',
 aggregationSource:'scripts/atlas/aggregate-observation-feature-plan.mjs',
 compilerSource:'packages/parent-atlas/src/core/observation-feature-compiler.ts',
};
const args=process.argv.slice(2);
if(args.some(a=>!a.startsWith('--report='))) throw Error('UNKNOWN_ARGUMENT');
if(args.length>1) throw Error('TOO_MANY_ARGUMENTS');
const texts=Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([key,p])=>[key,await readFile(path.join(root,p),'utf8')])));
const report=censusOrfRegistrySources(texts);
const out=args[0]?.slice('--report='.length);
if(out){
 const resolved=path.resolve(root,out);
 if(!out.startsWith('.tmp/') || !resolved.startsWith(path.join(root,'.tmp')+path.sep) || path.extname(resolved)!=='.json') throw Error('SCRATCH_REPORT_ONLY');
 await mkdir(path.dirname(resolved),{recursive:true});
 await writeFile(resolved,JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify(report,null,2));
