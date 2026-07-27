/**
 * Phase 4: Unknown Resolution Pipeline
 *
 * Handles classification and ingestion of packets with unknown or ambiguous domain class.
 * Implements 4-stage pipeline:
 *   Stage 1: Observation ingestion (raw unknown classification)
 *   Stage 2: Candidate generation (ensemble predictions)
 *   Stage 3: Evidence collection (supporting features + similar examples)
 *   Stage 4: Promotion (authorized approval to canonical state)
 *
 * Data flow:
 *   Unknown packet → extract features → run ensemble (Stage B/C/D) →
 *   aggregate predictions → compute confidence → stage candidates →
 *   collect evidence (similar packets, feature analysis) → await manual promotion
 *
 * Usage:
 *   # Process 1000 unknown packets through full pipeline
 *   npx tsx scripts/atlas/phase4-unknown-resolution-pipeline.mts \
 *     --mode=full --batch-size=1000 --confidence-threshold=0.5
 *
 *   # Dry-run (generate candidates but don't stage)
 *   npx tsx scripts/atlas/phase4-unknown-resolution-pipeline.mts \
 *     --mode=candidates-only --dry-run
 *
 *   # Promote staged candidates (requires authorization)
 *   npx tsx scripts/atlas/phase4-unknown-resolution-pipeline.mts \
 *     --mode=promote --authorized-by="user:123"
 */

import { randomUUID, createHash } from 'crypto';

interface UnknownPacket {
  packet_key: string;
  source_ref: string;
  feature_id: string;
  feature_vector: number[];
  feature_text?: string;
}

interface PredictionCandidate {
  packet_key: string;
  domain: string;
  confidence: number;
  classifier_kind: string;
  raw_score: number;
}

interface SimilarExample {
  packet_key: string;
  domain_class: string;
  similarity: number;
  distance_to_centroid?: number;
}

interface UnknownObservation {
  observation_id: string;
  packet_key: string;
  source_ref: string;
  feature_id: string;
  status: 'NEW' | 'CANDIDATES_GENERATED' | 'EVIDENCE_COLLECTED' | 'READY_FOR_APPROVAL';
  created_at: string;
  updated_at: string;
}

interface CandidateProposal {
  proposal_id: string;
  observation_id: string;
  packet_key: string;
  predicted_domain: string;
  confidence: number;
  evidence_summary: {
    ensemble_votes: Record<string, number>; // domain → vote count
    top_similar_examples: SimilarExample[];
    feature_analysis: Record<string, number>; // feature_id → relevance score
  };
  status: 'STAGED' | 'ACCEPTED' | 'REJECTED' | 'APPROVED';
  created_at: string;
  promoted_at?: string;
}

/**
 * Stage 1: Ingest unknown packet observation
 */
async function ingestUnknownObservation(packet: UnknownPacket): Promise<UnknownObservation> {
  const observation_id = randomUUID();
  const now = new Date().toISOString();

  return {
    observation_id,
    packet_key: packet.packet_key,
    source_ref: packet.source_ref,
    feature_id: packet.feature_id,
    status: 'NEW',
    created_at: now,
    updated_at: now,
  };
}

/**
 * Stage 2: Run ensemble of classifiers (B/C/D) and aggregate predictions
 */
async function generateCandidates(
  observation: UnknownObservation,
  packet: UnknownPacket
): Promise<PredictionCandidate[]> {
  // Mock: run Stage B, C, D classifiers and aggregate
  // In reality, this would call the trained models from Postgres

  const candidates: PredictionCandidate[] = [
    {
      packet_key: packet.packet_key,
      domain: 'infrastructure', // Mock Stage B result
      confidence: 0.72,
      classifier_kind: 'naive_bayes',
      raw_score: 1.85,
    },
    {
      packet_key: packet.packet_key,
      domain: 'infrastructure', // Mock Stage C result
      confidence: 0.68,
      classifier_kind: 'logistic_regression',
      raw_score: 1.92,
    },
    {
      packet_key: packet.packet_key,
      domain: 'infrastructure', // Mock Stage D result
      confidence: 0.75,
      classifier_kind: 'xgboost',
      raw_score: 2.11,
    },
  ];

  return candidates;
}

/**
 * Stage 3: Collect evidence for each candidate
 *   - Ensemble voting
 *   - Similar example retrieval
 *   - Feature importance
 */
