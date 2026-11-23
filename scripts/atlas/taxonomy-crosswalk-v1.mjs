#!/usr/bin/env node
/**
 * TAXONOMY-CROSSWALK-01: Read-only 17-entry domain_taxonomy_v1 crosswalk & NES LUT ordinal builder.
 *
 * - Keeps 13 top-level groups and 4 child IDs distinct.
 * - Normalizes case-only matches only in the derived proposal (never mutates canonical records).
 * - Keeps legacy labels like `documentation`, `tool`, `agent`, `Other` as UNRESOLVED unless
 *   explicitly accepted by a reviewer mapping; never maps unknown labels to `Other`.
 * - Enforces conservation checks and immutable snapshot checksum before assigning NES LUT ordinals.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const FROZEN_DOMAIN_TAXONOMY_V1_ORDER = [
  // 13 top-level groups (explicit registry order)
  { domain_id: 'api', label: 'API Design & Integration', parent_domain_id: null },
  { domain_id: 'auth', label: 'Authentication & Authorization', parent_domain_id: null },
  { domain_id: 'cache', label: 'Caching', parent_domain_id: null },
  { domain_id: 'compiler', label: 'Compiler & Language Tooling', parent_domain_id: null },
  { domain_id: 'database', label: 'Database & Persistence', parent_domain_id: null },
  { domain_id: 'devops', label: 'DevOps & Infrastructure', parent_domain_id: null },
  { domain_id: 'error-handling', label: 'Error Handling & Recovery', parent_domain_id: null },
  { domain_id: 'frontend', label: 'Frontend & UI', parent_domain_id: null },
  { domain_id: 'gpu', label: 'GPU & CUDA Acceleration', parent_domain_id: null },
  { domain_id: 'graph', label: 'Graph & Topology', parent_domain_id: null },
  { domain_id: 'machine-learning', label: 'Machine Learning', parent_domain_id: null },
  { domain_id: 'retrieval', label: 'Information Retrieval', parent_domain_id: null },
  { domain_id: 'test', label: 'Testing', parent_domain_id: null },
  // 4 child IDs
  { domain_id: 'database.postgresql', label: 'PostgreSQL', parent_domain_id: 'database' },
  { domain_id: 'devops.env-config', label: 'Environment Configuration', parent_domain_id: 'devops' },
  { domain_id: 'devops.process-mgmt', label: 'Process Management', parent_domain_id: 'devops' },
  { domain_id: 'frontend.sveltekit', label: 'SvelteKit / Svelte', parent_domain_id: 'frontend' },
];

const RESERVED_UNRESOLVED_LEGACY = new Set(['documentation', 'tool', 'agent', 'other']);

export function sha256Json(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;
}

export function buildFrozenTaxonomySnapshotV1(rows = FROZEN_DOMAIN_TAXONOMY_V1_ORDER) {
  if (!Array.isArray(rows) || rows.length !== 17) {
    throw new Error(`TAXONOMY_SNAPSHOT_COUNT_INVALID:${Array.isArray(rows) ? rows.length : 0}`);
  }
  const topLevel = rows.filter((r) => !r.parent_domain_id);
  const children = rows.filter((r) => Boolean(r.parent_domain_id));
  if (topLevel.length !== 13 || children.length !== 4) {
    throw new Error(`TAXONOMY_HIERARCHY_INVALID:${topLevel.length}/${children.length}`);
  }

  // Preserve explicit registry order; never sort alphabetically
  const snapshotEntries = rows.map((row, ordinal) => ({
    ordinal,
    nesHex: `0x${ordinal.toString(16).padStart(2, '0')}`,
    domainId: String(row.domain_id),
    label: String(row.label ?? row.domain_id),
    parentDomainId: row.parent_domain_id ?? null,
    tier: row.parent_domain_id ? 'child' : 'top_level',
  }));

  const taxonomyRevision = sha256Json(
    snapshotEntries.map(({ ordinal, domainId, parentDomainId }) => ({
      ordinal,
      domainId,
      parentDomainId,
    })),
  );

  return {
    schema: 'atlas.domain-taxonomy-snapshot.v1',
    taxonomyRevision,
    totalCount: 17,
    topLevelCount: 13,
    childCount: 4,
    entries: snapshotEntries,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}

export function crosswalkLegacyLabelsV1({
  observedLabels,
  snapshot = buildFrozenTaxonomySnapshotV1(),
  expectedTaxonomyRevision = null,
  reviewerMappings = {},
}) {
  if (
    expectedTaxonomyRevision !== null &&
    expectedTaxonomyRevision !== snapshot.taxonomyRevision
  ) {
    return {
      schema: 'atlas.taxonomy-crosswalk.v1',
      status: 'REVISION_MISMATCH',
      failure: 'TAXONOMY_REVISION_MISMATCH',
      taxonomyRevision: snapshot.taxonomyRevision,
      expectedTaxonomyRevision,
      proposals: [],
      counts: { total: 0, exact: 0, caseOnly: 0, proposed: 0, unresolved: 0, ambiguous: 0 },
      conservationPassed: false,
      canonicalAuthority: false,
      writesPerformed: false,
    };
  }

  const exactSet = new Set(snapshot.entries.map((e) => e.domainId));
  const lowerToCanonical = new Map(snapshot.entries.map((e) => [e.domainId.toLowerCase(), e.domainId]));
  const ordinalByDomain = new Map(snapshot.entries.map((e) => [e.domainId, e.ordinal]));

  const counts = { total: 0, exact: 0, caseOnly: 0, proposed: 0, unresolved: 0, ambiguous: 0 };
  const proposals = [];

  for (const item of observedLabels ?? []) {
    const rawLabel = typeof item === 'string' ? item : String(item?.label ?? '');
    const trimmed = rawLabel.trim();
    const lowered = trimmed.toLowerCase();
    counts.total += 1;

    let status = 'UNRESOLVED';
    let targetDomainId = null;
    let candidates = [];

    if (exactSet.has(rawLabel)) {
      status = 'EXACT_MATCH';
      targetDomainId = rawLabel;
      counts.exact += 1;
    } else if (lowerToCanonical.has(lowered)) {
      status = 'CASE_ONLY';
      targetDomainId = lowerToCanonical.get(lowered);
      counts.caseOnly += 1;
    } else if (Object.prototype.hasOwnProperty.call(reviewerMappings, rawLabel)) {
      const mapped = reviewerMappings[rawLabel];
      if (Array.isArray(mapped)) {
        const valid = mapped.filter((m) => exactSet.has(m));
        if (valid.length > 1) {
          status = 'AMBIGUOUS';
          candidates = valid;
          counts.ambiguous += 1;
        } else if (valid.length === 1) {
          status = 'PROPOSED_MAPPING';
          targetDomainId = valid[0];
          counts.proposed += 1;
        } else {
          counts.unresolved += 1;
        }
      } else if (typeof mapped === 'string' && exactSet.has(mapped)) {
        status = 'PROPOSED_MAPPING';
        targetDomainId = mapped;
        counts.proposed += 1;
      } else {
        counts.unresolved += 1;
      }
    } else {
      // Never map unknown or reserved legacy labels (documentation, tool, agent, Other) to Other by default
      if (RESERVED_UNRESOLVED_LEGACY.has(lowered)) {
        status = 'UNRESOLVED';
      }
      counts.unresolved += 1;
    }

    proposals.push({
      originalLabel: rawLabel,
      normalizedLabel: status === 'CASE_ONLY' ? targetDomainId : null,
      status,
      targetDomainId,
      nesOrdinal: targetDomainId ? ordinalByDomain.get(targetDomainId) ?? null : null,
      candidates,
      sourceTable: typeof item === 'object' ? item?.sourceTable ?? null : null,
      rowId: typeof item === 'object' ? item?.rowId ?? null : null,
      evidence: typeof item === 'object' ? item?.evidence ?? [] : [],
      taxonomyRevision: snapshot.taxonomyRevision,
    });
  }

  const conserved =
    counts.exact + counts.caseOnly + counts.proposed + counts.unresolved + counts.ambiguous === counts.total;

  const receiptBody = {
    schema: 'atlas.taxonomy-crosswalk.v1',
    status: conserved ? 'CROSSWALK_VALIDATED' : 'CONSERVATION_FAILED',
    failure: conserved ? null : 'CONSERVATION_CHECK_FAILED',
    taxonomyRevision: snapshot.taxonomyRevision,
    topLevelCount: snapshot.topLevelCount,
    childCount: snapshot.childCount,
    counts,
    conservationPassed: conserved,
    proposals,
    canonicalAuthority: false,
    writesPerformed: false,
  };

  return {
    ...receiptBody,
    receiptChecksum: sha256Json(receiptBody),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const snapshot = buildFrozenTaxonomySnapshotV1();
  const sample = crosswalkLegacyLabelsV1({
    snapshot,
    observedLabels: [
      { label: 'frontend.sveltekit', sourceTable: 'domain_taxonomy_v1', rowId: '1' },
      { label: 'Database.PostgreSQL', sourceTable: 'legacy_packets', rowId: '2' },
      { label: 'documentation', sourceTable: 'legacy_packets', rowId: '3' },
      { label: 'tool', sourceTable: 'legacy_packets', rowId: '4' },
      { label: 'agent', sourceTable: 'legacy_packets', rowId: '5' },
      { label: 'Other', sourceTable: 'legacy_packets', rowId: '6' },
      { label: 'ui_or_api', sourceTable: 'legacy_packets', rowId: '7' },
    ],
    reviewerMappings: {
      ui_or_api: ['frontend', 'api'],
    },
  });
  const outPath = path.resolve(process.cwd(), 'docs/reports/taxonomy-crosswalk-v1.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(sample, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({ ...sample, reportPath: outPath }, null, 2));
}
