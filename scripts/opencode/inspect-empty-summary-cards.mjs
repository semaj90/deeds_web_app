import fs from 'fs/promises';
import path from 'path';

const workspace = process.cwd();
const summariesPath = path.join(workspace, '.opencode', 'cards', 'summaries.merged.jsonl');
const outJson = path.join(workspace, '.tmp', 'empty-summary-examples.json');
const outMd = path.join(workspace, '.tmp', 'empty-summary-examples.md');

function isTextField(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function firstTextField(payload) {
  const keys = ['content', 'text', 'body', 'excerpt', 'description', 'fileContent', 'note'];
  for (const k of Object.keys(payload)) {
    if (keys.includes(k) && isTextField(payload[k])) return { key: k, text: payload[k] };
  }
  // fallback: any string-like field
  for (const k of Object.keys(payload)) {
    if (isTextField(payload[k])) return { key: k, text: payload[k] };
  }
  return null;
}

async function readLines(p) {
  const s = await fs.readFile(p, 'utf8');
  return s.split(/\r?\n/).filter(Boolean);
}

async function main() {
  const args = process.argv.slice(2);
  const limitArgIndex = args.indexOf('--limit');
  const limit = limitArgIndex !== -1 && args[limitArgIndex+1] ? parseInt(args[limitArgIndex+1],10) : 20;

  if (!(await exists(summariesPath))) {
    console.error('summaries.merged.jsonl not found at', summariesPath);
    process.exit(1);
  }

  const lines = await readLines(summariesPath);
  const objs = lines.map(l=>{ try { return JSON.parse(l); } catch(e){ return null }}).filter(Boolean);

  const empty = [];
  for (const o of objs) {
    const payload = o.payload || o.points?.[0]?.payload || {};
    const summary = payload.summary || '';
    if (!(typeof summary === 'string' && summary.trim().length>0)) {
      empty.push({ raw: o, payload });
    }
  }

  const examples = [];
  for (let i=0;i<Math.min(limit, empty.length);i++) {
    const { raw, payload } = empty[i];
    const id = raw.id ?? payload.id ?? null;
    const card_id = payload.card_id ?? null;
    const sourceRef = payload.sourceRef ?? payload.source_ref ?? null;
    const title = payload.title ?? payload.name ?? null;
    const keysPresent = Object.keys(payload || {});
    const textField = firstTextField(payload);
    const textLen = textField ? textField.text.length : 0;
    const summaryLen = (payload.summary || '').length;
    let reason = 'no_source';
    if (card_id && String(card_id).startsWith('file:')) {
      const rel = String(card_id).replace(/^file:/,'');
      const full = path.join(workspace, rel);
      if (await exists(full)) reason = 'file_present'; else reason = 'file_missing';
    } else if (sourceRef) {
      reason = 'has_sourceRef';
    }

    examples.push({ id, card_id, sourceRef, source: payload.source ?? null, title, keysPresent, textLength: textLen, summaryLength: summaryLen, firstTextField: textField ? { key: textField.key, snippet: textField.text.slice(0,300) } : null, reason });
  }

  await fs.mkdir(path.dirname(outJson), { recursive: true });
  await fs.writeFile(outJson, JSON.stringify({ totalEmpty: empty.length, examples }, null, 2), 'utf8');

  // write markdown
  const mdLines = [];
  mdLines.push(`# Empty Summary Examples`);
  mdLines.push(`Total empty-summary cards: ${empty.length}`);
  mdLines.push('');
  for (const ex of examples) {
    mdLines.push(`- **id**: ${ex.id}`);
    mdLines.push(`  - card_id: ${ex.card_id}`);
    mdLines.push(`  - sourceRef: ${ex.sourceRef}`);
    mdLines.push(`  - source: ${ex.source}`);
    mdLines.push(`  - title: ${ex.title}`);
    mdLines.push(`  - keys: ${ex.keysPresent.join(', ')}`);
    mdLines.push(`  - textLength: ${ex.textLength}`);
    mdLines.push(`  - summaryLength: ${ex.summaryLength}`);
    mdLines.push(`  - firstTextField: ${ex.firstTextField ? `
    key=${ex.firstTextField.key}
    snippet=${ex.firstTextField.snippet.replace(/\n/g,' ' )}` : 'none'}`);
    mdLines.push(`  - reason: ${ex.reason}`);
    mdLines.push('');
  }
  await fs.writeFile(outMd, mdLines.join('\n'), 'utf8');

  console.log(`Wrote ${outJson} and ${outMd}. Total empty: ${empty.length}. Showing ${examples.length} examples.`);
}

async function exists(p){ try{ await fs.access(p); return true }catch(e){ return false } }

// Always run main when executed as a script
main().catch(err => { console.error('inspect script error:', err); process.exitCode = 2; });
