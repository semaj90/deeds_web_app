import { cleanupTest: setupTest } from '$lib/test-utils/setup';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    DataIsolationLayer,
    canAccessTable,
    enforceTableAccess,
    getAllowedTablesForFeature,
    validateDataAccess,
} from './dataIsolation.js';
;

describe('DataIsolationLayer', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });

 let layer: DataIsolationLayer;

 beforeEach(() => {
 layer = new DataIsolationLayer();
 });

 describe('Data Store Access', () => {
 it('should get error-brain data store', () => {
 const store = layer.getErrorBrainStore();
 expect(store).toHaveProperty('errorBrainAnalyses');
 expect(store).toHaveProperty('errorBrainPatches');
 expect(store).toHaveProperty('errorBrainHistory');
 });

 it('should get legal-ai data store', () => {
 const store = layer.getLegalAiStore();
 expect(store).toHaveProperty('legalAiCitations');
 expect(store).toHaveProperty('legalAiAuthorities');
 expect(store).toHaveProperty('legalAiReports');
 });

 it('should not include other feature tables in error-brain store', () => {
 const store = layer.getErrorBrainStore();
 expect(store).not.toHaveProperty('legalAiCitations');
 expect(store).not.toHaveProperty('legalAiAuthorities');
 });

 it('should not include other feature tables in legal-ai store', () => {
 const store = layer.getLegalAiStore();
 expect(store).not.toHaveProperty('errorBrainAnalyses');
 expect(store).not.toHaveProperty('errorBrainPatches');
 });
 });

 describe('Access Control', () => {
 it('should allow error-brain to access error-brain tables', () => {
 expect(layer.canAccess('errorBrain', 'error_brain_analyses')).toBe(true);
 expect(layer.canAccess('errorBrain', 'error_brain_patches')).toBe(true);
 expect(layer.canAccess('errorBrain', 'error_brain_history')).toBe(true);
 });

 it('should allow legal-ai to access legal-ai tables', () => {
 expect(layer.canAccess('legalAi', 'legal_ai_citations')).toBe(true);
 expect(layer.canAccess('legalAi', 'legal_ai_authorities')).toBe(true);
 expect(layer.canAccess('legalAi', 'legal_ai_reports')).toBe(true);
 });

 it('should deny error-brain access to legal-ai tables', () => {
 expect(layer.canAccess('errorBrain', 'legal_ai_citations')).toBe(false);
 expect(layer.canAccess('errorBrain', 'legal_ai_authorities')).toBe(false);
 expect(layer.canAccess('errorBrain', 'legal_ai_reports')).toBe(false);
 });

 it('should deny legal-ai access to error-brain tables', () => {
 expect(layer.canAccess('legalAi', 'error_brain_analyses')).toBe(false);
 expect(layer.canAccess('legalAi', 'error_brain_patches')).toBe(false);
 expect(layer.canAccess('legalAi', 'error_brain_history')).toBe(false);
 });

 it('should deny access to non-existent tables', () => {
 expect(layer.canAccess('errorBrain', 'non_existent_table')).toBe(false);
 expect(layer.canAccess('legalAi', 'non_existent_table')).toBe(false);
 });
 });

 describe('Access Enforcement', () => {
 it('should allow valid access', () => {
 expect(() => {
 layer.enforceAccess('errorBrain', 'error_brain_analyses');
 }).not.toThrow();
 });

 it('should throw on invalid access', () => {
 expect(() => {
 layer.enforceAccess('errorBrain', 'legal_ai_citations');
 }).toThrow('Access denied');
 });

 it('should include feature and table in error message', () => {
 expect(() => {
 layer.enforceAccess('errorBrain', 'legal_ai_citations');
 }).toThrow(/errorBrain.*legal_ai_citations/);
 });
 });

 describe('Allowed Tables', () => {
 it('should get allowed tables for error-brain', () => {
 const tables = layer.getAllowedTables('errorBrain');
 expect(tables).toContain('error_brain_analyses');
 expect(tables).toContain('error_brain_patches');
 expect(tables).toContain('error_brain_history');
 expect(tables.length).toBe(3);
 });

 it('should get allowed tables for legal-ai', () => {
 const tables = layer.getAllowedTables('legalAi');
 expect(tables).toContain('legal_ai_citations');
 expect(tables).toContain('legal_ai_authorities');
 expect(tables).toContain('legal_ai_reports');
 expect(tables.length).toBe(3);
 });

 it('should not include other feature tables', () => {
 const errorBrainTables = layer.getAllowedTables('errorBrain');
 const legalAiTables = layer.getAllowedTables('legalAi');

 errorBrainTables.forEach((table) => {
 expect(legalAiTables).not.toContain(table);
 });
 });
 });

 describe('Table Feature Mapping', () => {
 it('should identify error-brain tables', () => {
 expect(layer.getTableFeature('error_brain_analyses')).toBe('errorBrain');
 expect(layer.getTableFeature('error_brain_patches')).toBe('errorBrain');
 expect(layer.getTableFeature('error_brain_history')).toBe('errorBrain');
 });

 it('should identify legal-ai tables', () => {
 expect(layer.getTableFeature('legal_ai_citations')).toBe('legalAi');
 expect(layer.getTableFeature('legal_ai_authorities')).toBe('legalAi');
 expect(layer.getTableFeature('legal_ai_reports')).toBe('legalAi');
 });

 it('should return null for non-existent tables', () => {
 expect(layer.getTableFeature('non_existent_table')).toBeNull();
 });
 });

 describe('Access Validation', () => {
 it('should validate valid access', () => {
 const result = layer.validateAccess('errorBrain', 'error_brain_analyses');
 expect(result.valid).toBe(true);
 expect(result.error).toBeUndefined();
 });

 it('should reject invalid access', () => {
 const result = layer.validateAccess('errorBrain', 'legal_ai_citations');
 expect(result.valid).toBe(false);
 expect(result.error).toBeDefined();
 expect(result.error).toContain('Access denied');
 });

 it('should include feature and table in error message', () => {
 const result = layer.validateAccess('errorBrain', 'legal_ai_citations');
 expect(result.error).toContain('errorBrain');
 expect(result.error).toContain('legal_ai_citations');
 });
 });

 describe('Configuration Access', () => {
 it('should get data store configuration', () => {
 const config = layer.getDataStoreConfig();
 expect(config).toHaveProperty('errorBrainAnalyses');
 expect(config).toHaveProperty('errorBrainPatches');
 expect(config).toHaveProperty('errorBrainHistory');
 expect(config).toHaveProperty('legalAiCitations');
 expect(config).toHaveProperty('legalAiAuthorities');
 expect(config).toHaveProperty('legalAiReports');
 });

 it('should get access control configuration', () => {
 const config = layer.getAccessControlConfig();
 expect(config).toHaveProperty('errorBrain');
 expect(config).toHaveProperty('legalAi');
 expect(config.errorBrain.allowedTables).toContain('error_brain_analyses');
 expect(config.legalAi.allowedTables).toContain('legal_ai_citations');
 });
 });

 describe('Helper Functions', () => {
 it('should check table access via helper', () => {
 expect(canAccessTable('errorBrain', 'error_brain_analyses')).toBe(true);
 expect(canAccessTable('errorBrain', 'legal_ai_citations')).toBe(false);
 });

 it('should enforce table access via helper', () => {
 expect(() => {
 enforceTableAccess('errorBrain', 'error_brain_analyses');
 }).not.toThrow();

 expect(() => {
 enforceTableAccess('errorBrain', 'legal_ai_citations');
 }).toThrow();
 });

 it('should get allowed tables via helper', () => {
 const tables = getAllowedTablesForFeature('errorBrain');
 expect(tables).toContain('error_brain_analyses');
 expect(tables.length).toBe(3);
 });

 it('should validate data access via helper', () => {
 const validResult = validateDataAccess('errorBrain', 'error_brain_analyses');
 expect(validResult.valid).toBe(true);

 const invalidResult = validateDataAccess('errorBrain', 'legal_ai_citations');
 expect(invalidResult.valid).toBe(false);
 });
 });

 describe('Data Isolation Properties', () => {
 it('should maintain isolation across multiple accesses', () => {
 // Error-brain should consistently access only its tables
 for (let i = 0; i < 10; i++) {
 expect(layer.canAccess('errorBrain', 'error_brain_analyses')).toBe(true);
 expect(layer.canAccess('errorBrain', 'legal_ai_citations')).toBe(false);
 }

 // Legal-ai should consistently access only its tables
 for (let i = 0; i < 10; i++) {
 expect(layer.canAccess('legalAi', 'legal_ai_citations')).toBe(true);
 expect(layer.canAccess('legalAi', 'error_brain_analyses')).toBe(false);
 }
 });

 it('should prevent cross-feature data access', () => {
 const errorBrainTables = layer.getAllowedTables('errorBrain');
 const legalAiTables = layer.getAllowedTables('legalAi');

 // Error-brain cannot access any legal-ai table
 legalAiTables.forEach((table) => {
 expect(layer.canAccess('errorBrain', table)).toBe(false);
 });
  
 errorBrainTables.forEach((table) => {
 expect(layer.canAccess('legalAi', table)).toBe(false);
 });
 });
 });
});

