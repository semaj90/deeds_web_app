import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveFeatureIdentity,
  normalizeSection,
  normalizeSource,
  normalizeTitle,
} from './derive-feature-identity.mjs';

const SOURCE = '../MASTER-FEATURE-TODO-2026-05-20.md';

const SOURCE_REF_313 =
  'todo:C:\\Users\\james\\Videos\\deeds-web-app\\MASTER-FEATURE-TODO-2026-05-20.md#line:313';

const SOURCE_REF_314 =
  'todo:C:\\Users\\james\\Videos\\deeds-web-app\\MASTER-FEATURE-TODO-2026-05-20.md#line:314';

const SECTION = 'Phase 101A — Directory Analysis & Codebase Pruning';

const TODO_313 = {
  source: SOURCE,
  source_ref: SOURCE_REF_313,
  sourceRefs: [SOURCE_REF_313],

  section: SECTION,

  title:
    'Use directory-role analysis plus AST maps to separate missing features from redundant features.',

  description:
    'Use directory-role analysis plus AST maps to separate missing features from redundant features.',

  line_number: 313,
};

const TODO_314 = {
  source: SOURCE,
  source_ref: SOURCE_REF_314,
  sourceRefs: [SOURCE_REF_314],

  section: SECTION,

  title:
    'Keep pruning outputs compact and JSON-backed so the lane can be re-run deterministically.',

  description:
    'Keep pruning outputs compact and JSON-backed so the lane can be re-run deterministically.',

  line_number: 314,
};

test('normalizes source document independently of absolute path and line number', () => {
  assert.equal(normalizeSource(SOURCE_REF_313), 'todo:master-feature-todo-2026-05-20');

  assert.equal(
    normalizeSource('todo:C:\\another\\checkout\\MASTER-FEATURE-TODO-2026-05-20.md#line:999'),
    'todo:master-feature-todo-2026-05-20'
  );
});

test('normalizes numbered phase headings to stable phase identity', () => {
  assert.equal(
    normalizeSection('Phase 101A — Directory Analysis & Codebase Pruning'),
    'phase-101a'
  );

  assert.equal(normalizeSection('Phase 101A — Updated Human Description'), 'phase-101a');
});

test('normalizes title deterministically', () => {
  assert.equal(normalizeTitle('  Use   directory-role analysis.  '), 'use directory-role analysis');
});

test('different TODOs in same document get different feature identities', () => {
  const first = deriveFeatureIdentity(TODO_313);

  const second = deriveFeatureIdentity(TODO_314);

  assert.equal(first.sourceKey, second.sourceKey);

  assert.equal(first.sourceKey, 'todo:master-feature-todo-2026-05-20');

  assert.notEqual(first.featureId, second.featureId);

  assert.notEqual(first.featureKey, second.featureKey);

  assert.match(first.featureId, /^feature:todo:[0-9a-f]{24}$/);

  assert.match(second.featureId, /^feature:todo:[0-9a-f]{24}$/);
});

test('moving TODO from line 313 to 400 does not change featureId', () => {
  const original = deriveFeatureIdentity(TODO_313);

  const moved = deriveFeatureIdentity({
    ...TODO_313,

    source_ref:
      'todo:C:\\Users\\james\\Videos\\deeds-web-app\\MASTER-FEATURE-TODO-2026-05-20.md#line:400',

    sourceRefs: [
      'todo:C:\\Users\\james\\Videos\\deeds-web-app\\MASTER-FEATURE-TODO-2026-05-20.md#line:400',
    ],

    line_number: 400,
  });

  assert.equal(moved.featureId, original.featureId);

  assert.equal(moved.featureKey, original.featureKey);

  assert.equal(moved.sourceKey, original.sourceKey);

  // Provenance SHOULD change.
  assert.notEqual(moved.sourceRef, original.sourceRef);
});

test('material title change changes feature identity', () => {
  const original = deriveFeatureIdentity(TODO_313);

  const changed = deriveFeatureIdentity({
    ...TODO_313,

    title: 'Archive redundant directory features automatically.',

    description: 'Archive redundant directory features automatically.',
  });

  assert.notEqual(changed.featureId, original.featureId);

  assert.notEqual(changed.featureKey, original.featureKey);

  assert.equal(changed.sourceKey, original.sourceKey);
});

