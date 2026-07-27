/**
 * Contract Validation Fixtures
 *
 * Golden test cases for Phase 2 contract extensions.
 * Each fixture has:
 * - valid: passes all schema constraints
 * - invalid: fails in a specific, documented way
 * - edge_case: valid but near boundary conditions
 */

export const fixtures = {
  // Phase 1.5: Hierarchical Domain Ontology
  domainOntologyLabel: {
    valid: {
      database: {
        domain: 'database',
        canonical_label: 'database',
        tier: 'tier2_major',
        parent_domain: 'computer_science',
        keywords: ['database', 'sql', 'index', 'query', 'transaction', 'acid'],
        description: 'Database design, indexing, query optimization, schema design',
      },
      distributed_systems: {
        domain: 'distributed_systems',
        canonical_label: 'distributed',
        tier: 'tier2_major',
        parent_domain: 'computer_science',
        keywords: ['distributed', 'consensus', 'replication', 'fault_tolerance', 'quorum'],
        description: 'Distributed computing, consensus, replication, fault tolerance',
      },
      cuda_kernels: {
        domain: 'cuda_kernels',
        canonical_label: 'cuda_kernels',
        tier: 'tier3_specific',
        parent_domain: 'cuda',
        keywords: ['cuda', 'kernel', 'gpu', 'thread', 'block'],
        description: 'CUDA kernel programming and GPU computation',
      },
    },
    invalid: {
      bad_tier: {
        domain: 'database',
        canonical_label: 'database',
        tier: 'tier99_invalid',
        parent_domain: 'computer_science',
        keywords: [],
        description: 'Invalid tier',
      },
      missing_keywords: {
        domain: 'database',
        canonical_label: 'database',
        tier: 'tier2_major',
        parent_domain: null,
        // keywords missing
        description: 'Missing keywords',
      } as any,
      non_string_parent: {
        domain: 'database',
        canonical_label: 'database',
        tier: 'tier2_major',
        parent_domain: 123, // should be string | null
        keywords: ['sql'],
        description: 'Invalid parent type',
      } as any,
    },
    edge_case: {
      root_tier_with_null_parent: {
        domain: 'computer_science',
        canonical_label: 'computer_science',
        tier: 'tier1_root',
        parent_domain: null,
        keywords: ['computer', 'science', 'algorithms'],
        description: 'Root tier domain with null parent',
      },
      single_keyword: {
        domain: 'minimal',
        canonical_label: 'minimal',
        tier: 'tier3_specific',
        parent_domain: 'parent',
        keywords: ['x'],
        description: 'Minimal valid domain',
      },
    },
  },

  // Phase 2: Multi-Signal Evidence Linking
  linkedSemanticTuple: {
    valid: {
      high_confidence: {
        source_packet_key: 'ace:packet:auth-sessions-001',
        target_packet_key: 'ace:packet:auth-validation-001',
        evidence_lanes: {
          semantic: 0.95,
          lexical: 0.85,
          structural: 0.80,
          topology: 0.75,
          recency: 0.90,
        },
        combined_score: 0.85,
        created_at: '2026-07-27T12:00:00Z',
      },
      low_confidence: {
        source_packet_key: 'ace:packet:utils-string-001',
        target_packet_key: 'ace:packet:utils-array-001',
        evidence_lanes: {
          semantic: 0.25,
          lexical: 0.30,
          structural: 0.15,
          topology: 0.20,
          recency: 0.60,
        },
        combined_score: 0.30,
        created_at: '2026-07-26T12:00:00Z',
      },
    },
    invalid: {
      out_of_range_lane: {
        source_packet_key: 'ace:packet:a-001',
        target_packet_key: 'ace:packet:b-001',
        evidence_lanes: {
          semantic: 1.5, // exceeds 1.0
          lexical: 0.5,
          structural: 0.5,
          topology: 0.5,
          recency: 0.5,
        },
        combined_score: 0.5,
        created_at: '2026-07-27T12:00:00Z',
      } as any,
      invalid_packet_key: {
        source_packet_key: 'invalid-packet-key',
        target_packet_key: 'ace:packet:b-001',
        evidence_lanes: {
          semantic: 0.5,
          lexical: 0.5,
          structural: 0.5,
          topology: 0.5,
          recency: 0.5,
        },
        combined_score: 0.5,
        created_at: '2026-07-27T12:00:00Z',
      } as any,
      missing_lane: {
        source_packet_key: 'ace:packet:a-001',
        target_packet_key: 'ace:packet:b-001',
        evidence_lanes: {
          semantic: 0.5,
          lexical: 0.5,
          structural: 0.5,
          topology: 0.5,
          // recency missing
        } as any,
        combined_score: 0.5,
        created_at: '2026-07-27T12:00:00Z',
      } as any,
    },
    edge_case: {
      all_zeros: {
        source_packet_key: 'ace:packet:weak-001',
        target_packet_key: 'ace:packet:weak-002',
        evidence_lanes: {
          semantic: 0.0,
          lexical: 0.0,
          structural: 0.0,
          topology: 0.0,
          recency: 0.0,
        },
        combined_score: 0.0,
        created_at: '2026-07-27T12:00:00Z',
      },
      all_ones: {
        source_packet_key: 'ace:packet:strong-001',
        target_packet_key: 'ace:packet:strong-002',
        evidence_lanes: {
          semantic: 1.0,
          lexical: 1.0,
          structural: 1.0,
          topology: 1.0,
          recency: 1.0,
        },
        combined_score: 1.0,
        created_at: '2026-07-27T12:00:00Z',
      },
    },
  },

  // Phase 2: Ranked Retrieval Results
  retrievalCandidate: {
    valid: {
      top_ranked: {
        packet_key: 'ace:packet:auth-sessions-001',
        rank: 1,
        rrf_score: 0.98,
        evidence_signals: {
          semantic: 0.96,
          lexical: 0.89,
          structural: 0.85,
          topology: 0.82,
          recency: 0.92,
        },
        domain_boosts: { authentication: 1.5, security: 1.2 },
        matching_domains: ['authentication', 'security', 'backend'],
      },
      middle_ranked: {
        packet_key: 'ace:packet:utils-string-005',
        rank: 50,
        rrf_score: 0.45,
        evidence_signals: {
          semantic: 0.42,
          lexical: 0.48,
          structural: 0.50,
          topology: 0.40,
          recency: 0.55,
        },
        domain_boosts: {},
        matching_domains: ['utilities'],
      },
    },
    invalid: {
      rank_zero: {
        packet_key: 'ace:packet:test-001',
        rank: 0, // must be >= 1
        rrf_score: 0.5,
        evidence_signals: {
          semantic: 0.5,
          lexical: 0.5,
          structural: 0.5,
          topology: 0.5,
          recency: 0.5,
        },
        domain_boosts: {},
        matching_domains: [],
      } as any,
      negative_rrf: {
        packet_key: 'ace:packet:test-001',
        rank: 1,
        rrf_score: -0.5, // must be >= 0
        evidence_signals: {
          semantic: 0.5,
          lexical: 0.5,
          structural: 0.5,
          topology: 0.5,
          recency: 0.5,
        },
        domain_boosts: {},
        matching_domains: [],
      } as any,
    },
    edge_case: {
      rank_1_million: {
        packet_key: 'ace:packet:last-001',
        rank: 1000000,
        rrf_score: 0.001,
        evidence_signals: {
          semantic: 0.001,
          lexical: 0.001,
          structural: 0.001,
          topology: 0.001,
          recency: 0.001,
        },
        domain_boosts: { obscure: 0.5 },
        matching_domains: ['obscure'],
      },
    },
  },

  // Phase 2: Ranker Training Data
  rankerFeatureEnvelope: {
    valid: {
      highly_relevant: {
        query_id: 'query-auth-sessions-001',
        packet_key: 'ace:packet:auth-sessions-001',
        relevance_label: 3, // highly relevant
        features: {
          semantic_score: 0.94,
          bm25_score: 0.87,
          domain_entropy: 0.5,
          tree_node_distance: 1.0,
          page_rank_score: 0.75,
          recency_days: 0.5,
        },
      },
      irrelevant: {
        query_id: 'query-auth-sessions-001',
        packet_key: 'ace:packet:unrelated-utils-001',
        relevance_label: 0, // irrelevant
        features: {
          semantic_score: 0.12,
          bm25_score: 0.05,
          domain_entropy: 2.8,
          tree_node_distance: 5.0,
          page_rank_score: 0.1,
          recency_days: 3.0,
        },
      },
    },
    invalid: {
      label_out_of_range: {
        query_id: 'query-001',
        packet_key: 'ace:packet:test-001',
        relevance_label: 5, // max is 3
        features: {
          semantic_score: 0.5,
          bm25_score: 0.5,
          domain_entropy: 1.0,
          tree_node_distance: 1.0,
          page_rank_score: 0.5,
          recency_days: 1.0,
        },
      } as any,
      missing_feature: {
        query_id: 'query-001',
        packet_key: 'ace:packet:test-001',
        relevance_label: 2,
        features: {
          semantic_score: 0.5,
          bm25_score: 0.5,
          domain_entropy: 1.0,
          tree_node_distance: 1.0,
          page_rank_score: 0.5,
          // recency_days missing
        } as any,
      } as any,
    },
    edge_case: {
      all_max_scores: {
        query_id: 'query-perfect-001',
        packet_key: 'ace:packet:perfect-match-001',
        relevance_label: 3,
        features: {
          semantic_score: 1.0,
          bm25_score: 1.0,
          domain_entropy: 0.0,
          tree_node_distance: 0.0,
          page_rank_score: 1.0,
          recency_days: 0.0,
        },
      },
      all_min_scores: {
        query_id: 'query-terrible-001',
        packet_key: 'ace:packet:no-match-001',
        relevance_label: 0,
        features: {
          semantic_score: 0.0,
          bm25_score: 0.0,
          domain_entropy: 3.0,
          tree_node_distance: 10.0,
          page_rank_score: 0.0,
          recency_days: 10.0,
        },
      },
    },
  },

  // Phase 3: Proof Matrix Entry
  evidenceObservation: {
    valid: {
      semantic_embedding: {
        observation_id: 'obs:semantic-embedding-001',
        packet_key: 'ace:packet:auth-sessions-001',
        observation_type: 'semantic_embedding',
        evidence_lane: 'semantic',
        value: 0.95,
        confidence: 0.99,
        source: 'qdrant',
        observed_at: '2026-07-27T12:00:00Z',
        metadata: { model: 'embeddinggemma:latest', dim: 768, similarity_to_query: 0.94 },
      },
      identity_resolution: {
        observation_id: 'obs:identity-resolution-001',
        packet_key: 'ace:packet:auth-sessions-001',
        observation_type: 'identity_resolution',
        evidence_lane: 'identity',
        value: { source_ref: 'src/lib/server/auth.ts', feature_id: 'auth.sessions' },
        confidence: 1.0,
        source: 'postgres',
        observed_at: '2026-07-27T12:00:00Z',
      },
    },
    invalid: {
      bad_type: {
        observation_id: 'obs:test-001',
        packet_key: 'ace:packet:auth-001',
        observation_type: 'invalid_type', // not in enum
        evidence_lane: 'semantic',
        value: 0.5,
        confidence: 0.9,
        source: 'qdrant',
        observed_at: '2026-07-27T12:00:00Z',
      } as any,
      bad_confidence: {
        observation_id: 'obs:test-001',
        packet_key: 'ace:packet:auth-001',
        observation_type: 'semantic_embedding',
        evidence_lane: 'semantic',
        value: 0.5,
        confidence: 1.5, // out of range
        source: 'qdrant',
        observed_at: '2026-07-27T12:00:00Z',
      } as any,
    },
  },

  // Phase 3: Mutation Proposal
  mutationProposal: {
    valid: {
      domain_update: {
        proposal_id: 'mut:domain-update-001',
        packet_key: 'ace:packet:auth-sessions-001',
        mutation_type: 'domain_membership_update',
        changes: {
          domain_memberships: { authentication: 0.85, security: 0.15 },
          primary_domain: 'authentication',
          domain_confidence: 0.85,
        },
        justification: 'Semantic embedding and BM25 strongly indicate authentication domain',
        observations_supporting: ['obs:semantic-embedding-001', 'obs:lexical-bm25-001'],
        status: 'proposed',
        created_at: '2026-07-27T12:00:00Z',
      },
      identity_correction: {
        proposal_id: 'mut:identity-correction-001',
        packet_key: 'ace:packet:misclassified-001',
        mutation_type: 'identity_correction',
        changes: {
          source_ref: 'src/lib/server/auth.ts',
          feature_id: 'auth.validation',
        },
        justification: 'Original source_ref was incorrect based on AST analysis',
        observations_supporting: ['obs:structural-ast-001'],
        status: 'proposed',
        created_at: '2026-07-27T12:00:00Z',
      },
    },
    invalid: {
      bad_obs_id: {
        proposal_id: 'mut:domain-update-001',
        packet_key: 'ace:packet:auth-001',
        mutation_type: 'domain_membership_update',
        changes: { primary_domain: 'auth' },
        justification: 'Test',
        observations_supporting: ['invalid-obs-id'], // doesn't match regex
        status: 'proposed',
        created_at: '2026-07-27T12:00:00Z',
      } as any,
      missing_changes: {
        proposal_id: 'mut:domain-update-001',
        packet_key: 'ace:packet:auth-001',
        mutation_type: 'domain_membership_update',
        changes: {}, // empty changes
        justification: 'Test',
        observations_supporting: ['obs:semantic-embedding-001'],
        status: 'proposed',
        created_at: '2026-07-27T12:00:00Z',
      } as any,
    },
  },
};
