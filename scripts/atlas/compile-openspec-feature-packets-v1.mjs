import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CARDS_PATH = path.join(ROOT, 'docs', 'reports', 'openspec-evidence-cards-v1.json');
const OUTPUT_PATH = process.env.OPENSPEC_FEATURE_PACKETS_OUTPUT
  ? path.resolve(ROOT, process.env.OPENSPEC_FEATURE_PACKETS_OUTPUT)
  : path.join(ROOT, 'docs', 'reports', 'openspec-evidence-feature-packets-v1.json');

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function checksum(value) {
  return `sha256:${crypto.createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

function relative(filePath) {
  return path.relative(ROOT, filePath).replaceAll('\\', '/');
}

function countBy(values) {
  return Object.fromEntries([...new Set(values)].sort().map((value) => [value, values.filter((item) => item === value).length]));
}

export function compileOpenSpecFeaturePacketsV1(cardsReport) {
  if (cardsReport?.schema !== 'atlas.openspec-evidence-cards.v1') throw new Error('CARDS_SCHEMA_UNSUPPORTED');
  const groups = new Map();
  for (const card of cardsReport.cards ?? []) {
    const identity = card.taskIdentity ?? {};
    const authorityScope = identity.authorityScope ?? 'openspec://unknown';
    const featureId = `openspec-feature:${authorityScope}/${identity.changeId ?? 'unknown'}`;
    const group = groups.get(featureId) ?? {
      featureId,
      authorityScope,
      changeId: identity.changeId ?? null,
      archived: identity.archived === true,
      taskRefs: [],
      cardChecksums: [],
      proofStates: [],
      receiptRefs: new Set(),
      blockerRefs: new Set(),
      dependencyRefs: new Set(),
      sourceRefs: new Set(),
    };
    group.archived = group.archived || identity.archived === true;
    group.taskRefs.push(identity.taskRef);
    group.cardChecksums.push(card.checksum);
    group.proofStates.push(card.proofState);
    for (const receiptRef of card.receiptRefs ?? []) group.receiptRefs.add(receiptRef);
    for (const blocker of card.blockers ?? []) group.blockerRefs.add(blocker.reference ?? blocker.type ?? blocker.status ?? 'BLOCKER');
    for (const dependency of card.dependencyRefs ?? []) group.dependencyRefs.add(dependency.taskRef ?? dependency.reference ?? 'DEPENDENCY');
    for (const sourceRef of card.sourceRefs ?? []) group.sourceRefs.add(sourceRef);
    groups.set(featureId, group);
  }
  const packets = [...groups.values()].sort((left, right) => left.featureId.localeCompare(right.featureId)).map((group) => {
    const unsigned = {
      schema: 'atlas.openspec-feature-packet.v1',
      packetId: checksum(`${group.featureId}\0${cardsReport.source?.workspaceRevision ?? ''}`),
      featureId: group.featureId,
      authorityScope: group.authorityScope,
      changeId: group.changeId,
      archived: group.archived,
      workspaceRevision: cardsReport.source?.workspaceRevision ?? null,
      taskRefs: [...new Set(group.taskRefs)].sort(),
      cardChecksums: [...new Set(group.cardChecksums)].sort(),
      proofStateCounts: countBy(group.proofStates),
      receiptRefs: [...group.receiptRefs].sort().slice(0, 256),
      blockerRefs: [...group.blockerRefs].sort().slice(0, 128),
      dependencyRefs: [...group.dependencyRefs].sort().slice(0, 256),
      sourceRefs: [...group.sourceRefs].sort().slice(0, 256),
      rawDocumentsInjected: false,
      proofAuthority: 'RECEIPT_ONLY',
      retrievalUsable: true,
    };
    return { ...unsigned, checksum: checksum(unsigned) };
  });
  const unsigned = {
    schema: 'atlas.openspec-feature-packets.v1',
    mode: 'READ_ONLY_COMPACT_FEATURE_PROJECTION',
    source: {
      cards: relative(CARDS_PATH),
      workspaceRevision: cardsReport.source?.workspaceRevision ?? null,
      canonicalAuthority: false,
    },
    summary: {
      packetCount: packets.length,
      taskCount: packets.reduce((total, packet) => total + packet.taskRefs.length, 0),
      proofEligibleTaskCount: packets.reduce((total, packet) => total + (packet.proofStateCounts.PROVEN ?? 0), 0),
      rawDocumentsInjected: false,
      persistentStoreWrites: false,
    },
    packets,
    invariants: [
      'FeaturePackets group immutable EvidenceCard identities by change and authority scope.',
      'FeaturePackets contain bounded references and aggregates, not raw Markdown or receipt payloads.',
      'Cards and receipts remain revision-bound and PostgreSQL remains the future canonical authority.',
    ],
    likely_cause: 'ACE and retrieval need a compact feature-level projection without injecting complete task files or reports.',
    evidence: [relative(CARDS_PATH)],
    patch_targets: ['scripts/atlas/compile-openspec-feature-packets-v1.mjs', 'scripts/atlas/compile-openspec-evidence-cards-v1.mjs'],
    safe_next_command: 'node scripts/atlas/compile-openspec-feature-packets-v1.mjs',
    smoke_command: 'node --check scripts/atlas/compile-openspec-feature-packets-v1.mjs',
    report_path: relative(OUTPUT_PATH),
  };
  return { ...unsigned, checksum: checksum(unsigned) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const cardsReport = JSON.parse(fs.readFileSync(CARDS_PATH, 'utf8'));
  const report = compileOpenSpecFeaturePacketsV1(cardsReport);
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ schema: report.schema, summary: report.summary, checksum: report.checksum, output: OUTPUT_PATH }, null, 2));
}