test('adding additional sourceRefs does not change canonical feature identity', () => {
  const original = deriveFeatureIdentity(TODO_313);

  const enriched = deriveFeatureIdentity({
    ...TODO_313,

    sourceRefs: [
      SOURCE_REF_313,

      'openspec:changes/feature-label-semantic-derivation/spec.md#requirement:stable-feature-identity',

      'code:scripts/atlas/lib/derive-feature-identity.mjs#symbol:deriveFeatureIdentity',
    ],
  });

  assert.equal(enriched.featureId, original.featureId);

  assert.equal(enriched.featureKey, original.featureKey);

  assert.equal(enriched.sourceKey, original.sourceKey);

  assert.equal(enriched.sourceRefs.length, 3);
});

test('feature identity does not depend on status or Kanban projection fields', () => {
  const original = deriveFeatureIdentity(TODO_313);

  const projected = deriveFeatureIdentity({
    ...TODO_313,

    status: 'done',

    task_id: 'kanban-123456789abc',

    packet_key: 'packet:temporary-runtime-value',

    score: 0.999,
  });

  assert.equal(projected.featureId, original.featureId);
});

test('known colliding TODO records produce unique identities', () => {
  const records = [
    {
      line: 313,
      title:
        'Use directory-role analysis plus AST maps to separate missing features from redundant features.',
      section: 'Phase 101A — Directory Analysis & Codebase Pruning',
    },
    {
      line: 314,
      title:
        'Keep pruning outputs compact and JSON-backed so the lane can be re-run deterministically.',
      section: 'Phase 101A — Directory Analysis & Codebase Pruning',
    },
    {
      line: 315,
      title:
        'Rebuild the parent atlas from the production-ready feature list after archive decisions land.',
      section: 'Phase 101A — Directory Analysis & Codebase Pruning',
    },
    {
      line: 316,
      title: 'Keep the pruning lane offline-only; it should not become a startup dependency.',
      section: 'Phase 101A — Directory Analysis & Codebase Pruning',
    },
    {
      line: 317,
      title:
        'Audit PostgreSQL 17.6 vs 18 table/index drift and use the result to label canonical production tables vs experimental / archive-only tables.',
      section: 'Phase 101A — Directory Analysis & Codebase Pruning',
    },
    {
      line: 318,
      title:
        'Keep research_summaries as the live canonical research table and finish the additive provenance/index migration before any dump/restore promotion to Postgres 18.',
      section: 'Phase 101A — Directory Analysis & Codebase Pruning',
    },
    {
      line: 319,
      title:
        'Use the repo consolidation feature map to label ship-path, planned production, experimental, and archive-only files before trimming the repo to source, schemas, scripts, and docs.',
      section: 'Phase 101A — Directory Analysis & Codebase Pruning',
    },
    {
      line: 354,
      title: 'Warm Redis / Bitfrost caches from sourceRef-backed ClusterCards and hot atlas joins.',
      section: 'NES/Glyph Architecture Notes (SourceRef-First Atlas Join & Cards)',
    },
    {
      line: 355,
      title:
        'Expand Neo4j context trees from KAG / DAG hits so multi-hop traversals can reuse the same sourceRef spine.',
      section: 'NES/Glyph Architecture Notes (SourceRef-First Atlas Join & Cards)',
    },
    {
      line: 381,
      title:
        'Formalize the later compute lanes for PyTorch XGBoost reranking, SOM clustering collection, and Neo4j hypergraph merges against the same sourceRef + feature_id spine.',
      section: 'NES/Glyph Architecture Notes (SourceRef-First Atlas Join & Cards)',
    },
  ];

  const identities = records.map(({ line, title, section }) =>
    deriveFeatureIdentity({
      source: SOURCE,

      source_ref: `todo:C:\\Users\\james\\Videos\\deeds-web-app\\MASTER-FEATURE-TODO-2026-05-20.md#line:${line}`,

      section,
      title,
      line_number: line,
    })
  );

  const sourceKeys = new Set(identities.map((identity) => identity.sourceKey));

  const featureIds = new Set(identities.map((identity) => identity.featureId));

  const featureKeys = new Set(identities.map((identity) => identity.featureKey));

  // All ten originate from the same source document.
  assert.equal(sourceKeys.size, 1);

  // All ten are logically distinct features.
  assert.equal(featureIds.size, records.length);

  assert.equal(featureKeys.size, records.length);
});
