/**
 * DISCOVERY-03 (parent-atlas-deep-research-ingestion): routes selected
 * SearchSnapshotV1 result URLs toward the existing acquisition owner
 * (`acquisition-writer.ts`'s `requestAcquisition()`), without calling it.
 *
 * This module is a pure, bounded ELIGIBLE/REJECTED classifier over a
 * snapshot's ordered results. It reuses this repo's existing SSRF/allowlist
 * check (`validateExternalUrl`, `security/url-validator.ts`) rather than
 * inventing a second one -- confirmed via audit that `conditional-fetch.ts`
 * (the real network-fetch layer, `acquisition-worker.ts`'s dependency)
 * already reuses the same function per-redirect-hop, so this module's
 * pre-fetch classification stays consistent with the actual fetch-time gate.
 *
 * Deliberately does NOT call `requestAcquisition()` or touch Postgres/Redis
 * -- proposal.md's "Explicitly out of scope for now" list includes datastore
 * writes in this planning pass. Submitting an ELIGIBLE candidate to the real
 * acquisition writer is a separate, later, explicitly-authorized step.
 *
 * Snippets/titles from the search results never leave this module as
 * anything other than routing input -- they are not promoted to document
 * evidence here (see "Discovery is not acquired source evidence" in
 * specs/deep-research-ingestion/spec.md).
 */
import { z } from 'zod';
import { validateExternalUrl } from '$lib/server/security/url-validator.js';
import type { SearchSnapshotV1 } from './search-observation-v1.js';

/**
 * Bounds how many of a snapshot's ordered results are even evaluated for
 * acquisition. Results beyond this rank never reach `validateExternalUrl` --
 * this is a selection bound, distinct from `conditional-fetch.ts`'s own
 * per-fetch bounds (MAX_REDIRECTS=5, REQUEST_TIMEOUT_MS=15000,
 * MAX_RESPONSE_BYTES=10MB), which apply later, per acquired URL.
 */
export const ACQUISITION_ROUTING_MAX_CANDIDATES = 10;

/**
 * Extensions with no existing acquisition owner today. DOC-06A (the one
 * real, live external-doc admission owner) handles generic HTML/PDF/text
 * content; no owner exists yet for binary media (proposal.md: "Other media
 * stays blocked until its existing owner is resolved"). This is a
 * conservative, extension-based proxy for "ownership is ambiguous/missing"
 * -- real content-type is only known after fetching, which this module
 * deliberately never does.
 */
const UNOWNED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico',
  '.mp4', '.webm', '.mov', '.avi', '.mkv',
  '.mp3', '.wav', '.ogg', '.flac',
  '.zip', '.tar', '.gz', '.7z', '.rar',
  '.exe', '.dmg', '.msi', '.apk',
]);

export const AcquisitionCandidateRejectionReasonSchema = z.enum([
  'INVALID_URL',
  'UNSUPPORTED_SCHEME',
  'SSRF_BLOCKED',
  'DUPLICATE_NORMALIZED_URL',
  'UNOWNED_CONTENT_TYPE',
]);
export type AcquisitionCandidateRejectionReason = z.infer<
  typeof AcquisitionCandidateRejectionReasonSchema
>;

export const AcquisitionCandidateV1Schema = z
  .object({
    schema: z.literal('atlas.acquisition-candidate.v1'),
    requestedUrl: z.string(),
    normalizedUrl: z.string().nullable(),
    sourceRank: z.number().int().nonnegative(),
    status: z.enum(['ELIGIBLE', 'REJECTED']),
    rejectionReason: AcquisitionCandidateRejectionReasonSchema.nullable(),
  })
  .strict();
export type AcquisitionCandidateV1 = z.infer<typeof AcquisitionCandidateV1Schema>;

export const AcquisitionRoutingPlanV1Schema = z
  .object({
    schema: z.literal('atlas.acquisition-routing-plan.v1'),
    snapshotChecksum: z.string(),
    candidates: z.array(AcquisitionCandidateV1Schema),
    eligibleCount: z.number().int().nonnegative(),
    rejectedCount: z.number().int().nonnegative(),
    /** True when the snapshot had more results than were even evaluated. */
    truncated: z.boolean(),
  })
  .strict();
