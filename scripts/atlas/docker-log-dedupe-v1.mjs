#!/usr/bin/env node
/**
 * DOCKER-LOG-DEDUPE-01 (read-only, stdin only)
 *
 * Collapses repeated Docker/Postgres log lines into message templates with counts, so an agent reads
 * N unique templates instead of every repeated line. Pipe the logs in; this script never calls docker:
 *   docker logs --since 1h legal-ai-postgres 2>&1 | node scripts/atlas/docker-log-dedupe-v1.mjs --top=20
 * Flags: --top=N (default 20), --no-sample (omit the sample line entirely).
 *
 * Handles Docker json-file wrappers ({"log":"...","stream":"...","time":"..."}) and plain text.
 * Streams: memory grows with the number of distinct templates, not with the number of lines.
 * HyperLogLog (existing HyperLogLogSketch, p=10) estimates the number of distinct templates; exact
 * counts per template come from the Map. Token numbers are a chars/4 estimate, not a tokenizer count.
 * Sample lines have obvious secrets masked (password/secret/token/key=..., bearer tokens, URL
 * credentials) but masking is best effort: use --no-sample for sensitive logs.
 * Evidence only: the output is a derived summary and never an identity or a ranking signal.
 */
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { HyperLogLogSketch } from './audit-lowrank-hll-radix-cugraph-toc-v1.mjs';

const LEVELS = ['ERROR', 'STATEMENT', 'HINT', 'DETAIL', 'WARNING', 'FATAL', 'PANIC', 'LOG', 'NOTICE', 'INFO'];
const HEAD = /^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?)(?:\s+[A-Z]{2,5})?\s+\[(\d+)\]\s+/;

export function unwrapDockerLine(raw) {
  if (raw.startsWith('{"log":')) {
    try {
      const o = JSON.parse(raw);
      if (typeof o.log === 'string') return o.log.replace(/\r?\n$/, '');
    } catch {
      /* fall through to the raw line */
    }
  }
  return raw;
}

export function redact(text) {
  return text
    .replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi, '$1<redacted>@')
    .replace(/\b(bearer)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 <redacted>')
    .replace(/(["']?\b(password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key)\b["']?)(\s*[=:]\s*)("[^"]*"|'[^']*'|[^,\s}\]]+)/gi, '$1$3<redacted>');
}

export function templateOf(line) {
  const text = unwrapDockerLine(line);
  const m = HEAD.exec(text);
  const ts = m ? m[1] : null;
  let rest = m ? text.slice(m[0].length) : text;
  let level = 'OTHER';
  for (const l of LEVELS) {
    if (rest.startsWith(`${l}:`)) {
      level = l;
      rest = rest.slice(l.length + 1).trim();
      break;
    }
  }
  const body = rest
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    .replace(/'(?:[^']|'')*'/g, '<str>')
    .replace(/\b0x[0-9a-f]+\b/gi, '<hex>')
    .replace(/\b\d+(?:\.\d+)?\b/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, level === 'STATEMENT' ? 160 : 400);
  return { level, key: `${level}: ${body}`, ts, sample: text };
}

/** Streaming accumulator: push() lines one at a time, finish() returns the report. */
export function createDeduper({ top = 20, sample = true } = {}) {
  const hll = new HyperLogLogSketch();
  const map = new Map();
  let current = null; // record being assembled (continuation lines join it)
  let records = 0;
  let charsBefore = 0;

  const flush = () => {
    if (!current) return;
    records += 1;
    charsBefore += current.raw;
    const t = templateOf(current.text);
    hll.add(t.key);
    const e = map.get(t.key);
    if (e) {
      e.count += 1;
      if (t.ts) e.lastSeen = t.ts;
    } else {
      const entry = { template: t.key, level: t.level, count: 1, firstSeen: t.ts, lastSeen: t.ts };
      if (sample) entry.sample = redact(t.sample).slice(0, 300);
      map.set(t.key, entry);
    }
    current = null;
  };

  return {
    push(line) {
      if (!line || !line.trim()) return;
      const text = unwrapDockerLine(line);
      if (HEAD.test(text) || !current) {
        flush();
        current = { text, raw: line.length + 1 };
      } else {
        current.text += ` ${text.trim()}`;
        current.raw += line.length + 1;
      }
    },
    finish() {
      flush();
      const all = [...map.values()].sort((a, b) => b.count - a.count || (a.template < b.template ? -1 : 1));
      const shown = all.slice(0, top);
      const size = (list) => list.reduce((n, e) => n + JSON.stringify(e).length, 0);
      const pct = (after) => (charsBefore ? Math.max(0, Math.round((1 - after / charsBefore) * 1000) / 10) : 0);
      const charsAfter = size(shown);
      return {
        stats: {
          recordsIn: records,
          distinctTemplates: all.length,
          distinctTemplatesHllEstimate: hll.count(),
          shown: shown.length,
          charsBefore,
          charsAfter,
          estTokensBefore: Math.ceil(charsBefore / 4),
          estTokensAfter: Math.ceil(charsAfter / 4),
          estSavingsPctShown: pct(charsAfter),
          estSavingsPctAllTemplates: pct(size(all)),
          tokenEstimate: 'chars/4, not a tokenizer count',
          samplesIncluded: sample,
        },
        templates: shown,
      };
    },
  };
}

export function dedupeLines(lines, options = {}) {
  const d = createDeduper(options);
  for (const line of lines) d.push(line);
  return d.finish();
}

async function main() {
  const top = Number((process.argv.find((a) => a.startsWith('--top=')) ?? '--top=20').split('=')[1]) || 20;
  const d = createDeduper({ top, sample: !process.argv.includes('--no-sample') });
  for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) d.push(line);
  process.stdout.write(`${JSON.stringify(d.finish(), null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