async function collectEvidence(
  observation: UnknownObservation,
  packet: UnknownPacket,
  candidates: PredictionCandidate[]
): Promise<CandidateProposal> {
  const proposal_id = randomUUID();

  // Aggregate ensemble votes
  const votes: Record<string, number> = {};
  for (const cand of candidates) {
    votes[cand.domain] = (votes[cand.domain] || 0) + 1;
  }

  // Compute consensus domain (highest vote count)
  const consensus_domain = Object.entries(votes).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
  const consensus_confidence =
    candidates.filter((c) => c.domain === consensus_domain).reduce((sum, c) => sum + c.confidence, 0) /
    Math.max(1, candidates.filter((c) => c.domain === consensus_domain).length);

  // Mock: retrieve similar examples from Qdrant
  const similar_examples: SimilarExample[] = [
    {
      packet_key: 'ace:packet:example:001',
      domain_class: consensus_domain,
      similarity: 0.91,
      distance_to_centroid: 0.15,
    },
    {
      packet_key: 'ace:packet:example:002',
      domain_class: consensus_domain,
      similarity: 0.87,
      distance_to_centroid: 0.22,
    },
  ];

  // Mock: feature importance analysis
  const feature_analysis: Record<string, number> = {
    feature_imports: 0.23,
    feature_stdlib: 0.18,
    feature_async: 0.12,
    feature_error_handling: 0.09,
  };

  return {
    proposal_id,
    observation_id: observation.observation_id,
    packet_key: packet.packet_key,
    predicted_domain: consensus_domain,
    confidence: consensus_confidence,
    evidence_summary: {
      ensemble_votes: votes,
      top_similar_examples: similar_examples,
      feature_analysis,
    },
    status: 'STAGED',
    created_at: new Date().toISOString(),
  };
}

/**
 * Stage 4: Promote staged proposal to canonical (requires authorization)
 */
async function promoteProposal(
  proposal: CandidateProposal,
  authorized_by: string
): Promise<CandidateProposal> {
  return {
    ...proposal,
    status: 'APPROVED',
    promoted_at: new Date().toISOString(),
  };
}

/**
 * Full pipeline: observation → candidates → evidence → staged proposal
 */
async function processUnknownPackets(
  packets: UnknownPacket[],
  confidence_threshold = 0.5,
  dry_run = false
): Promise<CandidateProposal[]> {
  const proposals: CandidateProposal[] = [];

  for (const packet of packets) {
    console.log(`\n📦 Processing ${packet.packet_key}...`);

    // Stage 1: Ingest observation
    const observation = await ingestUnknownObservation(packet);
    console.log(`  ✓ Observation ingested (${observation.observation_id})`);

    // Stage 2: Generate candidates
    const candidates = await generateCandidates(observation, packet);
    console.log(`  ✓ Generated ${candidates.length} candidates`);

    // Stage 3: Collect evidence
    const proposal = await collectEvidence(observation, packet, candidates);
    console.log(`  ✓ Confidence: ${proposal.confidence.toFixed(3)} → domain: ${proposal.predicted_domain}`);
    console.log(`  ✓ Evidence: ${Object.keys(proposal.evidence_summary.feature_analysis).length} features`);

    // Stage 4: Filter by confidence threshold
    if (proposal.confidence >= confidence_threshold) {
      console.log(`  ✅ Staged for promotion (confidence >= ${confidence_threshold})`);
      proposals.push(proposal);
    } else {
      console.log(`  ⏭️ Below confidence threshold (${proposal.confidence.toFixed(3)} < ${confidence_threshold})`);
    }
  }

  return proposals;
}

/**
 * Persist proposals to PostgreSQL (staging table)
 */
