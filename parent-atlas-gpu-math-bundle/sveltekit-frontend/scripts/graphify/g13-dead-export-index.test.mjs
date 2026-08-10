import assert from 'node:assert/strict';
import { buildImportedNameSet, classifyPossiblyDeadExports } from './g13-dead-export-index.mjs';

const files=[
  {path:'a.ts',importedNames:[],exportedNames:['foo','bar']},
  {path:'b.ts',importedNames:['foo'],exportedNames:['baz']},
];
assert.deepEqual([...buildImportedNameSet(files)],['foo']);
assert.deepEqual(classifyPossiblyDeadExports(files).map(x=>x.name),['bar','baz']);
console.log('G13_NO_NxK_EXPORT_SCAN_PASS');
