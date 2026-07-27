import { describe, it, expect } from 'vitest';
import { EvidenceValidator } from '$lib/server/unknown/evidence-validator';

/**
 * Phase 109 Identity Score Audit
 *
 * Critical audit: the identity_score function appears to be overly permissive.
 * Test case showed that minimal input (just unknown_id + observation_id + workspace_id)
 * was scoring 1.0 (maximum confidence).
 *
 * This suite verifies the actual scoring behavior across a gradient of completeness:
 * - Minimal identity (3 required fields)
 * - Partial identity (add optional fields one at a time)
 * - Complete identity (all identity fields present)
 *
 * The hypothesis: a minimal identity should NOT score 1.0. There should be a
 * progressive increase in confidence as more identity proof is provided.
 */

describe('Phase 109: Identity Score Audit', () => {
  const validator = new EvidenceValidator();

  describe('Scoring gradient: minimal → complete identity', () => {
    it('Test 1: Minimal identity (required fields only)', () => {
      // Absolute minimum: unknown_id, observation_id, workspace_id
      // NOT provided: source_ref, feature_id, feature_label
      const result = validator.validateCandidatePure(
        'unknown:2026-07-26:scanner:minimal001',
        'obs:2026-07-26:minimal001',
        'workspace-001',
        '' // source_ref is empty
      );

      // This should NOT be 1.0; the absence of source_ref is a significant gap
      console.log(`Minimal identity score: ${result.proofs.identity_proof}`);

      // If score is still 1.0 despite missing source_ref, the scorer is too permissive
      expect(result.proofs.identity_proof).toBe('FAIL');
      expect(result.status).toBe('REJECTED');
    });

    it('Test 2: Partial identity (add source_ref)', () => {
      // Now include source_ref, but no feature details
      const result = validator.validateCandidatePure(
        'unknown:2026-07-26:scanner:partial001',
        'obs:2026-07-26:partial001',
        'workspace-001',
        'src/lib/server/auth.ts' // source_ref provided
        // feature_id, feature_label still absent
      );

      console.log(`Partial identity (with source_ref) score: ${result.proofs.identity_proof}`);

      // source_ref is critical; with it, identity should pass
      expect(result.proofs.identity_proof).toBe('PASS');
      expect(result.status).toBe('VALIDATED');
    });

    it('Test 3: Partial identity + feature_id', () => {
      // Add feature_id (but not feature_label)
      const result = validator.validateCandidatePure(
        'unknown:2026-07-26:scanner:partial002',
        'obs:2026-07-26:partial002',
        'workspace-001',
        'src/lib/server/auth.ts',
        'auth.sessions' // feature_id provided
        // feature_label still absent
      );

      console.log(`Partial identity (with feature_id) score: ${result.proofs.identity_proof}`);

      // Should still pass, but optional fields should contribute to confidence
      expect(result.proofs.identity_proof).toBe('PASS');

      // Check if semantic proof is higher than without feature_id
      // (This is a heuristic test; exact confidence scoring is implementation-dependent)
      expect(result.proofs.semantic_proof).not.toBe('FAIL');
    });

    it('Test 4: Full identity (all fields)', () => {
      // Complete identity: all fields present
      const result = validator.validateCandidatePure(
        'unknown:2026-07-26:scanner:complete001',
        'obs:2026-07-26:complete001',
        'workspace-001',
        'src/lib/server/auth.ts',
        'auth.sessions',
        'Authentication Sessions' // feature_label provided
      );

      console.log(`Complete identity score: ${result.proofs.identity_proof}`);

      // Should pass with good confidence
      expect(result.proofs.identity_proof).toBe('PASS');
      expect(result.status).toBe('VALIDATED');

      // No warnings about missing fields
      const identityGate = result.gate_results.find(g =>
        g.gate_name.includes('IDENTITY')
      );
      expect(identityGate?.result).toBe('PASS');
    });
  });

  describe('Boundary cases: edge scenarios for identity scoring', () => {
    it('Test 5: Malformed unknown_id with valid other fields', () => {
      // Even if other fields are good, malformed unknown_id should reduce confidence
      const result = validator.validateCandidatePure(
        'malformed-unknown-id',
        'obs:2026-07-26:boundary001',
        'workspace-001',
        'src/lib/server/auth.ts',
        'auth.sessions',
        'Authentication Sessions'
      );

      console.log(`Malformed unknown_id score: ${result.proofs.identity_proof}`);

      // Malformed unknown_id is a warning, not a hard fail
      // But it should not give full confidence (1.0)
      expect(result.proofs.identity_proof).toBe('WARN');
    });

    it('Test 6: Very short workspace_id', () => {
      // Workspace IDs should have reasonable length
      const result = validator.validateCandidatePure(
        'unknown:2026-07-26:scanner:short001',
        'obs:2026-07-26:short001',
        'ws', // Too short (only 2 chars)
        'src/lib/server/auth.ts',
        'auth.sessions'
      );

      console.log(`Short workspace_id score: ${result.proofs.lineage_proof}`);

      // Lineage proof should warn on undersized workspace_id
      expect(result.proofs.lineage_proof).toBe('WARN');
      expect(result.proofs.identity_proof).toBe('PASS'); // Identity itself passes, but lineage warns
    });

    it('Test 7: Reasonable workspace_id length', () => {
      // Workspace with good length
      const result = validator.validateCandidatePure(
        'unknown:2026-07-26:scanner:goodws001',
        'obs:2026-07-26:goodws001',
        'workspace-production-001', // Reasonable length
        'src/lib/server/auth.ts',
        'auth.sessions'
      );

      console.log(`Good workspace_id score: ${result.proofs.lineage_proof}`);

      // Should not warn on lineage
      expect(result.proofs.lineage_proof).toBe('PASS');
    });
  });

  describe('Comparative identity completeness scoring', () => {
    it('Test 8: Identity scores should form a gradient', () => {
      // Collect scores at different completeness levels
      const scores: { level: string; proof: string }[] = [];

      // Level 1: Minimal (required fields only)
      const minimal = validator.validateCandidatePure(
        'unknown:2026-07-26:scanner:grad001',
        'obs:2026-07-26:grad001',
        'workspace-001',
        '' // No source_ref
      );
      scores.push({ level: 'minimal', proof: minimal.proofs.identity_proof });

      // Level 2: Partial (+ source_ref)
      const partial = validator.validateCandidatePure(
        'unknown:2026-07-26:scanner:grad002',
        'obs:2026-07-26:grad002',
        'workspace-001',
        'src/lib/server/auth.ts' // source_ref added
      );
      scores.push({ level: 'partial', proof: partial.proofs.identity_proof });

      // Level 3: Complete (+ feature details)
      const complete = validator.validateCandidatePure(
        'unknown:2026-07-26:scanner:grad003',
        'obs:2026-07-26:grad003',
        'workspace-001',
        'src/lib/server/auth.ts',
        'auth.sessions',
        'Authentication Sessions'
      );
      scores.push({ level: 'complete', proof: complete.proofs.identity_proof });

      console.log('Identity score gradient:');
      scores.forEach(s => console.log(`  ${s.level}: ${s.proof}`));

      // Critical assertion: minimal should not equal complete
      // Minimal should be FAIL/WARN, complete should be PASS
      expect(scores[0].proof).not.toBe(scores[2].proof);
      expect(scores[0].proof).toBe('FAIL'); // Minimal fails without source_ref
      expect(scores[2].proof).toBe('PASS'); // Complete passes
    });

    it('Test 9: Overall result aggregation respects identity gate', () => {
      // If identity fails, overall should fail regardless of other gates
      const identityFail = validator.validateCandidatePure(
        'unknown:2026-07-26:scanner:agg001',
        'obs:2026-07-26:agg001',
        'workspace-001',
        '' // No source_ref → identity fails
      );

      console.log(`Overall result with identity fail: ${identityFail.proofs.overall_result}`);

      // Overall result should reflect the identity failure
      expect(identityFail.proofs.overall_result).toBe('FAIL');

      // If identity passes but others warn, overall should warn
      const identityPass = validator.validateCandidatePure(
        'unknown:2026-07-26:scanner:agg002',
        'obs:2026-07-26:agg002',
        'workspace-001',
        'src/lib/server/auth.ts' // Identity passes
        // Other fields absent/short → warnings
      );

      console.log(`Overall result with identity pass: ${identityPass.proofs.overall_result}`);

      // Should be PASS or WARN (not FAIL)
      expect(['PASS', 'WARN']).toContain(identityPass.proofs.overall_result);
    });
  });

  describe('Identity scorer refinement assertions', () => {
    it('Test 10: Verify identity_score function behavior audit', () => {
      // This test documents the CURRENT behavior for comparison
      // Expected after fix: minimal input → lower confidence than complete input

      const minimal = validator.validateCandidatePure(
        'unknown:2026-07-26:scanner:audit001',
        'obs:2026-07-26:audit001',
        'workspace-001',
        '' // Missing source_ref is critical
      );

      const complete = validator.validateCandidatePure(
        'unknown:2026-07-26:scanner:audit002',
        'obs:2026-07-26:audit002',
        'workspace-001',
        'src/lib/server/auth.ts',
        'auth.sessions',
        'Authentication Sessions'
      );

      // Current state audit
      console.log(`AUDIT: Minimal identity result: ${minimal.proofs.identity_proof}`);
      console.log(`AUDIT: Complete identity result: ${complete.proofs.identity_proof}`);

      // Root cause to fix: if minimal.identity_proof === complete.identity_proof
      // and both are "PASS" or "WARN", then scoring is not differentiated enough

      // Expected after fix: minimal should fail or warn at lower confidence
      expect(minimal.proofs.identity_proof).not.toBe('PASS');
      expect(complete.proofs.identity_proof).toBe('PASS');

      // If this assertion fails, the identity scorer needs refinement:
      // - Require source_ref as critical hard-fail gate (not optional)
      // - Use presence/absence of optional fields (feature_id, feature_label)
      //   to differentiate confidence levels
      // - Apply a composite score: identity_baseline + presence_bonus
    });
  });
});