export type AcquisitionRoutingPlanV1 = z.infer<typeof AcquisitionRoutingPlanV1Schema>;

/**
 * Minimal URL normalization for dedup purposes only: lowercase scheme/host,
 * strip fragment, strip default port. Not a full RFC 3986 normalizer --
 * intentionally conservative so it never changes a URL's fetch target.
 */
function minimalNormalizeUrl(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  parsed.hash = '';
  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase();
  if (
    (parsed.protocol === 'http:' && parsed.port === '80') ||
    (parsed.protocol === 'https:' && parsed.port === '443')
  ) {
    parsed.port = '';
  }
  if (parsed.pathname === '') parsed.pathname = '/';
  return parsed.toString();
}

function extensionOf(normalizedUrl: string): string | null {
  try {
    const pathname = new URL(normalizedUrl).pathname.toLowerCase();
    const match = pathname.match(/\.[a-z0-9]+$/);
    return match ? match[0] : null;
  } catch {
    return null;
  }
}

function reject(
  requestedUrl: string,
  normalizedUrl: string | null,
  sourceRank: number,
  rejectionReason: AcquisitionCandidateRejectionReason,
): AcquisitionCandidateV1 {
  return {
    schema: 'atlas.acquisition-candidate.v1',
    requestedUrl,
    normalizedUrl,
    sourceRank,
    status: 'REJECTED',
    rejectionReason,
  };
}

/**
 * Pure classifier: given a frozen snapshot (or a minimal subset of it),
 * produces a bounded, ordered ELIGIBLE/REJECTED routing plan. Performs no
 * network I/O and no datastore writes.
 */
export function planAcquisitionRoutingV1(
  snapshot: Pick<SearchSnapshotV1, 'snapshotChecksum' | 'results'>,
  maxCandidates: number = ACQUISITION_ROUTING_MAX_CANDIDATES,
): AcquisitionRoutingPlanV1 {
  const seenNormalized = new Set<string>();
  const candidates: AcquisitionCandidateV1[] = [];
  const truncated = snapshot.results.length > maxCandidates;
  const evaluated = snapshot.results.slice(0, maxCandidates);

  evaluated.forEach((result, sourceRank) => {
    const normalizedUrl = minimalNormalizeUrl(result.url);
    if (normalizedUrl === null) {
      candidates.push(reject(result.url, null, sourceRank, 'INVALID_URL'));
      return;
    }

    const scheme = new URL(normalizedUrl).protocol;
    if (scheme !== 'http:' && scheme !== 'https:') {
      candidates.push(reject(result.url, normalizedUrl, sourceRank, 'UNSUPPORTED_SCHEME'));
      return;
    }

    if (seenNormalized.has(normalizedUrl)) {
      candidates.push(reject(result.url, normalizedUrl, sourceRank, 'DUPLICATE_NORMALIZED_URL'));
      return;
    }

    const extension = extensionOf(normalizedUrl);
    if (extension !== null && UNOWNED_EXTENSIONS.has(extension)) {
      candidates.push(reject(result.url, normalizedUrl, sourceRank, 'UNOWNED_CONTENT_TYPE'));
      return;
    }

    const safety = validateExternalUrl(normalizedUrl);
    if (!safety.valid) {
      candidates.push(reject(result.url, normalizedUrl, sourceRank, 'SSRF_BLOCKED'));
      return;
    }

    seenNormalized.add(normalizedUrl);
    candidates.push({
      schema: 'atlas.acquisition-candidate.v1',
      requestedUrl: result.url,
      normalizedUrl,
      sourceRank,
      status: 'ELIGIBLE',
      rejectionReason: null,
    });
  });

  const eligibleCount = candidates.filter((candidate) => candidate.status === 'ELIGIBLE').length;

  return AcquisitionRoutingPlanV1Schema.parse({
    schema: 'atlas.acquisition-routing-plan.v1',
    snapshotChecksum: snapshot.snapshotChecksum,
    candidates,
    eligibleCount,
    rejectedCount: candidates.length - eligibleCount,
    truncated,
  });
}
