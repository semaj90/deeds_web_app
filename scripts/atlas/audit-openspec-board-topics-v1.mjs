#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const reportsDir=process.argv[2]??path.resolve(process.cwd(),'docs/reports');
const defaultInputs=['actionable-workboard-v3.json','openspec-execution-controller-v1.json','openspec-actionable-work-v1.json'];
const inputPath=process.argv[3]??defaultInputs.map((name)=>path.join(reportsDir,name)).find((candidate)=>fs.existsSync(candidate));
const outputPath=process.argv[4]??path.join(reportsDir,'openspec-topic-clusters-v1.json');
if (!inputPath) throw new Error(`No actionable/controller report found in ${reportsDir}`);
const input=JSON.parse(fs.readFileSync(inputPath,'utf8'));
const tasks=Array.isArray(input.tasks)?input.tasks:[];
const byTopic=new Map(); const byChange=new Map(); const fileRefs=new Set();
for(const t of tasks){
  const topic=String(t.topic??t.lane??t.controller?.lane??'other');
  const c=byTopic.get(topic)??{topic,count:0,readOnly:0,mutating:0,llamaSlots:0,changes:new Set()};
  c.count++; if(t.readOnly)c.readOnly++;else c.mutating++; if((t.resources?.llamaSlots??0)>0)c.llamaSlots++; c.changes.add(String(t.changeId??'unknown')); byTopic.set(topic,c);
  const changeId=String(t.changeId??'unknown');
  byChange.set(changeId,(byChange.get(changeId)??0)+1);
  const taskPath=`openspec/changes/${changeId}/tasks.md`;
  if(fs.existsSync(path.resolve(process.cwd(),taskPath))) fileRefs.add(taskPath);
  for(const ref of [
    ...(t.evidenceRefs??[]),
    ...(t.files??[]),
    ...(t.readSet??[]),
    ...(t.writeSet??[]),
    ...(t.warmHints?.evidenceRefs??[]),
  ]) if(typeof ref==='string'&&/\.(ts|mts|js|mjs|svelte|json|md|sql|py)$/i.test(ref)) fileRefs.add(ref);
}
const output={schema:'atlas.openspec-topic-clusters.v1',counts:{tasks:tasks.length,topics:byTopic.size,changes:byChange.size,referencedFiles:fileRefs.size},topics:[...byTopic.values()].map(x=>({...x,changes:[...x.changes].sort()})).sort((a,b)=>b.count-a.count||a.topic.localeCompare(b.topic)),topChanges:[...byChange.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,50).map(([changeId,count])=>({changeId,count})),referencedFiles:[...fileRefs].sort(),writesPerformed:false};
fs.writeFileSync(outputPath,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(output.counts,null,2));
