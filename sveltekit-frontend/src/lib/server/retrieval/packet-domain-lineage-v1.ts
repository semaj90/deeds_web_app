import { z } from 'zod';
import { db } from '$lib/server/db/client.js';
import { sql } from 'drizzle-orm';
import { normalizeDomainLabel } from '../atlas/domain-taxonomy.js';
import type { FeatureEnvelope } from './feature-envelope.js';

export const PacketDomainLineageStatusV1Schema = z.enum([
  'PROVEN',
  'PACKET_MISSING',
  'PACKET_AMBIGUOUS',
  'PACKET_SOURCE_REF_MISMATCH',
  'PACKET_CONTENT_HASH_MISSING',
  'ENVELOPE_CONTENT_HASH_MISSING',
  'PACKET_CONTENT_HASH_MISMATCH',
  'PACKET_DOMAIN_MISSING',
  'DOMAIN_FACT_MISSING',
  'DOMAIN_FACT_MISMATCH',
  'DOMAIN_FACT_AMBIGUOUS',
  'DOMAIN_LEDGER_READ_FAILED',
]);

export type PacketDomainLineageStatusV1 = z.infer<typeof PacketDomainLineageStatusV1Schema>;

export const PacketDomainLineageV1Schema = z.object({
  schema: z.literal('atlas.packet-domain-lineage.v1'),
  packetKey: z.string().min(1),
  status: PacketDomainLineageStatusV1Schema,
  domainClass: z.enum(['auth', 'ui', 'retrieval', 'network', 'database', 'cache', 'agent', 'graph', 'ml', 'general']).nullable(),
  domainClassSource: z.string().min(1).nullable(),
  classifierVersion: z.string().min(1).nullable(),
  domainConfidence: z.number().min(0).max(1).nullable(),
  domainFactContentHash: z.string().min(1).nullable(),
  rewardPrior: z.number().min(0).max(1).nullable(),
  lineageProven: z.boolean(),
});

export type PacketDomainLineageV1 = z.infer<typeof PacketDomainLineageV1Schema>;

export interface PacketDomainCanonicalRowV1 {
  packetKey: string;
  sourceRef: string | null;
  contentHash: string | null;
  domainClass: string | null;
  rewardPrior: number | null;
}

export interface PacketDomainFactRowV1 {
  packetKey: string;
  sourceRef: string;
  domainClass: string;
  domainConfidence: number | null;
  classifierKind: string;
  classifierVersion: string;
  contentHash: string;
}

export interface PacketDomainLineageHydrationProofV1 {
  packetResolvedCount: number;
  lineageProvenCount: number;
  lineageBlockedCount: number;
  readFailedCount: number;
  statusCounts: Record<PacketDomainLineageStatusV1, number>;
}

