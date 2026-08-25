#!/usr/bin/env node
/**
 * Read-only path-alias diagnostic for the active Graphify AST artifact.
 * It measures deterministic candidate aliases without changing the canonical
 * AST key builder or applying any database migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { buildAstSourceRefKey } from './lib/ast-source-ref-key.mjs';
import { AST_SOURCE_REF_POLICY_V1, normalizeAstSourceRefForPolicy } from './lib/ast-source-ref-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const candidatesPath = path.resolve(root, process.argv.find((arg) => arg.startsWith('--candidates='))?.slice(13) ?? 'docs/reports/graphify-ast-declaration-candidates-active-v3.jsonl');
const reportPath = path.resolve(root, process.argv.find((arg) => arg.startsWith('--report='))?.slice(9) ?? 'docs/reports/atlas-ast-path-alias-census-v1.json');
const bridgePath = path.join(root, '.tmp/atlas/atlas-ast-nodes-source-ref-keys.txt');

function aliases(ref) {
  const value = String(ref ?? '').replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+/g, '/');
  const candidates = [{ policy: 'RAW', ref: value }, { policy: AST_SOURCE_REF_POLICY_V1, ref: normalizeAstSourceRefForPolicy(value) }];
  return [...new Map(candidates.map((item) => [`${item.policy}:${item.ref}`, item])).values()];
}

async function main() {
  if (!fs.existsSync(candidatesPath) || !fs.existsSync(bridgePath)) throw new Error('candidate artifact or bridge key dump missing');
  const bridgeKeys = new Set(fs.readFileSync(bridgePath, 'utf8').split('\n').map((value) => value.trim()).filter(Boolean));
  const byPolicy = {};
  const ambiguous = [];
  let total = 0;
  let rawMatches = 0;
  let aliasMatches = 0;
  let matchedCandidates = 0;
  const rl = readline.createInterface({ input: fs.createReadStream(candidatesPath, 'utf8'), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    total += 1;
    const matches = aliases(row.relative_path ?? row.source_ref)
      .map((alias) => ({ ...alias, key: buildAstSourceRefKey(alias.ref, row.symbol_kind ?? row.ast_kind, row.symbol_name) }))
      .filter((alias) => bridgeKeys.has(alias.key))
      .filter((alias, index, values) => values.findIndex((candidate) => candidate.key === alias.key) === index);
    if (matches.length > 0) {
      matchedCandidates += 1;
      if (matches.some((match) => match.policy === 'RAW')) rawMatches += 1;
      if (matches.some((match) => match.policy !== 'RAW')) aliasMatches += 1;
      for (const match of matches) byPolicy[match.policy] = (byPolicy[match.policy] ?? 0) + 1;
      if (matches.length > 1 && ambiguous.length < 50) ambiguous.push({ sourceRef: row.source_ref, symbolName: row.symbol_name, matches: matches.map((match) => match.policy) });
    }
  }
  const report = {
    schema: 'atlas.ast-path-alias-census.v1',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    databaseWrites: false,
    candidatesPath: path.relative(root, candidatesPath).replaceAll('\\', '/'),
    bridgeKeysPath: path.relative(root, bridgePath).replaceAll('\\', '/'),
    bridgeKeyCount: bridgeKeys.size,
    totalCandidates: total,
    rawMatches,
    aliasMatches,
    matchedCandidates,
    uniqueCandidateCoverage: total ? Number(((matchedCandidates / total) * 100).toFixed(2)) : 0,
    byPolicy,
    ambiguousSamples: ambiguous,
    pathPolicy: AST_SOURCE_REF_POLICY_V1,
    policyDecisionRequired: true,
    canonicalAuthorityChanged: false,
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => { console.error('[census-ast-path-aliases] fatal:', error.message); process.exitCode = 1; });
