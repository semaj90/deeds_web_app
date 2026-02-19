import { promises as fs } from 'fs';
import path from 'path';

const cwd = process.cwd();
const outPath = process.argv[2] || path.join(cwd, 'svelte-check-aggregate.json');

/**
 * Recursively walk directory and collect file paths.
 */
async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const ent of entries) {
    const res = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      files.push(...(await walk(res)));
    } else {
      files.push(res);
    }
  }
  return files;
}

/**
 * Build a stable dedupe key for a diagnostic object.
 */
function diagnosticKey(d) {
  try {
    const file = d.file ?? d.path ?? d.resource ?? '';
    const code = d.code ?? d.severity ?? '';
    let loc = '';
    if (d.start && (d.start.line != null || d.start.character != null)) {
      loc = `${d.start.line ?? ''}:${d.start.character ?? ''}`;
    } else if (d.range && d.range.start) {
      loc = `${d.range.start.line ?? ''}:${d.range.start.character ?? ''}`;
    }
    const msg = typeof d.message === 'string' ? d.message : JSON.stringify(d.message);
    return `${file}|${code}|${loc}|${msg}`;
  } catch {
    return JSON.stringify(d);
  }
}

async function main() {
  try {
    const allFiles = await walk(cwd);
    // Heuristic: pick JSON files that include "svelte-check" in the name (case-insensitive)
    const batchFiles = allFiles.filter((f) => {
      const name = path.basename(f).toLowerCase();
      return name.endsWith('.json') && name.includes('svelte-check');
    });

    if (batchFiles.length === 0) {
      console.warn('No svelte-check JSON files found; writing empty aggregate.');
      await fs.writeFile(outPath, JSON.stringify({ diagnostics: [] }, null, 2), 'utf8');
      console.log(`Wrote aggregate to ${outPath}`);
      return;
    }

    const map = new Map();
    const sources = [];

    for (const file of batchFiles) {
      let content;
      try {
        content = await fs.readFile(file, 'utf8');
      } catch (err) {
        console.warn(`Skipping unreadable file ${file}: ${err.message}`);
        continue;
      }
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch (err) {
        console.warn(`Skipping invalid JSON file ${file}: ${err.message}`);
        continue;
      }
      sources.push(path.relative(cwd, file));

      // Try several common shapes to find diagnostics array
      let diagnostics = [];
      if (Array.isArray(parsed)) {
        diagnostics = parsed;
      } else if (Array.isArray(parsed.diagnostics)) {
        diagnostics = parsed.diagnostics;
      } else if (parsed.result && Array.isArray(parsed.result.diagnostics)) {
        diagnostics = parsed.result.diagnostics;
      } else if (parsed.output && Array.isArray(parsed.output)) {
        diagnostics = parsed.output;
      } else {
        // nothing to merge from this file
        continue;
      }

      for (const d of diagnostics) {
        const key = diagnosticKey(d);
        if (!map.has(key)) {
          map.set(key, d);
        }
      }
    }

    const merged = Array.from(map.values());
    const aggregate = {
      mergedFrom: sources,
      diagnostics: merged,
      metadata: {
        count: merged.length,
        sourceCount: sources.length,
        generatedAt: new Date().toISOString(),
      },
    };

    await fs.writeFile(outPath, JSON.stringify(aggregate, null, 2), 'utf8');
    console.log(`Wrote aggregate with ${merged.length} diagnostics to ${outPath}`);
  } catch (err) {
    console.error('Fatal error while aggregating svelte-check batches:', err);
    process.exitCode = 1;
  }
}

await main();
