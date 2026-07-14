#!/usr/bin/env node
/**
 * Smoke test for Qdrant code chunk filtering.
 *
 * Verifies that the filter accepts only canonical code/chunk payloads and
 * rejects synthetic directory clusters, summary-only records, and records
 * missing source_ref or feature_id.
 */

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const COLLECTION = process.env.QDRANT_COLLECTION || 'codebase_chunks_768';
const SAMPLE_LIMIT = Number(process.env.QDRANT_SMOKE_SAMPLE_LIMIT || 250);
const TARGET_ACCEPTED = Number(process.env.QDRANT_SMOKE_ACCEPTED_TARGET || 20);
const MAX_SCANNED = Number(process.env.QDRANT_SMOKE_MAX_SCANNED || 1500);

const ALLOWED_KINDS = new Set(['text', 'large-text', 'json-array']);
const BLOCKED_KINDS = new Set([
  'directory-cluster',
  'test-artifact',
  'memory-run',
  'summary-only',
  'summary-only-synthetic',
  'generated-summary',
]);
const TURN_MARKERS = /<start_of_turn>|<end_of_turn>|<\|im_start\|>|<\|im_end\|>/i;

function collectStrings(value, path = '$', out = []) {
  if (typeof value === 'string') {
    out.push({ path, value });
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, `${path}[${index}]`, out));
    return out;
  }
  if (!value || typeof value !== 'object') {
    return out;
  }
  for (const [key, item] of Object.entries(value)) {
    collectStrings(item, `${path}.${key}`, out);
  }
  return out;
}

function hasMarkers(value) {
  return collectStrings(value).filter((entry) => TURN_MARKERS.test(entry.value));
}

async function qdrant(path, body) {
  const requestBody = { ...body };
  if (requestBody.offset === null || requestBody.offset === undefined) {
    delete requestBody.offset;
  }
  const res = await fetch(`${QDRANT_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`Qdrant ${path} → HTTP ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function isAcceptablePoint(point) {
  const payload = point.payload ?? {};
  const kind = String(payload.kind ?? '').trim();
  const sourceRef = String(payload.source_ref ?? '').trim();
  const featureId = String(payload.feature_id ?? '').trim();
  const packetKey = String(payload.packet_key ?? '').trim();

  if (BLOCKED_KINDS.has(kind)) {
    return { ok: false, reason: `blocked kind ${kind}` };
  }

  if (!sourceRef) {
    return { ok: false, reason: 'missing source_ref' };
  }

  if (!featureId) {
    return { ok: false, reason: 'missing feature_id' };
  }

  if (hasMarkers(payload).length > 0) {
    return { ok: false, reason: 'generated turn markers present in payload' };
  }

  if (kind && !ALLOWED_KINDS.has(kind)) {
    return { ok: false, reason: `unexpected kind ${kind}` };
  }

  return {
    ok: true,
    reason: kind ? `allowed kind ${kind}` : 'kindless canonical payload',
    kind,
    sourceRef,
    featureId,
    packetKey,
  };
}

async function main() {
  console.log(`Qdrant chunk filter smoke: ${COLLECTION}`);

  const points = [];
  let offset = null;
  while (points.length < MAX_SCANNED) {
    const scroll = await qdrant(`/collections/${COLLECTION}/points/scroll`, {
      limit: SAMPLE_LIMIT,
      with_payload: true,
      with_vector: false,
      offset,
    });
    const page = scroll.result?.points ?? [];
    if (page.length === 0) break;
    points.push(...page);
    offset = scroll.result?.next_page_offset ?? null;
    if (offset === null || points.length >= MAX_SCANNED) break;
  }

  const accepted = [];
  const rejected = [];
  const acceptedKinds = new Map();
  const rejectedKinds = new Map();
  const acceptedMarkerHits = [];
  const rejectedMarkerHits = [];

  for (const point of points) {
    const verdict = isAcceptablePoint(point);
    if (verdict.ok) {
      accepted.push({
        id: point.id,
        kind: verdict.kind || '(null)',
        source_ref: verdict.sourceRef,
        feature_id: verdict.featureId,
        packet_key: verdict.packetKey || null,
      });
      acceptedKinds.set(verdict.kind || '(null)', (acceptedKinds.get(verdict.kind || '(null)') ?? 0) + 1);
    } else {
      rejected.push({
        id: point.id,
        kind: String(point.payload?.kind ?? '').trim() || '(null)',
        reason: verdict.reason,
        source_ref: String(point.payload?.source_ref ?? '').trim() || null,
        feature_id: String(point.payload?.feature_id ?? '').trim() || null,
      });
      rejectedKinds.set(String(point.payload?.kind ?? '').trim() || '(null)', (rejectedKinds.get(String(point.payload?.kind ?? '').trim() || '(null)') ?? 0) + 1);
    }

    const markers = hasMarkers(point.payload ?? {});
    if (markers.length > 0) {
      const entry = {
        id: point.id,
        markers: markers.slice(0, 5),
      };
      if (verdict.ok) {
        acceptedMarkerHits.push(entry);
      } else {
        rejectedMarkerHits.push(entry);
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    collection: COLLECTION,
    sampleLimit: SAMPLE_LIMIT,
    totals: {
      scanned: points.length,
      accepted: accepted.length,
      rejected: rejected.length,
    },
    allowlist: [...ALLOWED_KINDS],
    acceptedKinds: Object.fromEntries(acceptedKinds),
    rejectedKinds: Object.fromEntries(rejectedKinds),
    markerHits: {
      accepted: acceptedMarkerHits.length,
      rejected: rejectedMarkerHits.length,
    },
    sample: {
      accepted: accepted.slice(0, 10),
      rejected: rejected.slice(0, 10),
      acceptedMarkerHits: acceptedMarkerHits.slice(0, 10),
      rejectedMarkerHits: rejectedMarkerHits.slice(0, 10),
    },
    status: accepted.length >= TARGET_ACCEPTED && acceptedMarkerHits.length === 0 ? 'PASS' : 'FAIL',
  };

  console.log(JSON.stringify(report, null, 2));

  if (report.status === 'FAIL') {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[qdrant-code-chunk-filter-smoke] failed:', error?.stack ?? error?.message ?? error);
  process.exit(1);
});
