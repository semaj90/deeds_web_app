#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSourceLanguageValidationJoinV1, sourceLanguageValidationJoinJsonlV1 } from './lib/source-language-validation-join-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name) => process.argv.slice(2).find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
const required = (name) => {
  const value = arg(name);
  if (!value) throw new Error(`REQUIRED_ARGUMENT_MISSING:${name}`);
  return path.resolve(root, value);
};
const output = required('--out');
const tmpRoot = path.resolve(root, '.tmp/atlas');
const outputRelative = path.relative(tmpRoot, output);
if (!outputRelative || outputRelative.startsWith('..') || path.isAbsolute(outputRelative)) throw new Error('OUTPUT_MUST_BE_UNDER_TMP_ATLAS');
if (fs.existsSync(output)) throw new Error('OUTPUT_ALREADY_EXISTS');

const readJson = (name) => JSON.parse(fs.readFileSync(required(name), 'utf8'));
const languageInventory = readJson('--language-inventory');
const sourceMatrix = readJson('--source-matrix');
const sourceMatrixManifest = readJson('--source-matrix-manifest');
const parserSample = readJson('--parser-sample');
const join = buildSourceLanguageValidationJoinV1({ languageInventory, sourceMatrix, sourceMatrixManifest, parserSample });
const rowsText = sourceLanguageValidationJoinJsonlV1(join);
const rowsSha256 = crypto.createHash('sha256').update(rowsText).digest('hex');
join.languageRowsExport = { rowCount: join.languages.length, sha256: rowsSha256 };
const { joinSha256: _priorJoinSha, ...body } = join;
join.joinSha256 = crypto.createHash('sha256').update(canonical(body)).digest('hex');
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}
const text = `${JSON.stringify(join, null, 2)}\n`;
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, text, { encoding: 'utf8', flag: 'wx' });
console.log(JSON.stringify({ path: path.relative(root, output).replaceAll('\\', '/'), joinSha256: join.joinSha256, rowsSha256, totals: join.totals, languages: join.languages.map((row) => ({ languageId: row.languageId, sourceCount: row.rootSourceCohort.sourceCount, parserSamples: row.liveParserSample.outcomes, grammar: row.grammar.availabilityStatus })) }, null, 2));
