'use strict';
const Redis = require('ioredis');
const fs = require('fs');
const path = require('path');

async function main() {
  const client = new Redis({ host: '127.0.0.1', port: 6379, password: 'redis', connectTimeout: 5000 });
  client.on('error', () => {});

  await client.ping();

  const karpScores     = (await client.hgetall('gpu:karpathy:scores')) || {};
  const authTop        = (await client.hgetall('ace:authority:top'))    || {};
  const karpSummaryRaw = await client.get('gpu:karpathy:summary');
  await client.quit();

  const karpSummary = karpSummaryRaw ? JSON.parse(karpSummaryRaw) : {};
  const lines = [];

  for (const [file, jsonStr] of Object.entries(karpScores)) {
    try {
      const sc = JSON.parse(jsonStr);
      const authScore = authTop[file] != null ? parseFloat(authTop[file]) : null;
      lines.push(JSON.stringify({
        source_ref: file,
        karpathy_pr: sc.pr ?? null,
        karpathy_attn: sc.attn ?? null,
        karpathy_authority: sc.authority ?? null,
        karpathy_blend: sc.blend ?? null,
        authority_score: authScore,
        final_blend: authScore != null && sc.blend != null
          ? sc.blend * 0.7 + authScore * 0.3
          : sc.blend ?? authScore ?? null,
        run_ts: karpSummary.ts ?? null,
        top_n: karpSummary.topN ?? null,
      }));
    } catch {}
  }
  for (const [key, val] of Object.entries(authTop)) {
    if (!karpScores[key]) {
      lines.push(JSON.stringify({
        source_ref: key,
        karpathy_pr: null, karpathy_attn: null,
        karpathy_authority: null, karpathy_blend: null,
        authority_score: parseFloat(val),
        final_blend: parseFloat(val),
        run_ts: null, top_n: null,
      }));
    }
  }

  const out = path.resolve(__dirname, '../memory/packets/atlas-node-authority.jsonl');
  fs.writeFileSync(out, lines.join('\n') + '\n');
  console.log('Written:', lines.length, 'lines to', path.basename(out));
  console.log('Karpathy entries:', Object.keys(karpScores).length, '| Authority entries:', Object.keys(authTop).length);
}
main().catch(e => { console.error(e.message); process.exit(1); });
