import fs from 'fs';
import path from 'path';

const root = process.cwd();
const ctxPath = path.join(root, '.tmp', 'agentic-rag-context.json');
if (!fs.existsSync(ctxPath)) {
  console.error('Missing agentic context:', ctxPath);
  process.exit(2);
}

const argv = process.argv.slice(2);
const top = Number((argv.find(a=>a.startsWith('--top='))||'--top=5').split('=')[1]) || 5;
const filesPer = Number((argv.find(a=>a.startsWith('--files='))||'--files=5').split('=')[1]) || 5;

const ctx = JSON.parse(fs.readFileSync(ctxPath,'utf8'));

console.log('Agentic RAG Context Preview — generatedAt:', ctx.generatedAt);
console.log('Packet:', ctx.packetSummary);
console.log('Counts:', ctx.counts);
console.log('\nTop', top, 'clusters:');

(ctx.clusters||[]).slice(0, top).forEach((c, idx) => {
  console.log(`\n${idx+1}. clusterId: ${c.clusterId || c.id || '<unknown>'}`);
  if (c.featureFamily) console.log('   featureFamily:', c.featureFamily);
  if (c.tags) console.log('   tags:', c.tags.join(', '));
  if (c.counts && typeof c.counts.files !== 'undefined') console.log('   files:', c.counts.files);
  if (c.summary) console.log('   summary:', c.summary.replace(/\s+/g,' ').slice(0,240));
  if (c.topFiles && c.topFiles.length) {
    console.log('   topFiles:');
    c.topFiles.slice(0, filesPer).forEach(f => console.log('     -', f));
  }
});

console.log('\nTop pathways:');
(ctx.pathways||[]).slice(0, Math.min(10, ctx.pathways.length)).forEach((p,i)=>{
  console.log(`\n${i+1}. pathwayId: ${p.pathwayId || p.id || '<unknown>'}`);
  if (p.summary) console.log('   summary:', (p.summary||'').replace(/\s+/g,' ').slice(0,240));
  if (p.tags) console.log('   tags:', p.tags.join(', '));
});

console.log('\nRerank diff summary:');
if (ctx.rerankDiff) {
  const moved = Array.isArray(ctx.rerankDiff.moved)?ctx.rerankDiff.moved.length: (ctx.rerankDiff.moved?1:0);
  console.log(' moved items:', moved);
  console.log(' query:', ctx.rerankDiff.query || '<none>');
} else {
  console.log(' (none)');
}

process.exit(0);
