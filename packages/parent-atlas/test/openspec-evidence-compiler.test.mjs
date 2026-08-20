import test from 'node:test';
import assert from 'node:assert/strict';

import { compileOpenSpecEvidence } from '../dist/core/openspec-evidence-compiler.js';
import { extractOpenSpecEvidenceEntities } from '../dist/core/evidence-entity-extractors.js';

test('main spec compiler creates deterministic requirement/scenario IDs', () => {
  const markdown = `# Auth\n\n## Requirements\n\n### Requirement: Owner authorization\nThe system SHALL enforce ownership.\n\n#### Scenario: Owner may edit\n- **WHEN** owner edits\n- **THEN** allow\n`;
  const first = compileOpenSpecEvidence({
    source_ref: 'openspec/specs/auth/spec.md',
    source_revision: 'spec-r1',
    markdown,
    producer_revision: 'openspec-parser-r1',
  });
  const second = compileOpenSpecEvidence({
    source_ref: 'openspec/specs/auth/spec.md',
    source_revision: 'spec-r1',
    markdown,
    producer_revision: 'openspec-parser-r1',
  });

  assert.equal(first.receipt.output_checksum, second.receipt.output_checksum);
  assert.equal(first.payload.requirements[0].requirement_id, 'openspec:req:auth:owner-authorization');
  assert.equal(first.payload.scenarios[0].requirement_id, first.payload.requirements[0].requirement_id);
  assert.equal(first.receipt.canonical_identity_owner, 'openspec_parser');
});

test('delta rename produces explicit old-to-new requirement alias', () => {
  const result = compileOpenSpecEvidence({
    source_ref: 'openspec/changes/auth-rework/specs/auth/spec.md',
    source_revision: 'delta-r1',
    producer_revision: 'openspec-parser-r1',
    markdown: `## RENAMED Requirements\n\n- FROM: \`### Requirement: Owner authorization\`\n- TO: \`### Requirement: Resource ownership authorization\`\n`,
  });

  assert.equal(result.receipt.rename_count, 1);
  assert.equal(result.receipt.renames[0].from_requirement_id, 'openspec:req:auth:owner-authorization');
  assert.equal(result.receipt.renames[0].to_requirement_id, 'openspec:req:auth:resource-ownership-authorization');
});

test('tasks compiler accepts FI-style stable task keys and rejects unkeyed prose from canonical output', () => {
  const result = compileOpenSpecEvidence({
    source_ref: 'openspec/changes/atlas-feature-intelligence/tasks.md',
    source_revision: 'tasks-r1',
    producer_revision: 'openspec-parser-r1',
    markdown: `- [x] FI-16A Add relationship semantics\n- [ ] FI-16J Add dynamic hyperedges\n- [ ] this line has no stable task key\n`,
  });

  assert.equal(result.payload.tasks.length, 2);
  assert.equal(result.payload.tasks[0].task_id, 'openspec:task:atlas-feature-intelligence:fi-16a');
  assert.equal(result.payload.tasks[1].task_id, 'openspec:task:atlas-feature-intelligence:fi-16j');
});

test('compiled OpenSpec IDs can flow directly into evidence entity facts', () => {
  const compiled = compileOpenSpecEvidence({
    source_ref: 'openspec/specs/auth/spec.md',
    source_revision: 'spec-r2',
    producer_revision: 'openspec-parser-r1',
    markdown: `### Requirement: Owner authorization\n#### Scenario: Owner may edit\n`,
  });
  const facts = extractOpenSpecEvidenceEntities({
    evidence_id: 'evidence:openspec-auth-r2',
    evidence_kind: 'openspec',
    source_ref: 'openspec/specs/auth/spec.md',
    source_revision: 'spec-r2',
    evidence_revision: 'evidence-r2',
    workspace_revision: 'ws-742',
    payload: compiled.payload,
  }, 'openspec-entity-extractor-r1');

  assert.equal(facts.some((item) => item.entity_type === 'requirement'), true);
  assert.equal(facts.some((item) => item.entity_type === 'scenario'), true);
});
