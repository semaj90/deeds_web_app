#!/usr/bin/env node
/**
 * Read-only reconciliation of legacy packet namespaces for classifier rows.
 * UUIDv5 groups are lookup keys only; no packet identity is promoted here.
 */
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './connection-config.mjs';

const admissionPath = path.resolve(REPO_ROOT, process.argv[2] ?? 'docs/reports/domain-classifier-cohort-admission-v1.json');
const reportPath = path.resolve(REPO_ROOT, 'docs/reports/domain-packet-namespace-reconciliation-v1.json');
const admission = JSON.parse(fs.readFileSync(admissionPath, 'utf8'));
if (admission.schema !== 'atlas.domain-classifier-cohort-admission.v1') throw new Error('ADMISSION_REPORT_SCHEMA_INVALID');

const groups = new Map();
for (const row of admission.observations ?? []) {
  const key = row.packetIndexUuidV5;
  const group = groups.get(key) ?? {
    packetIndexUuidV5: key,
    sourceRefs: [],
    packetCandidates: [],
    statuses: [],
  };
  group.sourceRefs.push(row.sourceRef);
  group.statuses.push(row.status);
  group.packetCandidates.push(...(row.packetCandidates ?? []));
  groups.set(key, group);
}

const reconciled = [...groups.values()].map((group) => {
  const packets = [...new Map(group.packetCandidates.map((packet) => [packet.packetKey, packet])).values()];
  const namespaces = [...new Set(packets.map((packet) => packet.packetKey.split(':')[0]))];
  const qualified = packets.filter((packet) => packet.sourceRevision && packet.contentHash && packet.workspaceRevisionKey);
  const status = packets.length === 0
    ? 'PACKET_MISSING'
    : qualified.length === 0 && packets.length > 1
      ? 'DUPLICATE_NAMESPACES_UNQUALIFIED'
      : qualified.length > 1
        ? 'QUALIFIED_IDENTITY_CONFLICT'
        : qualified.length === 1
          ? 'ONE_QUALIFIED_CANDIDATE'
          : 'SINGLE_UNQUALIFIED_CANDIDATE';
  return {
    packetIndexUuidV5: group.packetIndexUuidV5,
    sourceRefs: [...new Set(group.sourceRefs)].sort(),
    namespaces: namespaces.sort(),
    packetCandidates: packets,
    sourceStatuses: [...new Set(group.statuses)].sort(),
    status,
    canonicalPromotionEligible: status === 'ONE_QUALIFIED_CANDIDATE',
  };
});

const counts = reconciled.reduce((result, row) => {
  result[row.status] = (result[row.status] ?? 0) + 1;
  return result;
}, {});
const report = {
  schema: 'atlas.domain-packet-namespace-reconciliation.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  writesPerformed: false,
  admissionReport: path.relative(REPO_ROOT, admissionPath).replaceAll('\\', '/'),
  identityIndex: admission.identityIndex ?? null,
  counts,
  promotionEligibleGroups: reconciled.filter((row) => row.canonicalPromotionEligible).length,
  groups: reconciled,
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ schema: report.schema, counts,
  promotionEligibleGroups: report.promotionEligibleGroups, writesPerformed: false,
  reportPath: path.relative(REPO_ROOT, reportPath) }, null, 2));
