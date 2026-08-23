import { describe, expect, it } from 'vitest';
import { evaluateHydratedDomainRerankShadowV1 } from './domain-rerank-shadow-v1.js';
import type { PacketDomainFeatureEnvelopeV1, PacketDomainLineageHydrationProofV1 } from './packet-domain-lineage-v1.js';

function envelope(overrides:Partial<PacketDomainFeatureEnvelopeV1>={}):PacketDomainFeatureEnvelopeV1 { return { chunk_id:'chunk-1', packet_key:'packet-1', source_ref:'src/lib/server/retrieval/search-runtime.ts', content_hash:'abc123', domain:'retrieval', domain_class:'retrieval', domain_class_source:'feature_domain_facts:heuristic_path_classifier', domain_classifier_version:'domain-classifier-v1', domain_class_confidence:0.95, domain_fact_content_hash:'abc123', domain_lineage_status:'PROVEN', reward_prior:0.7, created_at:new Date('2026-08-22T00:00:00.000Z'), ...overrides }; }
function proof(overrides:Partial<PacketDomainLineageHydrationProofV1>={}):PacketDomainLineageHydrationProofV1 { return { packetResolvedCount:2,lineageProvenCount:2,lineageBlockedCount:0,readFailedCount:0,statusCounts:{PROVEN:2,PACKET_MISSING:0,PACKET_AMBIGUOUS:0,PACKET_SOURCE_REF_MISMATCH:0,PACKET_CONTENT_HASH_MISSING:0,ENVELOPE_CONTENT_HASH_MISSING:0,PACKET_CONTENT_HASH_MISMATCH:0,PACKET_DOMAIN_MISSING:0,DOMAIN_FACT_MISSING:0,DOMAIN_FACT_MISMATCH:0,DOMAIN_FACT_AMBIGUOUS:0,DOMAIN_LEDGER_READ_FAILED:0},...overrides }; }

describe('DomainRerankShadowV1',()=>{
  it('measures exact and mismatching domains without promoting ranking',()=>{
    const r=evaluateHydratedDomainRerankShadowV1({query:'rerank qdrant retrieval search candidates',envelopes:[envelope(),envelope({chunk_id:'chunk-2',packet_key:'packet-2',source_ref:'src/lib/server/db/schema.ts',domain:'database',domain_class:'database'})],packetHydrationProof:proof()});
    expect(r.proof.candidateCount).toBe(2); expect(r.proof.matchEligibleCount).toBe(2); expect(r.proof.exactPrimaryCount).toBe(1); expect(r.proof.provenMismatchCount).toBe(1); expect(r.proof.rankingPromoted).toBe(false); expect(r.proof.xgboostFeatureActivated).toBe(false); expect(r.candidates[0]?.evidence.trainingEligible).toBe(true); expect(r.candidates[0]?.evidence.rankingEligible).toBe(false);
  });
  it('keeps ambiguous lineage unresolved',()=>{
    const r=evaluateHydratedDomainRerankShadowV1({query:'rerank qdrant retrieval search candidates',envelopes:[envelope({domain_classifier_version:null,domain_lineage_status:'DOMAIN_FACT_AMBIGUOUS'})],packetHydrationProof:proof({packetResolvedCount:1,lineageProvenCount:0,lineageBlockedCount:1,statusCounts:{...proof().statusCounts,PROVEN:0,DOMAIN_FACT_AMBIGUOUS:1}})});
    expect(r.proof.matchEligibleCount).toBe(0); expect(r.proof.unresolvedCount).toBe(1); expect(r.candidates[0]?.comparison.domainClassMatch).toBeNull(); expect(r.proof.rankingPromoted).toBe(false);
  });
  it('is deterministic over identical frozen inputs',()=>{
    const input={query:'render svelte ui component button',envelopes:[envelope({domain:'ui',domain_class:'ui'})],packetHydrationProof:proof({packetResolvedCount:1,lineageProvenCount:1})};
    const a=evaluateHydratedDomainRerankShadowV1(input); const b=evaluateHydratedDomainRerankShadowV1(input);
    expect(a.proof.proofChecksum).toBe(b.proof.proofChecksum); expect(a.candidates[0]?.comparison.comparisonChecksum).toBe(b.candidates[0]?.comparison.comparisonChecksum);
  });
});
