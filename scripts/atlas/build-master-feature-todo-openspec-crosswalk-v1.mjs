#!/usr/bin/env node
/**
 * Build a review-only crosswalk from the archived Master Feature TODO to OpenSpec.
 * Candidate matches are lexical hints, never authority or automatic task merges.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = process.cwd();
const todoPath = join(root, 'docs', 'reports', 'sessions', 'MASTER-FEATURE-TODO-2026-05-20.md');
const changesRoot = join(root, 'openspec', 'changes');
const reportPath = join(root, 'docs', 'reports', 'master-feature-todo-openspec-crosswalk-v1.json');
const stopWords = new Set('the and for with from into this that task track phase add run use keep existing current after before only not are was has have should will into once then lane path source feature'.split(' '));
const tokenize = (value) => [...new Set(String(value).toLowerCase().replace(/[^a-z0-9_/-]+/g, ' ').split(/\s+/).filter((token) => token.length >= 4 && !stopWords.has(token)))];
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const rel = (file) => relative(root, file).split(sep).join('/');

if (!existsSync(todoPath)) throw new Error(`MISSING_SOURCE:${rel(todoPath)}`);
const todoText = readFileSync(todoPath, 'utf8');
const todoRevision = `sha256:${sha256(todoText)}`;
const todoLines = todoText.split(/\r?\n/);
let section = 'UNSECTIONED';
const rows = [];
todoLines.forEach((line, index) => {
  const heading = line.match(/^#{1,4}\s+(.+)$/);
  if (heading) section = heading[1].trim();
  const checkbox = line.match(/^\s*[-*]\s*\[([ xX])\]\s+(.*)$/);
  if (!checkbox) return;
  rows.push({ sourceRef: `${rel(todoPath)}#L${index + 1}`, sourceRevision: todoRevision, line: index + 1, section, state: checkbox[1].toLowerCase() === 'x' ? 'DONE_RECORDED_IN_ARCHIVE' : 'OPEN_RECORDED_IN_ARCHIVE', text: checkbox[2].trim() });
});

const changeDocs = readdirSync(changesRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).flatMap((entry) => {
  const file = join(changesRoot, entry.name, 'tasks.md');
  if (!existsSync(file)) return [];
  const text = readFileSync(file, 'utf8');
  return [{ change: entry.name, source: rel(file), tokens: new Set(tokenize(`${entry.name} ${text}`)), lastUpdatedAt: statSync(file).mtime.toISOString() }];
});
const tokenFrequency = new Map();
for (const doc of changeDocs) for (const token of doc.tokens) tokenFrequency.set(token, (tokenFrequency.get(token) ?? 0) + 1);
const rareTokenLimit = Math.max(2, Math.floor(changeDocs.length * 0.2));

const crosswalk = rows.map((row) => {
  const tokens = tokenize(row.text).filter((token) => (tokenFrequency.get(token) ?? 0) <= rareTokenLimit);
  const candidates = changeDocs.map((doc) => {
    const overlap = tokens.filter((token) => doc.tokens.has(token));
    return { change: doc.change, source: doc.source, overlapCount: overlap.length, overlapTokens: overlap.slice(0, 12), lastUpdatedAt: doc.lastUpdatedAt };
  }).filter((candidate) => candidate.overlapCount >= 2 || (candidate.overlapCount === 1 && candidate.overlapTokens.some((token) => token.includes('/') || token.includes('_')))).sort((a, b) => b.overlapCount - a.overlapCount || b.lastUpdatedAt.localeCompare(a.lastUpdatedAt) || a.change.localeCompare(b.change)).slice(0, 3);
  const ambiguous = candidates.length > 1 && candidates[0].overlapCount === candidates[1].overlapCount;
  return { ...row, candidateChanges: candidates, matchStatus: !candidates.length ? 'NO_CANDIDATE_FOUND' : ambiguous ? 'AMBIGUOUS_LEXICAL_CANDIDATES' : 'LEXICAL_CANDIDATE_REVIEW_REQUIRED', automaticMerge: false };
});

const result = {
  schema: 'atlas.master-feature-todo.openspec-crosswalk.v1',
  generatedAt: new Date().toISOString(),
  source: { path: rel(todoPath), sourceRevision: todoRevision, lineCount: todoLines.length, checklistCount: rows.length },
  summary: { rows: rows.length, archivedDone: rows.filter((row) => row.state === 'DONE_RECORDED_IN_ARCHIVE').length, archivedOpen: rows.filter((row) => row.state === 'OPEN_RECORDED_IN_ARCHIVE').length, withCandidates: crosswalk.filter((row) => row.candidateChanges.length).length, withoutCandidates: crosswalk.filter((row) => !row.candidateChanges.length).length, ambiguousCandidates: crosswalk.filter((row) => row.matchStatus === 'AMBIGUOUS_LEXICAL_CANDIDATES').length },
  policy: 'REVIEW_ONLY_NO_AUTOMATIC_MERGE_OR_TASK_CLOSURE',
  crosswalk,
};
writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(`MASTER_FEATURE_TODO_CROSSWALK_BUILT rows=${rows.length} candidates=${result.summary.withCandidates} unresolved=${result.summary.withoutCandidates}`);
console.log(`report=${reportPath}`);
