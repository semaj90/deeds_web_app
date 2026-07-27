/**
 * Promotion Gate Authorization
 *
 * Enforces role-based access control for semantic contracts mutations.
 * Only PROMOTION_GATE role can promote predictions or approve ontology proposals.
 *
 * Usage:
 *   if (!requirePromotionGate(locals)) return json({ error: 'Unauthorized' }, { status: 403 });
 *   const promoted = authorizedPromotePrediction(prediction, locals.user.id.toString());
 */

import type { Locals } from '$lib/types';
import { json } from '@sveltejs/kit';

export const PROMOTION_GATE_ROLE = 'PROMOTION_GATE';
export const ONTOLOGY_APPROVER_ROLE = 'ONTOLOGY_APPROVER';

/**
 * Check if user has PROMOTION_GATE role (can promote domain predictions to canonical)
 */
export function canPromotePredictions(locals: Locals): boolean {
  if (!locals.user) return false;
  return locals.user.role === PROMOTION_GATE_ROLE || locals.user.role === 'admin';
}

/**
 * Check if user has ONTOLOGY_APPROVER role (can approve ontology proposals)
 */
export function canApproveOntology(locals: Locals): boolean {
  if (!locals.user) return false;
  return locals.user.role === ONTOLOGY_APPROVER_ROLE || locals.user.role === 'admin';
}

/**
 * Middleware guard: require PROMOTION_GATE role, return 403 if missing
 */
export function requirePromotionGate(locals: Locals): boolean {
  return canPromotePredictions(locals);
}

/**
 * Middleware guard: require ONTOLOGY_APPROVER role, return 403 if missing
 */
export function requireOntologyApprover(locals: Locals): boolean {
  return canApproveOntology(locals);
}

/**
 * Format authorized user ID for canonical mutations
 */
export function getAuthorizedBy(locals: Locals): string {
  if (!locals.user?.id) throw new Error('User not authenticated');
  return `user:${locals.user.id}`;
}
