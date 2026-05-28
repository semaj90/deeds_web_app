import fs from 'fs/promises';
import path from 'path';

const workspace = process.cwd();
const summariesPath = path.join(workspace, '.opencode', 'cards', 'summaries.merged.jsonl');
const backupPath = summariesPath + '.bak';
const invalidOut = path.join(workspace, '.opencode', 'cards', 'invalid-summaries.jsonl');

function usage() {
  console.log('Usage: node generate_summaries_from_source.mjs [--sample N] [--apply]');
}

function makeSummaryFromText(text, maxLen = 300) {
  if (!text) return '';
  const cleaned = text.replace(/\s+/g,' ').trim();
  if (cleaned.length <= maxLen) return cleaned;
  const snippet = cleaned.slice(0, maxLen);
  const lastDot = snippet.lastIndexOf('.');
  if (lastDot > Math.floor(maxLen * 0.5)) return snippet.slice(0, lastDot+1);
  return snippet + '...';
}

async function readLines(p) {
  const s = await fs.readFile(p, 'utf8');
  return s.split(/\r?\n/).filter(Boolean);
}

async function main() {
  const args = process.argv.slice(2);
  const sampleIndex = args.indexOf('--sample');
  const sampleN = sampleIndex !== -1 && args[sampleIndex+1] ? parseInt(args[sampleIndex+1],10) : 20;
  const apply = args.includes('--apply');
  if (!await exists(summariesPath)) {
    if (await exists(backupPath)) {
      console.log('Primary summaries file missing — using backup', backupPath);
      await fs.copyFile(backupPath, summariesPath);
    } else {
      console.error('No summaries.merged.jsonl or backup found at', summariesPath);
      process.exit(1);
    }
  }

  const lines = await readLines(summariesPath);
  const objs = lines.map(l=>{ try { return JSON.parse(l); } catch(e){ return null }}).filter(Boolean);
  const empty = objs.filter(o => {
    const payload = o.payload || o.points?.[0]?.payload || {};
    const s = payload.summary;
    return !(typeof s === 'string' && s.trim().length>0);
  });

  console.log('Total records:', objs.length, 'Empty summaries:', empty.length);

  // show sample
  const sample = empty.slice(0, sampleN);
  console.log('Sample empty-summary cards:');
  for (const e of sample) {
    const payload = e.payload || e.points?.[0]?.payload || {};
    console.log('-', payload.card_id || e.id, 'sourceRef=', payload.sourceRef || null);
  }

  if (!apply) {
    console.log('Dry run complete. Rerun with --apply to fill summaries from source files where available.');
    return;
  }

  // Apply fills
  const out = [];
  const invalid = [];
  for (const o of objs) {
    const payload = o.payload || o.points?.[0]?.payload || {};
    const s = payload.summary;
    if (typeof s === 'string' && s.trim().length>0) {
      out.push(o); continue;
    }
    const cardId = payload.card_id || o.id || '';
    if (cardId.startsWith('file:')) {
      const rel = cardId.replace(/^file:/,'');
      const full = path.join(workspace, rel);
      try {
        const txt = await fs.readFile(full, 'utf8');
        const summary = makeSummaryFromText(txt, 300);
        if (summary) {
          payload.summary = summary;
          payload._summary_filled = { method: 'file_truncate', from: rel };
          // assign back into original shape
          if (o.payload) o.payload = payload;
          else if (o.points && o.points[0]) o.points[0].payload = payload;
          out.push(o);
          continue;
        }
      } catch (e) {
        // file missing or unreadable
      }
    }
    // cannot fill
    if (o.payload) o.payload._valid = false; else if (o.points && o.points[0]) o.points[0].payload._valid = false;
    invalid.push(o);
  }

  // backup then write
  await fs.copyFile(summariesPath, backupPath);
  await fs.writeFile(summariesPath, out.map(o=>JSON.stringify(o)).join('\n') + '\n', 'utf8');
  await fs.writeFile(invalidOut, invalid.map(o=>JSON.stringify(o)).join('\n') + '\n', 'utf8');

  console.log('Applied fills. Valid records:', out.length, 'Invalid marked:', invalid.length, 'backup at', backupPath);
}

async function exists(p){ try{ await fs.access(p); return true }catch(e){ return false } }

if (process.argv[1] && process.argv[1].endsWith('generate_summaries_from_source.mjs')) main();
