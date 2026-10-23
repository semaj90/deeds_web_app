import { createHash } from 'node:crypto';
import { lstatSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { blockHash, taskBlock } from './wfu-metadata.mjs';

const sourcePathPattern = /(?:[\p{L}\p{N}@._()+-]+[\\/])+[\p{L}\p{N}@._()+-]+\.[A-Za-z0-9]{1,12}/gu;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function lineCharacterOffsets(sourceText) {
  const offsets = [0];
  for (let index = 0; index < sourceText.length; index++) {
    if (sourceText[index] === '\n') offsets.push(index + 1);
  }
  return offsets;
}

export function extractOpenSpecSourcePathRefsV1({ task, sourceText, expectedTaskFileSha256 }) {
  if (!task || typeof task.source !== 'string' || !Number.isInteger(task.line) || task.line < 1
    || typeof task.blockHash !== 'string' || typeof sourceText !== 'string'
    || typeof expectedTaskFileSha256 !== 'string') throw new TypeError('OPENSPEC_PATH_TASK_INPUT_INVALID');
  const taskFileSha256 = `sha256:${sha256(Buffer.from(sourceText, 'utf8'))}`;
  if (taskFileSha256 !== expectedTaskFileSha256) throw new Error('OPENSPEC_TASK_FILE_REVISION_MISMATCH');
  const lines = sourceText.split(/\r?\n/);
  const startIndex = task.line - 1;
  if (startIndex >= lines.length) throw new Error('OPENSPEC_TASK_LINE_OUT_OF_RANGE');
  const block = taskBlock(lines, startIndex);
  if (blockHash(block) !== task.blockHash) throw new Error('OPENSPEC_TASK_BLOCK_REVISION_MISMATCH');
  const lineOffsets = lineCharacterOffsets(sourceText);
  const refs = [];
  block.forEach((line, blockOffset) => {
    const sourceLine = task.line + blockOffset;
    const lineStartChar = lineOffsets[sourceLine - 1];
    if (lineStartChar === undefined || lines[sourceLine - 1] !== line) throw new Error('OPENSPEC_TASK_BLOCK_SOURCE_MISMATCH');
    if (blockOffset > 0 && /^\s*-\s*\[[ xX]\]\s+/.test(line)) return;
    const inlineCode = /`([^`\n]+)`/g;
    for (const codeMatch of line.matchAll(inlineCode)) {
      const codeText = codeMatch[1];
      for (const pathMatch of codeText.matchAll(sourcePathPattern)) {
        const rawPath = pathMatch[0];
        const startChar = lineStartChar + codeMatch.index + 1 + pathMatch.index;
        const endChar = startChar + rawPath.length;
        const startByte = Buffer.byteLength(sourceText.slice(0, startChar), 'utf8');
        const endByte = Buffer.byteLength(sourceText.slice(0, endChar), 'utf8');
        const rawBytes = Buffer.from(rawPath, 'utf8');
        refs.push({
          taskRef: `${task.source}#L${task.line}`,
          taskKey: task.taskKey ?? null,
          taskBlockSha256: task.blockHash,
          taskFileSha256,
          evidenceLine: sourceLine,
          evidenceStartByte: startByte,
          evidenceEndByte: endByte,
          evidenceText: rawPath,
          evidenceSha256: sha256(rawBytes),
          referencedPath: rawPath.replaceAll('\\', '/'),
          relation: 'OPENSPEC_TASK_REFERENCES_PATH_CANDIDATE',
          authorityStatus: 'CURRENT_TASK_BYTES_UNBOUND_TO_WORKSPACE_SNAPSHOT',
        });
      }
    }
  });
  return refs;
}

export function resolveRepositoryPathV1({ repositoryRoot, referencedPath, directorySummaryPaths, directoryEntriesCache = new Map() }) {
  if (typeof repositoryRoot !== 'string' || typeof referencedPath !== 'string'
    || (!Array.isArray(directorySummaryPaths) && !(directorySummaryPaths instanceof Set))
    || !(directoryEntriesCache instanceof Map)) {
    throw new TypeError('OPENSPEC_PATH_RESOLUTION_INPUT_INVALID');
  }
  const summaryPathSet = directorySummaryPaths instanceof Set ? directorySummaryPaths : new Set(directorySummaryPaths);
  const normalized = referencedPath.replaceAll('\\', '/');
  const segments = normalized.split('/');
  if (!normalized || path.posix.isAbsolute(normalized) || /^[a-z]:/i.test(normalized)
    || segments.some(segment => !segment || segment === '.' || segment === '..')) {
    return { status: 'UNSAFE_OR_NONCANONICAL_PATH', resolvedPath: null, directoryPath: null };
  }
  let current = path.resolve(repositoryRoot);
  for (let index = 0; index < segments.length; index++) {
    let entries = directoryEntriesCache.get(current);
    if (!entries) {
      try {
        entries = readdirSync(current);
        directoryEntriesCache.set(current, entries);
      } catch {
        return { status: 'PARENT_PATH_UNAVAILABLE', resolvedPath: null, directoryPath: null };
      }
    }
    const exactEntry = entries.find(entry => entry === segments[index]);
    if (!exactEntry) {
      const caseFoldMatch = entries.find(entry => entry.toLowerCase() === segments[index].toLowerCase());
      return { status: caseFoldMatch ? 'PATH_CASE_MISMATCH' : 'PATH_NOT_FOUND', resolvedPath: null, directoryPath: null };
    }
    current = path.join(current, exactEntry);
    let stat;
    try {
      stat = lstatSync(current);
    } catch {
      return { status: 'PATH_NOT_FOUND', resolvedPath: null, directoryPath: null };
    }
    if (stat.isSymbolicLink()) return { status: 'SYMLINK_NOT_FOLLOWED', resolvedPath: null, directoryPath: null };
    if (index < segments.length - 1 && !stat.isDirectory()) {
      return { status: 'PARENT_COMPONENT_NOT_DIRECTORY', resolvedPath: null, directoryPath: null };
    }
    if (index === segments.length - 1 && !stat.isFile()) {
      return { status: 'TARGET_NOT_REGULAR_FILE', resolvedPath: null, directoryPath: null };
    }
  }
  const directoryPath = path.posix.dirname(normalized);
  if (!summaryPathSet.has(directoryPath)) {
    return { status: 'TARGET_DIRECTORY_NOT_IN_SUMMARY', resolvedPath: normalized, directoryPath };
  }
  return { status: 'EXACT_REPO_ROOT_FILE', resolvedPath: normalized, directoryPath };
}
