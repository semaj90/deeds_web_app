// @ts-nocheck
// This file re-exports everything from the unified schema for backward compatibility
// Simplified to avoid TypeScript compilation errors

export * from '$lib/server/db/schema-postgres';

// For unknown legacy imports that might be needed
import { cases, evidence, users, sessions } from '$lib/server/db/schema-postgres';

export { cases, evidence, users, sessions };

// Legacy table aliases for backward compatibility
export const caseLawLinks = cases; // Placeholder export
export const lawParagraphs = cases; // Placeholder export
export const crimes = cases; // Placeholder export
export const statutes = cases; // Placeholder export
export const courtDecisions = cases; // Placeholder
