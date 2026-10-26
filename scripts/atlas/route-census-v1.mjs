#!/usr/bin/env node
/**
 * Read-only parser-route census over an admitted source list.
 *
 * Runs every admitted sourceRef through source-parser-route-v1.mjs with the live :8095 capability
 * map, and records route counts by extension and language. Fails closed: when sidecar capabilities
 * are unavailable, sidecar-routed extensions are reported BLOCKED rather than assumed routable.
 *
 * Writes only the report and receipt under docs/reports. No database, Valkey, Qdrant, Neo4j or
 * Graphify writes. Route status is not symbol authority.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import {
  resolveSourceParserRouteV1,
  loadSidecarLanguageAuthority,
} from './lib/source-parser-route-v1.mjs';

const args = process.argv.slice(2);
const value = (name, fallback) => args.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;
const admittedPath = resolve(value('--admitted', '.tmp/atlas/admitted.txt'));
const sidecarUrl = value('--sidecar', 'http://127.0.0.1:8095');
const outJson = resolve(value('--out-json', 'docs/reports/source-parser-route-census-2026-10-22.json'));
const outMd = resolve(value('--out-md', 'docs/reports/source-parser-route-census-2026-10-22.md'));
const outRowsArg = value('--out-rows', null);
const outRows = outRowsArg ? resolve(outRowsArg) : null;
if (outRows) {
  const rowsRelative = relative(resolve('.tmp/atlas'), outRows);
  if (!rowsRelative || rowsRelative.startsWith('..') || isAbsolute(rowsRelative)) {
    throw new Error('ROUTE_ROWS_OUTPUT_MUST_BE_UNDER_TMP_ATLAS');
  }
  if (existsSync(outRows)) throw new Error('ROUTE_ROWS_OUTPUT_ALREADY_EXISTS');
  mkdirSync(dirname(outRows), { recursive: true });
}

const sha = (text) => `sha256:${createHash('sha256').update(text).digest('hex')}`;
const refs = readFileSync(admittedPath, 'utf8').split('\n').map((r) => r.trim()).filter(Boolean);

let authority = null;
let authorityStatus;
let authorityRevision = null;
let runtimeSourceBindings = null;
let runtimeProcessId = null;
let runtimeProcessStartedMonotonicNs = null;
let sidecarContract = null;
try {
  authority = await loadSidecarLanguageAuthority(sidecarUrl);
  authorityStatus = 'LIVE_READBACK';
  const first = [...authority.values()][0];
  authorityRevision = first?.authorityRevision ?? null;
  runtimeSourceBindings = authority.runtimeSourceBindings ?? null;
  runtimeProcessId = authority.runtimeProcessId ?? null;
  runtimeProcessStartedMonotonicNs = authority.runtimeProcessStartedMonotonicNs ?? null;
  sidecarContract = authority.sidecarContract ?? null;
} catch (error) {
  authorityStatus = `UNAVAILABLE:${error.message}`;
}

const byExtension = {};
const byStatus = {};
const byLanguage = {};
const routeRows = [];
for (const sourceRef of refs) {
  const route = resolveSourceParserRouteV1(sourceRef, authority);
  routeRows.push({
    sourceRef,
    status: route.status,
    reason: route.reason ?? null,
    extension: route.extension,
    parser: route.parser ?? null,
    documentKind: route.documentKind ?? null,
    language: route.language ?? null,
    authorityRevision: route.authorityRevision ?? null,
    symbolPolicy: route.symbolPolicy ?? null,
  });
  const ext = route.extension || '(none)';
  byStatus[route.status] = (byStatus[route.status] || 0) + 1;
  const e = (byExtension[ext] ||= { total: 0, statuses: {} });
  e.total += 1;
  const key = route.status + (route.reason ? `:${route.reason}` : '');
  e.statuses[key] = (e.statuses[key] || 0) + 1;
  if (route.status === 'ROUTED') {
    const lang = route.language || route.documentKind;
    byLanguage[lang] = (byLanguage[lang] || 0) + 1;
  }
}

const routeRowsJsonl = `${routeRows.map((row) => JSON.stringify(row)).join('\n')}\n`;

const body = {
  schema: 'atlas.source-parser-route-census.v1',
  admittedListPath: admittedPath.replace(/\\/g, '/').split('/').slice(-2).join('/'),
  admittedListSha256: sha(readFileSync(admittedPath)),
  denominator: refs.length,
  sidecar: { url: sidecarUrl, authorityStatus, authorityRevision, contract: sidecarContract, runtimeProcessId, runtimeProcessStartedMonotonicNs, runtimeSourceBindings },
  statusCounts: byStatus,
  routedByLanguage: byLanguage,
  byExtension,
  routeRows: routeRows.length,
  routeRowsSha256: sha(routeRowsJsonl),
  symbolPolicy: 'Route status is not symbol authority; ROUTED sources remain candidates until canonical resolution.',
  canonicalAuthority: false,
  writesPerformed: false,
};
body.receiptChecksum = sha(JSON.stringify(body));
writeFileSync(outJson, JSON.stringify(body, null, 2) + '\n');
if (outRows) {
  writeFileSync(outRows, routeRowsJsonl, { encoding: 'utf8', flag: 'wx' });
}

const rows = Object.entries(byExtension).sort((a, b) => b[1].total - a[1].total);
const md = [
  '# Source parser-route census (2026-10-22)', '',
  `Denominator: **${refs.length}** admitted sources. Sidecar authority: **${authorityStatus}**${authorityRevision ? ` (revision \`${authorityRevision}\`)` : ''}.`,
  `Route status is not symbol authority. Receipt: \`${body.receiptChecksum}\`.`, '',
  '| Status | Count |', '|---|---|',
  ...Object.entries(byStatus).map(([s, n]) => `| ${s} | ${n} |`), '',
  '| Extension | Total | Outcomes |', '|---|---|---|',
  ...rows.map(([ext, v]) => `| \`${ext}\` | ${v.total} | ${Object.entries(v.statuses).map(([k, n]) => `${k} ${n}`).join('; ')} |`),
];
writeFileSync(outMd, md.join('\n') + '\n');

console.log(JSON.stringify({ denominator: refs.length, sidecar: authorityStatus, statusCounts: byStatus, receiptChecksum: body.receiptChecksum }));
