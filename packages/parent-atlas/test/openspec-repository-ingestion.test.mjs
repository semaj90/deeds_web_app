import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { ingestOpenSpecRepository } from '../dist/core/openspec-repository-ingestion.js';

test('OpenSpec repository ingestion traverses main/delta/tasks with content revisions and no DB writes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'atlas-openspec-'));
  try {
    await mkdir(path.join(root, 'openspec/specs/auth'), { recursive: true });
    await mkdir(path.join(root, 'openspec/changes/auth-hardening/specs/auth'), { recursive: true });
    await mkdir(path.join(root, 'openspec/changes/auth-hardening'), { recursive: true });

    await writeFile(path.join(root, 'openspec/specs/auth/spec.md'), [
      '# Auth',
      '',
      '### Requirement: Owner authorization',
      'The system SHALL verify ownership.',
      '',
      '#### Scenario: Non-owner denied',
      '- **WHEN** another user requests the case',
      '- **THEN** access is denied',
      '',
    ].join('\n'));

    await writeFile(path.join(root, 'openspec/changes/auth-hardening/specs/auth/spec.md'), [
      '## MODIFIED Requirements',
      '',
      '### Requirement: Owner authorization',
      '#### Scenario: Missing owner rejected',
      '- **WHEN** ownership is absent',
      '- **THEN** access is denied',
      '',
    ].join('\n'));

    await writeFile(path.join(root, 'openspec/changes/auth-hardening/tasks.md'), [
      '# Tasks',
      '- [ ] FI-16A Wire owner guard',
      '- [x] 1.2 Add denial fixture',
      '',
    ].join('\n'));

    const result = await ingestOpenSpecRepository({
      repo_root: root,
      workspace_revision: 'workspace-r742',
      openspec_roots: ['openspec'],
      producer_revision: 'openspec-ingest-r1',
      fail_on_document_error: true,
    });

    assert.equal(result.receipt.document_count, 3);
    assert.equal(result.receipt.requirement_count, 2);
    assert.equal(result.receipt.scenario_count, 2);
    assert.equal(result.receipt.task_count, 2);
    assert.equal(result.receipt.failed_count, 0);
    assert.equal(result.receipt.database_write_performed, false);
    assert.ok(result.documents.every((document) => document.source_revision.startsWith('content:')));
    assert.ok(result.documents.every((document) => document.workspace_revision === 'workspace-r742'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('identical OpenSpec bytes retain identical document revision across workspace revisions', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'atlas-openspec-replay-'));
  try {
    await mkdir(path.join(root, 'openspec/specs/cache'), { recursive: true });
    await writeFile(path.join(root, 'openspec/specs/cache/spec.md'), [
      '### Requirement: Stable evidence',
      'The system SHALL retain revision identity.',
      '#### Scenario: Replay',
      '- **WHEN** bytes do not change',
      '- **THEN** document revision stays stable',
    ].join('\n'));

    const first = await ingestOpenSpecRepository({ repo_root: root, workspace_revision: 'ws-1', producer_revision: 'openspec-ingest-r1' });
    const second = await ingestOpenSpecRepository({ repo_root: root, workspace_revision: 'ws-2', producer_revision: 'openspec-ingest-r1' });

    assert.equal(first.documents[0].source_revision, second.documents[0].source_revision);
    assert.notEqual(first.documents[0].workspace_revision, second.documents[0].workspace_revision);
    assert.equal(first.documents[0].payload.requirements[0].requirement_id, second.documents[0].payload.requirements[0].requirement_id);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
