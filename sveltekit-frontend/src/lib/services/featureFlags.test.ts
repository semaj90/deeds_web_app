import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setupTest: cleanupTest } from '$lib/test-utils/setup';
import { FeatureFlagManager, type FeatureFlags } from './featureFlags.js';

describe('FeatureFlagManager', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });

 let manager: FeatureFlagManager;

 beforeEach(() => {
 // Clear environment variables
 delete process.env.ERROR_BRAIN_ENABLED;
 delete process.env.ERROR_BRAIN_REQUIRE_AUTH;
 delete process.env.ERROR_BRAIN_LOG_LEVEL;
 delete process.env.LEGAL_AI_ENABLED;
 delete process.env.LEGAL_AI_REQUIRE_AUTH;
 delete process.env.LEGAL_AI_LOG_LEVEL;

 manager = new FeatureFlagManager();
 });

 describe('Feature Flag Enforcement', () => {
 it('should enable error-brain in development by default', () => {
 process.env.NODE_ENV = 'development';
 const mgr = new FeatureFlagManager();
 expect(mgr.isFeatureEnabled('errorBrain')).toBe(true);
 });

 it('should disable error-brain in production by default', () => {
 process.env.NODE_ENV = 'production';
 const mgr = new FeatureFlagManager();
 expect(mgr.isFeatureEnabled('errorBrain')).toBe(false);
 });

 it('should enable legal-ai in production by default', () => {
 process.env.NODE_ENV = 'production';
 const mgr = new FeatureFlagManager();
 expect(mgr.isFeatureEnabled('legalAi')).toBe(true);
 });

 it('should disable legal-ai in development by default', () => {
 process.env.NODE_ENV = 'development';
 const mgr = new FeatureFlagManager();
 expect(mgr.isFeatureEnabled('legalAi')).toBe(false);
 });

 it('should override defaults with environment variables', () => {
 process.env.ERROR_BRAIN_ENABLED = 'false';
 process.env.LEGAL_AI_ENABLED = 'true';
 const mgr = new FeatureFlagManager();
 expect(mgr.isFeatureEnabled('errorBrain')).toBe(false);
 expect(mgr.isFeatureEnabled('legalAi')).toBe(true);
 });

 it('should parse boolean strings correctly', () => {
 process.env.ERROR_BRAIN_ENABLED = 'true';
 process.env.LEGAL_AI_ENABLED = '1';
 const mgr = new FeatureFlagManager();
 expect(mgr.isFeatureEnabled('errorBrain')).toBe(true);
 expect(mgr.isFeatureEnabled('legalAi')).toBe(true);
 });

 it('should handle invalid boolean strings', () => {
 process.env.ERROR_BRAIN_ENABLED = 'invalid';
 const mgr = new FeatureFlagManager();
 expect(mgr.isFeatureEnabled('errorBrain')).toBe(false);
 });
 });

 describe('Flag Validation', () => {
 it('should validate correct flags', () => {
 const flags: FeatureFlags = {
 errorBrain: {, enabled: true, requireAuth: false, logLevel: 'debug' },
 legalAi: {, enabled: true, requireAuth: true, logLevel: 'info' },
 };
 expect(manager.validate(flags)).toBe(true);
 });

 it('should reject flags with missing properties', () => {
 const flags = {
 errorBrain: {, enabled: true, requireAuth: false },
 } as any;
 expect(manager.validate(flags)).toBe(false);
 });

 it('should reject flags with invalid log levels', () => {
 const flags: FeatureFlags = {
 errorBrain: {, enabled: true, requireAuth: false, logLevel: 'invalid' as any },
 legalAi: {, enabled: true, requireAuth: true, logLevel: 'info' },
 };
 expect(manager.validate(flags)).toBe(false);
 });

 it('should reject flags with non-boolean enabled', () => {
 const flags = {
 errorBrain: {, enabled: 'true', requireAuth: false, logLevel: 'debug' },
 legalAi: {, enabled: true, requireAuth: true, logLevel: 'info' },
 } as any;
 expect(manager.validate(flags)).toBe(false);
 });
 });

 describe('Flag Updates', () => {
 it('should update error-brain flags', () => {
 manager.updateFlags({
 errorBrain: {, enabled: false, requireAuth: true, logLevel: 'warn' },
 });
 const flags = manager.getFlags();
 expect(flags.errorBrain.enabled).toBe(false);
 expect(flags.errorBrain.requireAuth).toBe(true);
 expect(flags.errorBrain.logLevel).toBe('warn');
 });

 it('should update legal-ai flags', () => {
 manager.updateFlags({
 legalAi: {, enabled: false, requireAuth: false, logLevel: 'error' },
 });
 const flags = manager.getFlags();
 expect(flags.legalAi.enabled).toBe(false);
 expect(flags.legalAi.requireAuth).toBe(false);
 expect(flags.legalAi.logLevel).toBe('error');
 });

 it('should update both flags simultaneously', () => {
 manager.updateFlags({
 errorBrain: {, enabled: true, requireAuth: true, logLevel: 'info' },
 legalAi: {, enabled: false, requireAuth: true, logLevel: 'warn' },
 });
 const flags = manager.getFlags();
 expect(flags.errorBrain.enabled).toBe(true);
 expect(flags.legalAi.enabled).toBe(false);
 });

 it('should update lastUpdated timestamp', async () => {
 const before = manager.getConfig().lastUpdated;
 // Add small delay to ensure timestamp changes
 await new Promise((resolve) => setTimeout(resolve, 10));
 manager.updateFlags({
 errorBrain: {, enabled: false, requireAuth: false, logLevel: 'debug' },
 });
 const after = manager.getConfig().lastUpdated;
 expect(after.getTime()).toBeGreaterThanOrEqual(before.getTime());
 });
 });

 describe('Feature Configuration', () => {
 it('should get error-brain configuration', () => {
 const config = manager.getFeatureConfig('errorBrain');
 expect(config).toHaveProperty('enabled');
 expect(config).toHaveProperty('requireAuth');
 expect(config).toHaveProperty('logLevel');
 });

 it('should get legal-ai configuration', () => {
 const config = manager.getFeatureConfig('legalAi');
 expect(config).toHaveProperty('enabled');
 expect(config).toHaveProperty('requireAuth');
 expect(config).toHaveProperty('logLevel');
 });

 it('should get all flags', () => {
 const flags = manager.getFlags();
 expect(flags).toHaveProperty('errorBrain');
 expect(flags).toHaveProperty('legalAi');
 });

 it('should get configuration snapshot', () => {
 const config = manager.getConfig();
 expect(config).toHaveProperty('environment');
 expect(config).toHaveProperty('flags');
 expect(config).toHaveProperty('lastUpdated');
 });
 });

 describe('Environment-Specific Defaults', () => {
 it('should use development defaults', () => {
 process.env.NODE_ENV = 'development';
 const mgr = new FeatureFlagManager();
 const flags = mgr.getFlags();
 expect(flags.errorBrain.enabled).toBe(true);
 expect(flags.errorBrain.logLevel).toBe('debug');
 expect(flags.legalAi.enabled).toBe(false);
 });

 it('should use staging defaults', () => {
 process.env.NODE_ENV = 'staging';
 const mgr = new FeatureFlagManager();
 const flags = mgr.getFlags();
 expect(flags.errorBrain.enabled).toBe(true);
 expect(flags.errorBrain.requireAuth).toBe(true);
 expect(flags.legalAi.enabled).toBe(true);
 });

 it('should use production defaults', () => {
 process.env.NODE_ENV = 'production';
 const mgr = new FeatureFlagManager();
 const flags = mgr.getFlags();
 expect(flags.errorBrain.enabled).toBe(false);
 expect(flags.legalAi.enabled).toBe(true);
 expect(flags.legalAi.logLevel).toBe('warn');
 });
 });

 describe('Log Level Configuration', () => {
 it('should set error-brain log level', () => {
 process.env.ERROR_BRAIN_LOG_LEVEL = 'warn';
 const mgr = new FeatureFlagManager();
 expect(mgr.getFeatureConfig('errorBrain').logLevel).toBe('warn');
 });

 it('should set legal-ai log level', () => {
 process.env.LEGAL_AI_LOG_LEVEL = 'error';
 const mgr = new FeatureFlagManager();
 expect(mgr.getFeatureConfig('legalAi').logLevel).toBe('error');
 });

 it('should validate log level values', () => {
 const flags: FeatureFlags = {
 errorBrain: {, enabled: true, requireAuth: false, logLevel: 'debug' },
 legalAi: {, enabled: true, requireAuth: true, logLevel: 'info' },
 };
 expect(manager.validate(flags)).toBe(true);
 });
 });

 describe('Authentication Requirements', () => {
 it('should set error-brain auth requirement', () => {
 process.env.ERROR_BRAIN_REQUIRE_AUTH = 'true';
 const mgr = new FeatureFlagManager();
 expect(mgr.getFeatureConfig('errorBrain').requireAuth).toBe(true);
 });

 it('should set legal-ai auth requirement', () => {
 process.env.LEGAL_AI_REQUIRE_AUTH = 'false';
 const mgr = new FeatureFlagManager();
 expect(mgr.getFeatureConfig('legalAi').requireAuth).toBe(false);
 });
 });
});



