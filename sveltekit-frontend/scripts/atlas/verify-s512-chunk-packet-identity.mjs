/**
 * Verify the S512 read-only identity census and its immutable link manifest.
 * This is a local receipt verifier: it never contacts or mutates a store.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const REPORT_DIR = path.resolve(process.env.S512_IDENTITY_REPORT_DIR ?? path.join(ROOT, 'docs', 'reports'));
const JSON_PATH = path.join(REPORT_DIR, 's512-chunk-packet-identity-audit.json');
const MANIFEST_PATH = path.join(REPORT_DIR, 's512-chunk-packet-identity-links.jsonl');
const OUTPUT_PATH = path.join(REPORT_DIR, 's512-chunk-packet-identity-verification.json');

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function countBy(rows, key) {
  return Object.fromEntries([...new Set(rows.map((row) => row[key]))].sort().map((value) => [
    value,
    rows.filter((row) => row[key] === value).length,
  ]));
}

function fail(checks, name, detail) {
  checks.push({ name, ok: false, detail });
}

function pass(checks, name, detail) {
  checks.push({ name, ok: true, detail });
}

async function main() {
  const report = JSON.parse(await readFile(JSON_PATH, 'utf8'));
  const manifestText = await readFile(MANIFEST_PATH, 'utf8');
  const rows = manifestText.trim() ? manifestText.trimEnd().split('\n').map((line) => JSON.parse(line)) : [];
  const checks = [];

  report.status === 'READ_ONLY_CENSUS_COMPLETE'
    ? pass(checks, 'census_complete', report.status)
    : fail(checks, 'census_complete', report.status);
  report.readOnly === true && report.canonicalPacketMinted === false && report.canonicalWritesAllowed === false
    && report.postgresWritesAttempted === false && report.qdrantWritesAttempted === false
    ? pass(checks, 'mutation_guards', 'all write and mint guards are false')
    : fail(checks, 'mutation_guards', 'a write or mint guard is not false');
  report.manifestSha256 === sha256(manifestText)
    ? pass(checks, 'manifest_checksum', report.manifestSha256)
    : fail(checks, 'manifest_checksum', 'manifest checksum mismatch');
  report.pointCount === rows.length
    ? pass(checks, 'point_count', String(rows.length))
    : fail(checks, 'point_count', `${report.pointCount} != ${rows.length}`);

  const duplicatePointIds = rows.map((row) => row.qdrantPointId).filter((id, index, all) => all.indexOf(id) !== index);
  duplicatePointIds.length === 0
    ? pass(checks, 'unique_qdrant_point_ids', String(rows.length))
    : fail(checks, 'unique_qdrant_point_ids', [...new Set(duplicatePointIds)].join(','));

  const invalidAdmitted = rows.filter((row) => row.admission === 'ADMITTED' && (
    row.confidence !== 'EXACT'
    || !['EXACT_CANONICAL_ID', 'EXACT_QDRANT_POINT_LINK', 'EXACT_SOURCE_SPAN'].includes(row.matchMethod)
    || !row.canonicalPacketKey
    || row.canonicalPacketMinted !== false
    || row.canonicalWritesAllowed !== false
  ));
  invalidAdmitted.length === 0
    ? pass(checks, 'admitted_links_are_exact_and_existing', String(rows.filter((row) => row.admission === 'ADMITTED').length))
    : fail(checks, 'admitted_links_are_exact_and_existing', `${invalidAdmitted.length} invalid admitted rows`);

  const invalidQuarantine = rows.filter((row) => row.admission === 'QUARANTINED' && row.confidence === 'EXACT');
  invalidQuarantine.length === 0
    ? pass(checks, 'quarantine_has_no_exact_rows', 'ok')
    : fail(checks, 'quarantine_has_no_exact_rows', `${invalidQuarantine.length} exact rows quarantined`);

  const countsMatch = JSON.stringify(report.admissionCounts) === JSON.stringify(countBy(rows, 'admission'))
    && JSON.stringify(report.confidenceCounts) === JSON.stringify(countBy(rows, 'confidence'))
    && JSON.stringify(report.matchMethodCounts) === JSON.stringify(countBy(rows, 'matchMethod'))
    && JSON.stringify(report.firstLossCounts) === JSON.stringify(countBy(rows, 'firstLoss'));
  countsMatch
    ? pass(checks, 'receipt_counts', 'all manifest counters match')
    : fail(checks, 'receipt_counts', 'manifest counters differ from report');

  const admitted = rows.filter((row) => row.admission === 'ADMITTED');
  const exactPointLinks = admitted.filter((row) => row.matchMethod === 'EXACT_QDRANT_POINT_LINK').length;
  const status = checks.every((check) => check.ok) && exactPointLinks > 0
    ? 'S512_ID3_EXISTING_PACKET_LINKAGE_VERIFIED'
    : checks.every((check) => check.ok)
      ? 'S512_ID3_NO_EXACT_LINKS_FOUND'
      : 'S512_ID3_VERIFICATION_BLOCKED';
  const receipt = {
    schema: 'atlas.s512-chunk-packet-identity-verification.v1',
    generatedAt: new Date().toISOString(),
    sourceReport: JSON_PATH,
    sourceManifest: MANIFEST_PATH,
    status,
    pointCount: rows.length,
    admittedCount: admitted.length,
    exactQdrantPointLinkCount: exactPointLinks,
    quarantinedCount: rows.filter((row) => row.admission === 'QUARANTINED').length,
    readOnly: true,
    canonicalPacketMinted: false,
    canonicalWritesAllowed: false,
    checks,
    manifestSha256: sha256(manifestText),
  };
  await writeFile(OUTPUT_PATH, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(receipt, null, 2));
  if (status === 'S512_ID3_VERIFICATION_BLOCKED') process.exitCode = 4;
}

await main();
