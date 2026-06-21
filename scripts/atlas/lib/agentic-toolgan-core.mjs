import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '../../..');

export function ensureDirs() {
  const dirs = [
    path.join(ROOT, 'memory', 'agentic'),
    path.join(ROOT, '.opencode'),
    path.join(ROOT, 'docs', 'reports'),
    path.join(ROOT, '.tmp')
  ];
  for (const d of dirs) {
    mkdirSync(d, { recursive: true });
  }
}

export function readNdjson(filePath) {
  if (!existsSync(filePath)) return [];
  const lines = readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
  const result = [];
  for (const line of lines) {
    try {
      result.push(JSON.parse(line));
    } catch { /* skip corrupted lines */ }
  }
  return result;
}

export function appendNdjson(filePath, obj) {
  ensureDirs();
  const line = JSON.stringify(obj) + '\n';
  appendFileSync(filePath, line, 'utf8');
}

export function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

export function normalizeFailure(sig) {
  if (!sig) return '';
  // Strip UUIDs
  let norm = sig.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>');
  // Strip absolute path locations
  norm = norm.replace(/[a-zA-Z]:\\[\\\w\-\.\s]+/g, '<PATH>');
  norm = norm.replace(/\/[\w\-\.\s]+/g, '<PATH>');
  // Strip numbers (e.g. line/col numbers, ports, timestamps)
  norm = norm.replace(/\d+/g, '<NUM>');
  // Clean up whitespace
  return norm.trim().toLowerCase();
}

export function buildDoNotRepeatKey(intent, query, files, tool_path, failure_signature) {
  const normalizedQuery = (query || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const sortedFiles = [...(files || [])].sort().join(',');
  const normalizedToolPath = [...(tool_path || [])].sort().join(',');
  const normalizedFailure = normalizeFailure(failure_signature);
  
  const inputStr = `${intent}|${normalizedQuery}|${sortedFiles}|${normalizedToolPath}|${normalizedFailure}`;
  return sha256(inputStr);
}

export function writeTimelineEvent(event) {
  ensureDirs();
  const timelinePath = path.join(ROOT, 'memory', 'agentic', 'timeline.ndjson');
  const ledgerPath = path.join(ROOT, '.opencode', 'outcome-ledger.ndjson');
  appendNdjson(timelinePath, event);
  appendNdjson(ledgerPath, event);
}