function cleanSourceRef(value: string | null | undefined): string {
  return String(value ?? '').trim().replace(/\\/g, '/').replace(/^\.\//, '');
}

function cleanHash(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeDomainClass(value: string | null | undefined): FeatureEnvelope['domain_class'] | null {
  const normalized = normalizeDomainLabel(value);
  return (normalized.canonical ?? normalized.fallback ?? null) as FeatureEnvelope['domain_class'] | null;
}

/**
 * atlas_packets.reward_prior is stored on the historical 0..10 scale used by
 * the XGBoost exporter. Runtime rerank candidates use normalized [0,1]
 * features, so normalize at this explicit storage boundary rather than
 * overloading another score.
 */
export function normalizePacketRewardPriorV1(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  return Math.max(0, Math.min(1, Number(value) / 10));
}

function legacyLineage(
  envelope: Pick<FeatureEnvelope, 'packet_key' | 'domain_class' | 'domain'>,
  status: PacketDomainLineageStatusV1,
): PacketDomainLineageV1 {
  const fallback = normalizeDomainClass(envelope.domain_class ?? envelope.domain ?? null);
  return PacketDomainLineageV1Schema.parse({
    schema: 'atlas.packet-domain-lineage.v1',
    packetKey: envelope.packet_key ?? 'missing-packet-key',
    status,
    domainClass: fallback,
    domainClassSource: fallback ? 'codebase_chunk_index.domain_legacy' : null,
    classifierVersion: null,
    domainConfidence: null,
    domainFactContentHash: null,
    rewardPrior: null,
    lineageProven: false,
  });
}

/**
 * Resolve persisted domain authority without guessing.
 *
 * Strong readback requires:
 *   exact packet_key
 *   exact source_ref
 *   exact packet content hash == hydrated envelope content hash
 *   exact feature_domain_facts content hash/source/domain agreement
 *   exactly one matching fact row
 *
 * Multiple classifier versions are not collapsed by "latest wins" because
 * atlas_packets does not currently persist the classifier version that
 * produced its canonical domain_class. Ambiguity remains observable.
 */
export function resolvePacketDomainLineageV1(input: {
  envelope: Pick<FeatureEnvelope, 'packet_key' | 'source_ref' | 'content_hash' | 'domain_class' | 'domain'>;
  packets: PacketDomainCanonicalRowV1[];
  facts: PacketDomainFactRowV1[];
}): PacketDomainLineageV1 {
  const packetKey = input.envelope.packet_key?.trim();
  if (!packetKey) return legacyLineage(input.envelope, 'PACKET_MISSING');

  const packetRows = input.packets.filter((row) => row.packetKey === packetKey);
  if (packetRows.length === 0) return legacyLineage(input.envelope, 'PACKET_MISSING');
  if (packetRows.length !== 1) return legacyLineage(input.envelope, 'PACKET_AMBIGUOUS');

  const packet = packetRows[0]!;
  const envelopeSourceRef = cleanSourceRef(input.envelope.source_ref);
  const packetSourceRef = cleanSourceRef(packet.sourceRef);
  if (!envelopeSourceRef || !packetSourceRef || packetSourceRef !== envelopeSourceRef) {
    return legacyLineage(input.envelope, 'PACKET_SOURCE_REF_MISMATCH');
  }

  const packetContentHash = cleanHash(packet.contentHash);
  const envelopeContentHash = cleanHash(input.envelope.content_hash);
  if (!packetContentHash) return legacyLineage(input.envelope, 'PACKET_CONTENT_HASH_MISSING');
  if (!envelopeContentHash) return legacyLineage(input.envelope, 'ENVELOPE_CONTENT_HASH_MISSING');
  if (packetContentHash !== envelopeContentHash) {
    return legacyLineage(input.envelope, 'PACKET_CONTENT_HASH_MISMATCH');
  }

  const domainClass = normalizeDomainClass(packet.domainClass);
  if (!domainClass) return legacyLineage(input.envelope, 'PACKET_DOMAIN_MISSING');

  const rewardPrior = normalizePacketRewardPriorV1(packet.rewardPrior);
  const packetFacts = input.facts.filter((row) => row.packetKey === packetKey);
  if (packetFacts.length === 0) {
    return PacketDomainLineageV1Schema.parse({
      schema: 'atlas.packet-domain-lineage.v1',
      packetKey,
      status: 'DOMAIN_FACT_MISSING',
      domainClass,
      domainClassSource: 'atlas_packets.domain_class',
      classifierVersion: null,
      domainConfidence: null,
      domainFactContentHash: null,
      rewardPrior,
      lineageProven: false,
    });
  }

  const exactFacts = packetFacts.filter((fact) =>
    cleanHash(fact.contentHash) === packetContentHash &&
    cleanSourceRef(fact.sourceRef) === packetSourceRef &&
    normalizeDomainClass(fact.domainClass) === domainClass,
  );

  if (exactFacts.length === 0) {
    return PacketDomainLineageV1Schema.parse({
      schema: 'atlas.packet-domain-lineage.v1',
      packetKey,
      status: 'DOMAIN_FACT_MISMATCH',
      domainClass,
      domainClassSource: 'atlas_packets.domain_class',
      classifierVersion: null,
      domainConfidence: null,
      domainFactContentHash: null,
      rewardPrior,
      lineageProven: false,
    });
  }

  if (exactFacts.length !== 1) {
    return PacketDomainLineageV1Schema.parse({
      schema: 'atlas.packet-domain-lineage.v1',
      packetKey,
      status: 'DOMAIN_FACT_AMBIGUOUS',
      domainClass,
      domainClassSource: 'atlas_packets.domain_class',
      classifierVersion: null,
      domainConfidence: null,
      domainFactContentHash: packetContentHash,
      rewardPrior,
      lineageProven: false,
    });
  }

  const fact = exactFacts[0]!;
  return PacketDomainLineageV1Schema.parse({
    schema: 'atlas.packet-domain-lineage.v1',
    packetKey,
    status: 'PROVEN',
    domainClass,
    domainClassSource: `feature_domain_facts:${fact.classifierKind}`,
    classifierVersion: fact.classifierVersion,
    domainConfidence: fact.domainConfidence === null
      ? null
      : Math.max(0, Math.min(1, Number(fact.domainConfidence))),
    domainFactContentHash: fact.contentHash,
    rewardPrior,
    lineageProven: true,
  });
}

function emptyStatusCounts(): Record<PacketDomainLineageStatusV1, number> {
  return Object.fromEntries(
    PacketDomainLineageStatusV1Schema.options.map((status) => [status, 0]),
  ) as Record<PacketDomainLineageStatusV1, number>;
}

function applyLineage(envelope: FeatureEnvelope, lineage: PacketDomainLineageV1): FeatureEnvelope {
  return {
    ...envelope,
    domain_class: lineage.domainClass ?? envelope.domain_class,
    domain_class_source: lineage.domainClassSource,
    domain_classifier_version: lineage.classifierVersion,
    domain_class_confidence: lineage.domainConfidence,
    domain_fact_content_hash: lineage.domainFactContentHash,
    domain_lineage_status: lineage.status,
    reward_prior: lineage.rewardPrior,
  };
}

/**
 * Batch read-through for already hydrated FeatureEnvelopes.
 *
 * This is read-only. Failure to read the optional domain ledger is fail-open
 * for retrieval because canonical domain weight remains zero; the envelopes
 * are returned with DOMAIN_LEDGER_READ_FAILED and no learned-domain eligibility.
 */
export async function hydratePacketDomainLineageV1(
  envelopes: FeatureEnvelope[],
): Promise<{ envelopes: FeatureEnvelope[]; proof: PacketDomainLineageHydrationProofV1 }> {
  const packetKeys = [...new Set(
    envelopes.map((envelope) => envelope.packet_key?.trim()).filter((value): value is string => Boolean(value)),
  )];
  const statusCounts = emptyStatusCounts();

  if (packetKeys.length === 0) {
    const hydrated = envelopes.map((envelope) => {
      const lineage = legacyLineage(envelope, 'PACKET_MISSING');
      statusCounts[lineage.status] += 1;
      return applyLineage(envelope, lineage);
    });
    return {
      envelopes: hydrated,
      proof: {
        packetResolvedCount: 0,
        lineageProvenCount: 0,
        lineageBlockedCount: hydrated.length,
        readFailedCount: 0,
        statusCounts,
      },
    };
  }

  const valueList = (values: string[]) => sql.join(values.map((value) => sql`${value}`), sql`, `);

  try {
    const packetResult = await db.execute(sql`
      SELECT
        p.packet_key,
        p.source_ref,
        COALESCE(
          NULLIF(to_jsonb(p)->>'content_hash', ''),
          NULLIF(to_jsonb(p)->>'sha256', '')
        ) AS content_hash,
        p.domain_class,
        p.reward_prior
      FROM atlas_packets p
      WHERE p.packet_key IN (${valueList(packetKeys)})
    `);

    const factResult = await db.execute(sql`
      SELECT
        packet_key,
        source_ref,
        domain_class,
        domain_confidence,
        classifier_kind,
        classifier_version,
        content_hash
      FROM feature_domain_facts
      WHERE packet_key IN (${valueList(packetKeys)})
    `);

    const packets = packetResult.rows.map((row) => {
      const typed = row as Record<string, unknown>;
      return {
        packetKey: String(typed.packet_key ?? ''),
        sourceRef: typeof typed.source_ref === 'string' ? typed.source_ref : null,
        contentHash: typeof typed.content_hash === 'string' ? typed.content_hash : null,
        domainClass: typeof typed.domain_class === 'string' ? typed.domain_class : null,
        rewardPrior: typed.reward_prior === null || typed.reward_prior === undefined
          ? null
          : Number(typed.reward_prior),
      } satisfies PacketDomainCanonicalRowV1;
    });

    const facts = factResult.rows.map((row) => {
      const typed = row as Record<string, unknown>;
      return {
        packetKey: String(typed.packet_key ?? ''),
        sourceRef: String(typed.source_ref ?? ''),
        domainClass: String(typed.domain_class ?? ''),
        domainConfidence: typed.domain_confidence === null || typed.domain_confidence === undefined
          ? null
          : Number(typed.domain_confidence),
        classifierKind: String(typed.classifier_kind ?? ''),
        classifierVersion: String(typed.classifier_version ?? ''),
        contentHash: String(typed.content_hash ?? ''),
      } satisfies PacketDomainFactRowV1;
    });

    let packetResolvedCount = 0;
    let lineageProvenCount = 0;
    const hydrated = envelopes.map((envelope) => {
      const lineage = resolvePacketDomainLineageV1({ envelope, packets, facts });
      statusCounts[lineage.status] += 1;
      if (!['PACKET_MISSING', 'PACKET_AMBIGUOUS'].includes(lineage.status)) packetResolvedCount += 1;
      if (lineage.lineageProven) lineageProvenCount += 1;
      return applyLineage(envelope, lineage);
    });

    return {
      envelopes: hydrated,
      proof: {
        packetResolvedCount,
        lineageProvenCount,
        lineageBlockedCount: hydrated.length - lineageProvenCount,
        readFailedCount: 0,
        statusCounts,
      },
    };
  } catch (error) {
    console.warn('[hydrate-packet-domain-lineage] read failed; preserving retrieval order without domain scoring', {
      error: error instanceof Error ? error.message : String(error),
      packetCount: packetKeys.length,
    });

    const hydrated = envelopes.map((envelope) => {
      const lineage = legacyLineage(envelope, 'DOMAIN_LEDGER_READ_FAILED');
      statusCounts[lineage.status] += 1;
      return applyLineage(envelope, lineage);
    });
    return {
      envelopes: hydrated,
      proof: {
        packetResolvedCount: 0,
        lineageProvenCount: 0,
        lineageBlockedCount: hydrated.length,
        readFailedCount: hydrated.length,
        statusCounts,
      },
    };
  }
}
