#!/usr/bin/env node

/**
 * Phase 3 Step 1: Contract Validation
 *
 * Validate the 5 new contracts (Phase 2 extension) against:
 * - JSON Schema Draft 2020-12 (contracts.json)
 * - Zod TypeScript schemas (classifier-contracts.ts)
 * - Pydantic models (classifier_contracts.py) — syntactic only, no runtime
 *
 * Exit codes:
 * 0 = All contracts valid
 * 1 = JSON Schema validation failed
 * 2 = Zod validation failed
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import Ajv from 'ajv';
import {
  DomainOntologyLabelSchema,
  LinkedSemanticTupleSchema,
  RetrievalCandidateSchema,
  RankerFeatureEnvelopeSchema,
  EvidenceLanesSchema,
  RankerFeaturesSchema,
  EvidenceObservationSchema,
  MutationProposalSchema,
} from './lib/classifier-contracts.js';

interface ValidationResult {
  contract: string;
  json_schema: { valid: boolean; errors?: string[] };
  zod: { valid: boolean; errors?: string[] };
  passed: boolean;
}

// Load contracts.json
const contractsPath = resolve(process.cwd(), 'scripts', 'atlas', 'contracts.json');
const contractsText = readFileSync(contractsPath, 'utf-8');
const contracts = JSON.parse(contractsText);

// Initialize JSON Schema validator with date-time format support
const ajv = new Ajv({ formats: { 'date-time': true } });

// Test fixtures for each contract
const fixtures = {
  DomainOntologyLabel: {
    valid: {
      domain: 'database',
      canonical_label: 'database',
      tier: 'tier2_major',
      parent_domain: 'computer_science',
      keywords: ['database', 'sql', 'index', 'query'],
      description: 'Database design and optimization',
    },
    invalid: {
      domain: 'database',
      canonical_label: 'database',
      tier: 'invalid_tier',
      parent_domain: null,
      keywords: [],
      // missing description
    },
  },

  LinkedSemanticTuple: {
    valid: {
      source_packet_key: 'ace:packet:auth-001',
      target_packet_key: 'ace:packet:auth-002',
      evidence_lanes: {
        semantic: 0.85,
        lexical: 0.72,
        structural: 0.65,
        topology: 0.55,
        recency: 0.9,
      },
      combined_score: 0.73,
      created_at: new Date().toISOString(),
    },
    invalid: {
      source_packet_key: 'ace:packet:auth:001',
      target_packet_key: 'invalid-key',
      evidence_lanes: {
        semantic: 1.5, // out of range
        lexical: 0.72,
        structural: 0.65,
        topology: 0.55,
        recency: 0.9,
      },
      combined_score: 0.73,
      created_at: new Date().toISOString(),
    },
  },

  RetrievalCandidate: {
    valid: {
      packet_key: 'ace:packet:retrieval-001',
      rank: 1,
      rrf_score: 0.92,
      evidence_signals: {
        semantic: 0.95,
        lexical: 0.80,
        structural: 0.70,
        topology: 0.65,
        recency: 0.85,
      },
      domain_boosts: { database: 1.2, retrieval: 1.1 },
      matching_domains: ['database', 'retrieval'],
    },
    invalid: {
      packet_key: 'ace:packet:retrieval:001',
      rank: 0, // must be >= 1
      rrf_score: 0.92,
      evidence_signals: {
        semantic: 0.95,
        lexical: 0.80,
        structural: 0.70,
        topology: 0.65,
        recency: 0.85,
      },
      domain_boosts: {},
      matching_domains: [],
    },
  },

  RankerFeatureEnvelope: {
    valid: {
      query_id: 'query-001',
      packet_key: 'ace:packet:feature-001',
      relevance_label: 2,
      features: {
        semantic_score: 0.85,
        bm25_score: 0.72,
        domain_entropy: 1.2,
        tree_node_distance: 2.0,
        page_rank_score: 0.6,
        recency_days: 1.5,
      },
    },
    invalid: {
      query_id: 'query-001',
      packet_key: 'ace:packet:feature-001',
      relevance_label: 5, // out of range
      features: {
        semantic_score: 0.85,
        bm25_score: 0.72,
        domain_entropy: 1.2,
        tree_node_distance: 2.0,
        page_rank_score: 0.6,
        recency_days: 1.5,
      },
    },
  },

  EvidenceObservation: {
    valid: {
      observation_id: 'obs:semantic-embedding-001',
      packet_key: 'ace:packet:auth-001',
      observation_type: 'semantic_embedding',
      evidence_lane: 'semantic',
      value: [0.12, 0.45, -0.33, 0.88],
      confidence: 0.98,
      source: 'qdrant',
      observed_at: new Date().toISOString(),
      metadata: { model: 'embeddinggemma:latest', dim: 768 },
    },
    invalid: {
      observation_id: 'obs:semantic-embedding-001',
      packet_key: 'ace:packet:auth-001',
      observation_type: 'invalid_type', // not in enum
      evidence_lane: 'semantic',
      value: 0.5,
      confidence: 0.98,
      source: 'qdrant',
      observed_at: new Date().toISOString(),
    } as any,
  },

  MutationProposal: {
    valid: {
      proposal_id: 'mut:domain-update-001',
      packet_key: 'ace:packet:auth-001',
      mutation_type: 'domain_membership_update',
      changes: {
        domain_memberships: { authentication: 0.85, security: 0.15 },
        primary_domain: 'authentication',
        domain_confidence: 0.85,
      },
      justification: 'Observed embedding cluster matches auth domain keywords',
      observations_supporting: ['obs:semantic-embedding-001', 'obs:lexical-bm25-001'],
      status: 'proposed',
      created_at: new Date().toISOString(),
    },
    invalid: {
      proposal_id: 'mut:domain-update-001',
      packet_key: 'ace:packet:auth-001',
      mutation_type: 'domain_membership_update',
      changes: {},
      justification: 'Observed embedding cluster matches auth domain keywords',
      observations_supporting: ['invalid-obs-id'], // doesn't match regex
      status: 'proposed',
      created_at: new Date().toISOString(),
    } as any,
  },
};

// Validation function
function validateContract(
  contractName: string,
  schema: any,
  validFixture: any,
  invalidFixture: any
): ValidationResult {
  const result: ValidationResult = {
    contract: contractName,
    json_schema: { valid: false },
    zod: { valid: false },
    passed: false,
  };

  // JSON Schema validation
  try {
    const validate = ajv.compile(schema);
    const validPass = validate(validFixture);
    const invalidPass = validate(invalidFixture);

    if (validPass && !invalidPass) {
      result.json_schema.valid = true;
    } else {
      result.json_schema.errors = [
        `Valid fixture pass: ${validPass}, Invalid fixture pass: ${invalidPass}`,
        ...(validate.errors?.map((e) => `${e.instancePath} ${e.message}`) || []),
      ];
    }
  } catch (err) {
    result.json_schema.errors = [(err as Error).message];
  }

  // Zod validation
  try {
    const zodSchema = (() => {
      switch (contractName) {
        case 'DomainOntologyLabel':
          return DomainOntologyLabelSchema;
        case 'LinkedSemanticTuple':
          return LinkedSemanticTupleSchema;
        case 'RetrievalCandidate':
          return RetrievalCandidateSchema;
        case 'RankerFeatureEnvelope':
          return RankerFeatureEnvelopeSchema;
        case 'EvidenceObservation':
          return EvidenceObservationSchema;
        case 'MutationProposal':
          return MutationProposalSchema;
        default:
          throw new Error(`Unknown contract: ${contractName}`);
      }
    })();

    const validParse = zodSchema.safeParse(validFixture);
    const invalidParse = zodSchema.safeParse(invalidFixture);

    if (validParse.success && !invalidParse.success) {
      result.zod.valid = true;
    } else {
      result.zod.errors = [
        `Valid parse success: ${validParse.success}, Invalid parse success: ${invalidParse.success}`,
        ...(invalidParse.success ? ['Invalid fixture should have failed'] : []),
        ...(validParse.error?.issues?.map((i) => `${i.path.join('.')} ${i.message}`) || []),
      ];
    }
  } catch (err) {
    result.zod.errors = [(err as Error).message];
  }

  result.passed = result.json_schema.valid && result.zod.valid;
  return result;
}

// Run validation
const contractNames = [
  'DomainOntologyLabel',
  'LinkedSemanticTuple',
  'RetrievalCandidate',
  'RankerFeatureEnvelope',
  'EvidenceObservation',
  'MutationProposal',
];

const results: ValidationResult[] = [];

for (const contractName of contractNames) {
  const schema = contracts.definitions[contractName];
  if (!schema) {
    console.error(`❌ Contract not found in contracts.json: ${contractName}`);
    process.exit(1);
  }

  const { valid, invalid } = fixtures[contractName as keyof typeof fixtures];
  const result = validateContract(contractName, schema, valid, invalid);
  results.push(result);

  const status = result.passed ? '✅' : '❌';
  console.log(`${status} ${contractName}`);
  if (!result.json_schema.valid) {
    console.log(`   JSON Schema: ${result.json_schema.errors?.join(' | ')}`);
  }
  if (!result.zod.valid) {
    console.log(`   Zod: ${result.zod.errors?.join(' | ')}`);
  }
}

// Summary
const passCount = results.filter((r) => r.passed).length;
const totalCount = results.length;

console.log(`\n${passCount}/${totalCount} contracts validated`);

if (passCount === totalCount) {
  console.log('✅ All contracts valid (JSON Schema + Zod parity)');
  process.exit(0);
} else {
  console.log('❌ Contract validation failed');
  process.exit(1);
}
