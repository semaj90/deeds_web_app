import { describe, it, expect } from 'vitest';
import { TreeNodeIdentitySchema } from '$lib/schemas/tree_node_identity_schema.js';
import type { TreeNodeIdentity } from '$lib/schemas/tree_node_identity_schema.js';

/**
 * Phase 1: Identity Stability Tests
 *
 * Tests for TreeNodeIdentity schema validation and contract verification.
 * These tests verify the Zod schema contracts before database integration.
 */

describe('TreeNodeIdentity Schema Validation', () => {
  describe('valid identity', () => {
    it('accepts complete identity object', () => {
      const identity: TreeNodeIdentity = {
        tree_node_id: 'node:src/lib/auth:validateSession',
        directory_path: 'src/lib',
        source_ref: 'src/lib/auth.ts',
        file_path: '/workspace/src/lib/auth.ts',
        function_symbol: 'validateSession',
        node_type: 'function',
        domain_class: 'auth',
        community_id: 'auth-group-001',
        kmeans_cluster_id: 42,
        feature_id: 'feature:auth:sessions',
        feature_label: 'Authentication Sessions',
        source_hash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        corpus_snapshot_id: 'snapshot:2026-07-23-v1',
      };

      const result = TreeNodeIdentitySchema.safeParse(identity);
      expect(result.success).toBe(true);
    });

    it('accepts identity with nullable fields', () => {
      const identity = {
        tree_node_id: 'file:src/utils',
        directory_path: 'src',
        source_ref: 'src/utils/index.ts',
        file_path: '/workspace/src/utils/index.ts',
        function_symbol: null,
        node_type: 'file' as const,
        domain_class: null,
        community_id: null,
        kmeans_cluster_id: null,
        feature_id: null,
        feature_label: null,
        source_hash: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        corpus_snapshot_id: 'snapshot:2026-07-23-v1',
      };

      const result = TreeNodeIdentitySchema.safeParse(identity);
      expect(result.success).toBe(true);
    });
  });

  describe('validation failures', () => {
    it('rejects empty tree_node_id', () => {
      const identity = {
        tree_node_id: '',
        directory_path: 'src/lib',
        source_ref: 'src/lib/auth.ts',
        file_path: '/workspace/src/lib/auth.ts',
        function_symbol: 'validateSession',
        node_type: 'function' as const,
        domain_class: 'auth',
        community_id: null,
        kmeans_cluster_id: null,
        feature_id: 'feature:auth:sessions',
        feature_label: null,
        source_hash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        corpus_snapshot_id: 'snapshot:2026-07-23-v1',
      };

      const result = TreeNodeIdentitySchema.safeParse(identity);
      expect(result.success).toBe(false);
    });

    it('rejects negative kmeans_cluster_id', () => {
      const identity = {
        tree_node_id: 'node:src/lib/auth:validateSession',
        directory_path: 'src/lib',
        source_ref: 'src/lib/auth.ts',
        file_path: '/workspace/src/lib/auth.ts',
        function_symbol: 'validateSession',
        node_type: 'function' as const,
        domain_class: 'auth',
        community_id: null,
        kmeans_cluster_id: -1, // Invalid
        feature_id: 'feature:auth:sessions',
        feature_label: null,
        source_hash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        corpus_snapshot_id: 'snapshot:2026-07-23-v1',
      };

      const result = TreeNodeIdentitySchema.safeParse(identity);
      expect(result.success).toBe(false);
    });

    it('rejects short source_hash', () => {
      const identity = {
        tree_node_id: 'node:src/lib/auth:validateSession',
        directory_path: 'src/lib',
        source_ref: 'src/lib/auth.ts',
        file_path: '/workspace/src/lib/auth.ts',
        function_symbol: 'validateSession',
        node_type: 'function' as const,
        domain_class: 'auth',
        community_id: null,
        kmeans_cluster_id: null,
        feature_id: 'feature:auth:sessions',
        feature_label: null,
        source_hash: 'short', // Too short
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        corpus_snapshot_id: 'snapshot:2026-07-23-v1',
      };

      const result = TreeNodeIdentitySchema.safeParse(identity);
      expect(result.success).toBe(false);
    });

    it('rejects invalid node_type', () => {
      const identity = {
        tree_node_id: 'node:src/lib/auth:validateSession',
        directory_path: 'src/lib',
        source_ref: 'src/lib/auth.ts',
        file_path: '/workspace/src/lib/auth.ts',
        function_symbol: 'validateSession',
        node_type: 'invalid_type', // Invalid
        domain_class: 'auth',
        community_id: null,
        kmeans_cluster_id: null,
        feature_id: 'feature:auth:sessions',
        feature_label: null,
        source_hash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        corpus_snapshot_id: 'snapshot:2026-07-23-v1',
      };

      const result = TreeNodeIdentitySchema.safeParse(identity);
      expect(result.success).toBe(false);
    });

    it('rejects invalid datetime', () => {
      const identity = {
        tree_node_id: 'node:src/lib/auth:validateSession',
        directory_path: 'src/lib',
        source_ref: 'src/lib/auth.ts',
        file_path: '/workspace/src/lib/auth.ts',
        function_symbol: 'validateSession',
        node_type: 'function' as const,
        domain_class: 'auth',
        community_id: null,
        kmeans_cluster_id: null,
        feature_id: 'feature:auth:sessions',
        feature_label: null,
        source_hash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        created_at: 'not-a-datetime',
        updated_at: new Date().toISOString(),
        corpus_snapshot_id: 'snapshot:2026-07-23-v1',
      };

      const result = TreeNodeIdentitySchema.safeParse(identity);
      expect(result.success).toBe(false);
    });
  });

  describe('node type variants', () => {
    const baseIdentity = {
      directory_path: 'src/lib',
      source_ref: 'src/lib/auth.ts',
      file_path: '/workspace/src/lib/auth.ts',
      function_symbol: null,
      domain_class: null,
      community_id: null,
      kmeans_cluster_id: null,
      feature_id: 'feature:auth',
      feature_label: null,
      source_hash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      corpus_snapshot_id: 'snapshot:2026-07-23-v1',
    };

    const nodeTypes = ['file', 'function', 'module', 'subsystem', 'class', 'interface', 'enum'] as const;

    nodeTypes.forEach((nodeType) => {
      it(`accepts node_type: ${nodeType}`, () => {
        const identity = {
          tree_node_id: `${nodeType}:src/lib/test`,
          ...baseIdentity,
          node_type: nodeType,
        };

        const result = TreeNodeIdentitySchema.safeParse(identity);
        expect(result.success).toBe(true);
      });
    });
  });
});
