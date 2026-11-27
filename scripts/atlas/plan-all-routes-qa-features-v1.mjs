#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { discoverFilesystemRoutes } from './audit-all-routes-admin-demos-v1.mjs';
import { resolveOpenSpecWorkboardTaskRefV1 } from './lib/openspec-workboard-task-ref-v1.mjs';
import { DESIGN_FEATURE_LABELS } from '../../sveltekit-frontend/scripts/qa/error-fingerprint.mjs';

const configUrl = new URL('../../.okf/pipelines/all-routes-qa-feature-review-v1.json', import.meta.url);
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const sha = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

export function proposeQaRouteLabels(config, apis) {
  const families = new Map();
  for (const [label, segments] of Object.entries(config.families)) {
    if (!Object.hasOwn(DESIGN_FEATURE_LABELS, label)) throw new Error(`UNKNOWN_QA_LABEL:${label}`);
    for (const segment of segments) {
      if (!/^[a-z][a-z0-9-]*$/.test(segment) || families.has(segment)) {
        throw new Error(`INVALID_OR_DUPLICATE_API_FAMILY:${segment}`);
      }
      families.set(segment, label);
    }
  }

  return apis.map(({ url, file }) => {
    const family = /^\/api\/([^/]+)(?:\/|$)/.exec(url)?.[1];
    const proposedLabel = families.get(family) ?? null;
    const sharedReason = Object.hasOwn(config.sharedFamilies, family) ? config.sharedFamilies[family] : null;
    return {
      route: url,
      file,
      proposedLabel,
      proposedRegistryKey: proposedLabel ? DESIGN_FEATURE_LABELS[proposedLabel].registryKey : null,
      status: !proposedLabel ? 'UNMAPPED' : sharedReason ? 'REVIEW_SHARED_FAMILY' : 'REVIEW_PROPOSED_LABEL',
      reason: sharedReason,
    };
  });
}

export function readRouteHandlerAst(file, bytes, method) {
  if (!['GET', 'POST'].includes(method)) throw new Error(`COHORT_METHOD_NOT_SUPPORTED:${file}`);
  const source = bytes.toString('utf8');
  if (!bytes.equals(Buffer.from(source, 'utf8'))) throw new Error(`COHORT_SOURCE_UTF8_INVALID:${file}`);
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  if (ast.parseDiagnostics.length) throw new Error(`COHORT_SOURCE_PARSE_FAILED:${file}`);
  const matches = ast.statements.flatMap((statement) => {
    if (!statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) return [];
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === method && statement.body) return [statement];
    if (!ts.isVariableStatement(statement)) return [];
    return statement.declarationList.declarations.filter((declaration) =>
      ts.isIdentifier(declaration.name) && declaration.name.text === method && declaration.initializer);
  });
  if (matches.length !== 1) throw new Error(`COHORT_METHOD_UNRESOLVED:${method}:${file}`);
  const [node] = matches;
  const startByte = Buffer.byteLength(source.slice(0, node.getStart(ast)), 'utf8');
  const endByte = Buffer.byteLength(source.slice(0, node.end), 'utf8');
  return { kind: ts.SyntaxKind[node.kind], symbol: method, startByte, endByte,
    spanSha256: sha(bytes.subarray(startByte, endByte)), parser: `typescript@${ts.version}` };
}

function checkCohortEntry(entry, rows, allowedLabels) {
  const matches = rows.filter((row) => row.route === entry.route);
  if (matches.length !== 1 || !Object.hasOwn(DESIGN_FEATURE_LABELS, entry.label)
    || !allowedLabels.has(entry.label)) throw new Error(`COHORT_ROUTE_OR_LABEL_UNRESOLVED:${entry.route}`);
  const [{ file }] = matches;
  const bytes = readFileSync(resolve(repoRoot, file));
  return { ...entry, file, sourceSha256: sha(bytes), astObservation: readRouteHandlerAst(file, bytes, entry.method) };
}

function buildPlan(workboardSnapshot) {
  const configBytes = readFileSync(configUrl);
  const config = JSON.parse(configBytes.toString('utf8'));
  const gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  const taskRef = workboardSnapshot ? resolveOpenSpecWorkboardTaskRefV1(config.task, {
    workboardPath: resolve(workboardSnapshot), currentHead: gitHead,
  }) : null;
  const { apis } = discoverFilesystemRoutes();
  const rows = proposeQaRouteLabels(config, apis);
  const counts = Object.fromEntries(['REVIEW_PROPOSED_LABEL', 'REVIEW_SHARED_FAMILY', 'UNMAPPED']
    .map((status) => [status, rows.filter((row) => row.status === status).length]));
  const familySummary = Object.keys(config.families).map((label) => ({
    label,
    reviewProposed: rows.filter((row) => row.proposedLabel === label && row.status === 'REVIEW_PROPOSED_LABEL').length,
    reviewShared: rows.filter((row) => row.proposedLabel === label && row.status === 'REVIEW_SHARED_FAMILY').length,
  }));
  const fixtureCohort = config.fixtureCohort.map((entry) => {
    const row = rows.find((row) => row.route === entry.route);
    if (row?.proposedLabel !== entry.label || entry.method !== 'GET') throw new Error(`FIXTURE_COHORT_DRIFT:${entry.route}`);
    return checkCohortEntry(entry, rows, new Set(Object.keys(config.families)));
  });
  const existingControls = config.existingControls.map((entry) => {
    const control = checkCohortEntry(entry, rows, new Set(Object.keys(DESIGN_FEATURE_LABELS)));
    const bytes = readFileSync(resolve(repoRoot, entry.test));
    if (!bytes.toString('utf8').includes(`@feature:${entry.label}`)) throw new Error(`EXISTING_CONTROL_TAG_UNRESOLVED:${entry.test}`);
    return { ...control, testSha256: sha(bytes) };
  });

  return {
    schema: 'atlas.all-routes-qa-feature-review-receipt.v1',
    status: 'PROPOSAL_ONLY',
    task: config.task,
    taskRef,
    scope: 'Filesystem API paths, label hints, TypeScript AST observations, and existing tagged controls',
    gitHead,
    configSha256: sha(configBytes),
    routeInventorySha256: sha(JSON.stringify(rows.map(({ route, file }) => [route, file]))),
    routeCount: new Set(rows.map((row) => row.route)).size,
    handlerCount: rows.length,
    counts,
    familySummary,
    fixtureCohort,
    existingControls,
    canonicalAuthority: false,
    writesPerformed: false,
    rows,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { 'workboard-snapshot': { type: 'string' } } });
  process.stdout.write(`${JSON.stringify(buildPlan(values['workboard-snapshot']), null, 2)}\n`);
}