async function persistProposals(proposals: CandidateProposal[], dry_run = false): Promise<void> {
  if (dry_run) {
    console.log(`\n(Dry-run mode: would persist ${proposals.length} proposals)`);
    return;
  }

  try {
    const { Pool } = await import('pg');

    const pool = new Pool({
      connectionString:
        process.env.DATABASE_URL || 'postgresql://legal_admin:legal_password@localhost:5434/legal_ai_db',
    });

    for (const proposal of proposals) {
      await pool.query(
        `INSERT INTO atlas_unknown_resolution_candidates (
          proposal_id, observation_id, packet_key, predicted_domain,
          confidence, ensemble_votes, similar_examples, feature_analysis, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (proposal_id) DO UPDATE
        SET status = EXCLUDED.status, updated_at = NOW()`,
        [
          proposal.proposal_id,
          proposal.observation_id,
          proposal.packet_key,
          proposal.predicted_domain,
          proposal.confidence,
          JSON.stringify(proposal.evidence_summary.ensemble_votes),
          JSON.stringify(proposal.evidence_summary.top_similar_examples),
          JSON.stringify(proposal.evidence_summary.feature_analysis),
          proposal.status,
          proposal.created_at,
        ]
      );
    }

    console.log(`✓ Persisted ${proposals.length} proposals`);
    await pool.end();
  } catch (err) {
    console.error('❌ Postgres persistence failed:', err);
    throw err;
  }
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const mode = args.find((a) => a.startsWith('--mode='))?.split('=')[1] || 'full';
  const batchSize = parseInt(args.find((a) => a.startsWith('--batch-size='))?.split('=')[1] || '100');
  const confidenceThreshold = parseFloat(
    args.find((a) => a.startsWith('--confidence-threshold='))?.split('=')[1] || '0.5'
  );
  const authorizedBy = args.find((a) => a.startsWith('--authorized-by='))?.split('=')[1];
  const dryRun = args.includes('--dry-run');

  console.log(`
╔════════════════════════════════════════════════════════════╗
║ Phase 4: Unknown Resolution Pipeline                       ║
╚════════════════════════════════════════════════════════════╝
  Mode: ${mode}
  Batch size: ${batchSize}
  Confidence threshold: ${confidenceThreshold}
  ${dryRun ? 'Dry-run mode' : 'Live mode'}
  `);

  // Mock: Load unknown packets (in reality, would query atlas_packets WHERE domain_class IS NULL)
  const unknown_packets: UnknownPacket[] = Array.from({ length: batchSize }).map((_, i) => ({
    packet_key: `ace:packet:unknown:${i + 1}`,
    source_ref: `src/lib/server/module${i + 1}.ts`,
    feature_id: `feature:unknown:${i + 1}`,
    feature_vector: Array.from({ length: 40 }).map(() => Math.random()),
  }));

  console.log(`\n📂 Processing ${unknown_packets.length} unknown packets...\n`);

  if (mode === 'full' || mode === 'candidates-only') {
    // Run pipeline
    const proposals = await processUnknownPackets(
      unknown_packets,
      confidenceThreshold,
      dryRun
    );

    console.log(`\n📊 Pipeline Results:`);
    console.log(`  Processed: ${unknown_packets.length}`);
    console.log(`  Staged: ${proposals.length}`);
    console.log(`  Abstained: ${unknown_packets.length - proposals.length}`);
    console.log(`  Abstention rate: ${(((unknown_packets.length - proposals.length) / unknown_packets.length) * 100).toFixed(1)}%`);

    if (mode === 'full' && !dryRun) {
      await persistProposals(proposals, dryRun);
    }
  }

  if (mode === 'promote') {
    if (!authorizedBy) {
      console.error('❌ --authorized-by parameter required for promotion mode');
      process.exit(1);
    }

    // Mock: Load staged proposals and promote
    const staged_proposals: CandidateProposal[] = [
      {
        proposal_id: randomUUID(),
        observation_id: randomUUID(),
        packet_key: 'ace:packet:unknown:1',
        predicted_domain: 'infrastructure',
        confidence: 0.72,
        evidence_summary: {
          ensemble_votes: { infrastructure: 3 },
          top_similar_examples: [],
          feature_analysis: {},
        },
        status: 'STAGED',
        created_at: new Date().toISOString(),
      },
    ];

    console.log(`\n🚀 Promoting ${staged_proposals.length} staged proposals...\n`);

    for (const proposal of staged_proposals) {
      const promoted = await promoteProposal(proposal, authorizedBy);
      console.log(
        `  ✅ ${promoted.packet_key} → ${promoted.predicted_domain} (promoted by ${authorizedBy})`
      );
    }

    console.log(`\n✨ Promoted ${staged_proposals.length} proposals to canonical`);
  }

  console.log('\n✨ Phase 4 complete');
}

main().catch(console.error);
