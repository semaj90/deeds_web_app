import fs from 'fs';
import path from 'path';

const root = process.cwd();
const outDir = path.join(root, '.tmp');
const outPath = path.join(outDir, 'agentic-rag-context.json');

function readJson(p) {
  try {
    const txt = fs.readFileSync(path.resolve(root, p), 'utf8');
    return JSON.parse(txt);
  } catch (e) {
    return null;
  }
}

function readJsonl(p) {
  try {
    const txt = fs.readFileSync(path.resolve(root, p), 'utf8');
    return txt.split(/\r?\n/).filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return { raw: l }; } });
  } catch (e) {
    return [];
  }
}

fs.mkdirSync(outDir, { recursive: true });

const acePacket = readJson('.opencode/ace-packet.json');
const clusters = readJsonl('memory/exports/cluster-cards.jsonl');
const pathways = readJsonl('memory/exports/pathway-cards.jsonl');
const rerankDiff = readJson('.tmp/rerank-diff.json');
const retrievalReport = readJson('.tmp/retrieval-ranking-report.json');

const ctx = {
  generatedAt: new Date().toISOString(),
  source: 'opencode:agentic-rag-context',
  counts: {
    cardsInPacket: acePacket?.cards?.length || 0,
    clusters: clusters.length,
    pathways: pathways.length,
    rerankActions: rerankDiff ? (Array.isArray(rerankDiff.moved) ? rerankDiff.moved.length : (rerankDiff.moved ? 1 : 0)) : 0
  },
  packetSummary: {
    id: acePacket?.id || null,
    title: acePacket?.title || null
  },
  clusters: clusters.slice(0, 200),
  pathways: pathways.slice(0, 200),
  rerankDiff: rerankDiff || null,
  retrievalRankingReport: retrievalReport || null
};

fs.writeFileSync(outPath, JSON.stringify(ctx, null, 2) + '\n', 'utf8');
console.log('Wrote', outPath, 'counts:', ctx.counts);

process.exit(0);

