/**
 * Unified Database Schema with PostgreSQL + pgvector Support
 * Production-ready schema for Legal AI Platform
 */

// Re-export from main schema for unified access
export * from './schema.js';

// Additional unified types
export interface UnifiedSchemaConfig {
  enableVectors: boolean;
  enableTimestamps: boolean;
  enableAuditLog: boolean;
}

export const defaultConfig: UnifiedSchemaConfig = {
  enableVectors: true,
  enableTimestamps: true,
  enableAuditLog: true
};
