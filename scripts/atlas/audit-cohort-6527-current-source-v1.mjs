#!/usr/bin/env node
/**
 * Read-only validation of the pinned OpenSpec cohort crosswalk against current source files.
 * This verifies source locators and task content; it does not reconcile or mutate Kanban state.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blockHash, taskBlock } from './lib/wfu-metadata.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MEMBERS_PATH = resolve(ROOT, '.tmp/atlas/openspec-cohort-6527-members-v1.jsonl');
const CROSSWALK_PATH = resolve(ROOT, 'docs/reports/openspec-cohort-6527-crosswalk-v1.json');
const REPORT_PATH = resolve(ROOT, 'docs/reports/openspec-cohort-6527-current-source-audit-v1.json');
const CURRENT_BINDINGS_PATH = resolve(ROOT, '.tmp/atlas/openspec-cohort-6527-current-source-bindings-v1.jsonl');
const BINDINGS_REPORT_PATH = resolve(ROOT, 'docs/reports/openspec-cohort-6527-current-source-bindings-v1.json');

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function fail(status, message) {
  const report = {
    schema: 'atlas.openspec-cohort-6527-current-source-audit.v1',
    status,
    canonicalAuthority: false,
    databaseAccessed: false,
    message,
    generatedAt: new Date().toISOString()
  };
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.error(`${status}: ${message}`);
  process.exitCode = 1;
}

if (!existsSync(MEMBERS_PATH) || !existsSync(CROSSWALK_PATH)) {
  fail('BLOCKED_FIXTURE_MISSING', 'Expected cohort members and crosswalk report are required.');
} else {
  const membersBytes = readFileSync(MEMBERS_PATH);
  const crosswalkBytes = readFileSync(CROSSWALK_PATH);
  const expectedCrosswalk = JSON.parse(crosswalkBytes.toString('utf8'));
  const expectedMembers = expectedCrosswalk.membersArtifact;
  if (!expectedMembers || expectedMembers.rowCount !== 6527 || expectedMembers.sha256 !== sha256(membersBytes)) {
    fail('BLOCKED_CROSSWALK_ARTIFACT_MISMATCH', 'Members artifact does not match the hash and count pinned by the crosswalk report.');
  } else {
    const members = membersBytes.toString('utf8').split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));
    const cache = new Map();
    const taskHashIndexes = new Map();
    const counts = {
      total: members.length,
      exactSourceContent: 0,
      staleLocatorExactContentFound: 0,
      statusOnlyDrift: 0,
      sourceContentMismatch: 0,
      missingSourceFile: 0,
      lineOutOfRange: 0,
      sourceLineNotTask: 0,
      duplicateTaskKeys: 0
    };
    const examples = [];
    const seenKeys = new Set();
    const currentBindings = [];
    const addExample = (value) => {
      const cap = value.issue === 'TASK_BLOCK_HASH_MISMATCH' ? 20 : 40;
      if (examples.filter((item) => item.issue === value.issue).length < cap) examples.push(value);
    };

    for (const member of members) {
      const key = member.canonical_task_key;
      if (seenKeys.has(key)) counts.duplicateTaskKeys++;
      seenKeys.add(key);

      const ref = String(member.source_ref ?? '').match(/^(.*)#L(\d+)$/);
      if (!ref) {
        counts.sourceLineNotTask++;
        addExample({ taskKey: key, sourceRef: member.source_ref, issue: 'INVALID_SOURCE_REF' });
        continue;
      }
      const [, relPath, lineText] = ref;
      let lines = cache.get(relPath);
      if (!lines) {
        const absPath = resolve(ROOT, relPath);
        if (!existsSync(absPath)) {
          counts.missingSourceFile++;
          addExample({ taskKey: key, sourceRef: member.source_ref, issue: 'SOURCE_FILE_MISSING' });
          cache.set(relPath, null);
          continue;
        }
        lines = readFileSync(absPath, 'utf8').split(/\r?\n/);
        cache.set(relPath, lines);
      }
      if (!lines) continue;

      const lineNumber = Number(lineText);
      if (!Number.isInteger(lineNumber) || lineNumber < 1 || lineNumber > lines.length) {
        counts.lineOutOfRange++;
        addExample({ taskKey: key, sourceRef: member.source_ref, issue: 'LINE_OUT_OF_RANGE' });
        continue;
      }

      const sourceLine = lines[lineNumber - 1] ?? '';
      let hashIndex = taskHashIndexes.get(relPath);
      if (!hashIndex) {
        hashIndex = new Map();
        for (let i = 0; i < lines.length; i++) {
          if (/^\s*[-*]\s*\[[ xX~]\]/.test(lines[i])) {
            const hash = blockHash(taskBlock(lines, i));
            const locations = hashIndex.get(hash) ?? [];
            locations.push(i + 1);
            hashIndex.set(hash, locations);
          }
        }
        taskHashIndexes.set(relPath, hashIndex);
      }
      const originalHashLocations = hashIndex.get(member.source_claim_hash) ?? [];
      const recordCurrentBinding = (resolvedLine, matchKind) => {
        const resolvedTaskLine = lines[resolvedLine - 1] ?? '';
        const currentTaskHash = blockHash(taskBlock(lines, resolvedLine - 1));
        currentBindings.push({
          cohort_revision: member.cohort_revision,
          task_ordinal: member.task_ordinal,
          canonical_task_key: key,
          source_ref: `${relPath}#L${resolvedLine}`,
          previous_source_ref: member.source_ref,
          source_claim_hash: currentTaskHash,
          source_checkbox_state: resolvedTaskLine.match(/\[([ xX~])\]/)?.[1] ?? null,
          source_match: matchKind,
          canonical_authority: false,
          task_completion_authorized: false
        });
      };
      const reportMovedLocator = () => {
        counts.staleLocatorExactContentFound++;
        addExample({
          taskKey: key,
          sourceRef: member.source_ref,
          issue: 'SOURCE_LOCATOR_STALE_EXACT_CONTENT_FOUND',
          candidateSourceRefs: originalHashLocations.map((line) => `${relPath}#L${line}`)
        });
        if (originalHashLocations.length === 1) recordCurrentBinding(originalHashLocations[0], 'LOCATOR_RECOVERED');
      };
      if (!/^\s*[-*]\s*\[[ xX~]\]/.test(sourceLine)) {
        if (originalHashLocations.length === 1) {
          reportMovedLocator();
          continue;
        }
        counts.sourceLineNotTask++;
        addExample({ taskKey: key, sourceRef: member.source_ref, issue: originalHashLocations.length > 1 ? 'AMBIGUOUS_SOURCE_LOCATOR' : 'SOURCE_LINE_NOT_CHECKBOX', currentLine: sourceLine.slice(0, 180), candidateSourceRefs: originalHashLocations.map((line) => `${relPath}#L${line}`) });
        continue;
      }

      const actualHash = blockHash(taskBlock(lines, lineNumber - 1));
      if (actualHash === member.source_claim_hash) {
        counts.exactSourceContent++;
        recordCurrentBinding(lineNumber, 'EXACT');
      } else {
        if (originalHashLocations.length === 1) {
          reportMovedLocator();
          continue;
        }
        const expectedCheckbox = member.disk_checkbox_state === 'CHECKED' ? 'x' : ' ';
        const snapshotStateBlock = taskBlock(lines, lineNumber - 1).map((line, index) =>
          index === 0 ? line.replace(/^(\s*[-*]\s*\[)[ xX~](\])/, `$1${expectedCheckbox}$2`) : line
        );
        if (blockHash(snapshotStateBlock) === member.source_claim_hash) {
          counts.statusOnlyDrift++;
          addExample({
            taskKey: key,
            sourceRef: member.source_ref,
            issue: 'CHECKBOX_STATE_DRIFT',
            snapshotCheckboxState: member.disk_checkbox_state,
            currentCheckboxState: sourceLine.match(/\[[ xX~]\]/)?.[0] ?? null,
            sourceClaimHash: member.source_claim_hash,
            currentTaskBlockHash: actualHash
          });
          recordCurrentBinding(lineNumber, 'CHECKBOX_STATE_UPDATED');
          continue;
        }
        counts.sourceContentMismatch++;
        addExample({
          taskKey: key,
          sourceRef: member.source_ref,
          issue: 'TASK_CONTENT_HASH_MISMATCH',
          sourceClaimHash: member.source_claim_hash,
          currentTaskBlockHash: actualHash
        });
      }
    }

    const passed = counts.total === 6527 && counts.exactSourceContent + counts.staleLocatorExactContentFound + counts.statusOnlyDrift === 6527 &&
      counts.duplicateTaskKeys === 0 && counts.missingSourceFile === 0 &&
      counts.lineOutOfRange === 0 && counts.sourceLineNotTask === 0 && counts.sourceContentMismatch === 0 && counts.statusOnlyDrift === 0;
    const report = {
      schema: 'atlas.openspec-cohort-6527-current-source-audit.v1',
      status: passed ? 'PASS_CURRENT_SOURCE_BINDINGS' : counts.sourceContentMismatch === 0 && counts.statusOnlyDrift > 0
        ? 'FAIL_SOURCE_STATUS_SNAPSHOT_STALE'
        : 'FAIL_SOURCE_COHORT_STALE_OR_INVALID',
      canonicalAuthority: false,
      databaseAccessed: false,
      cohortRevision: expectedCrosswalk.cohortRevision,
      crosswalkReportSha256: sha256(crosswalkBytes),
      membersArtifactSha256: sha256(membersBytes),
      summary: counts,
      examples,
      generatedAt: new Date().toISOString()
    };
    if (currentBindings.length === members.length && counts.sourceContentMismatch === 0 && counts.sourceLineNotTask === 0 && counts.lineOutOfRange === 0 && counts.missingSourceFile === 0 && counts.duplicateTaskKeys === 0) {
      const bindingsBody = currentBindings.map((binding) => JSON.stringify(binding)).join('\n') + '\n';
      const bindingsSha256 = sha256(bindingsBody);
      const sourceBindingRevision = `sha256:${bindingsSha256}`;
      mkdirSync(dirname(CURRENT_BINDINGS_PATH), { recursive: true });
      writeFileSync(CURRENT_BINDINGS_PATH, bindingsBody, 'utf8');
      const bindingsReadbackBytes = readFileSync(CURRENT_BINDINGS_PATH);
      const bindingsReadback = bindingsReadbackBytes.toString('utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line));
      const originalByOrdinal = new Map(members.map((member) => [member.task_ordinal, member]));
      const uniqueBindingKeys = new Set(bindingsReadback.map((binding) => binding.canonical_task_key));
      const bindingReadbackVerified = sha256(bindingsReadbackBytes) === bindingsSha256 &&
        bindingsReadback.length === members.length && uniqueBindingKeys.size === members.length &&
        bindingsReadback.every((binding) => {
          const original = originalByOrdinal.get(binding.task_ordinal);
          const source = String(binding.source_ref).match(/^(.*)#L(\d+)$/);
          if (!original || original.canonical_task_key !== binding.canonical_task_key || !source) return false;
          const lines = cache.get(source[1]);
          const index = Number(source[2]) - 1;
          if (!lines || index < 0 || index >= lines.length) return false;
          return blockHash(taskBlock(lines, index)) === binding.source_claim_hash &&
            (lines[index].match(/\[([ xX~])\]/)?.[1] ?? null) === binding.source_checkbox_state;
        });
      const bindingReport = {
        schema: 'atlas.openspec-cohort-6527-current-source-bindings.v1',
        status: bindingReadbackVerified ? 'PASS_CURRENT_SOURCE_BINDING' : 'FAIL_CURRENT_SOURCE_BINDING_READBACK',
        canonicalAuthority: false,
        taskCompletionAuthorized: false,
        databaseAccessed: false,
        cohortRevision: expectedCrosswalk.cohortRevision,
        sourceBindingRevision,
        sourceBindings: {
          path: '.tmp/atlas/openspec-cohort-6527-current-source-bindings-v1.jsonl',
          rowCount: currentBindings.length,
          sha256: bindingsSha256
        },
        sourceMatchCounts: currentBindings.reduce((acc, binding) => {
          acc[binding.source_match] = (acc[binding.source_match] ?? 0) + 1;
          return acc;
        }, {}),
        staleCheckboxStateRows: counts.statusOnlyDrift,
        priorLocatorRecoveries: counts.staleLocatorExactContentFound,
        readbackVerified: bindingReadbackVerified,
        uniqueTaskKeys: uniqueBindingKeys.size,
        generatedAt: new Date().toISOString()
      };
      mkdirSync(dirname(BINDINGS_REPORT_PATH), { recursive: true });
      writeFileSync(BINDINGS_REPORT_PATH, `${JSON.stringify(bindingReport, null, 2)}\n`, 'utf8');
      if (bindingReadbackVerified) {
        report.currentSourceBindingsReport = 'docs/reports/openspec-cohort-6527-current-source-bindings-v1.json';
        report.currentSourceBindingsRevision = sourceBindingRevision;
      }
    }
    mkdirSync(dirname(REPORT_PATH), { recursive: true });
    writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ status: report.status, cohortRevision: report.cohortRevision, summary: report.summary, reportPath: 'docs/reports/openspec-cohort-6527-current-source-audit-v1.json' }, null, 2));
    if (!passed) process.exitCode = 1;
  }
}
