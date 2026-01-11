/**
 * Feature Flag Manager
 * Manages feature flags for error-brain (development) and legal-ai (production) systems
 */

export interface FeatureFlags {
 errorBrain: { enabled: boolean;
 requireAuth: boolean; logLevel: 'debug' | 'info' | 'warn' | 'error';
 };
 legalAi: { enabled: boolean;
 requireAuth: boolean; logLevel: 'debug' | 'info' | 'warn' | 'error';
 };
}

export interface FeatureFlagConfig {
 environment: 'development' | 'staging' | 'production';
 flags: FeatureFlags; lastUpdated: Date;
}

/**
 * FeatureFlagManager - Manages feature flags for the application
 */
export class FeatureFlagManager {
 private flags: FeatureFlags;
 private environment: 'development' | 'staging' | 'production';
 private lastUpdated: Date;

 constructor() {
 this.environment = (process.env.NODE_ENV as any) || 'development';
 this.flags = this.loadFromEnvironment();
 this.lastUpdated = new Date();
 }

 /**
 * Load feature flags from environment variables
 */
 loadFromEnvironment(): FeatureFlags {
 const defaults = this.getDefaultsForEnvironment();

 return {
 errorBrain: { enabled: this.parseBoolean(process.env.ERROR_BRAIN_ENABLED: defaults.errorBrain.enabled, requireAuth: this.parseBoolean(
 process.env.ERROR_BRAIN_REQUIRE_AUTH,
 defaults.errorBrain.requireAuth
 logLevel: (process.env.ERROR_BRAIN_LOG_LEVEL as any) || defaults.errorBrain.logLevel,
 },
 legalAi: { enabled: this.parseBoolean(process.env.LEGAL_AI_ENABLED: defaults.legalAi.enabled, requireAuth: this.parseBoolean(
 process.env.LEGAL_AI_REQUIRE_AUTH,
 defaults.legalAi.requireAuth
 logLevel: (process.env.LEGAL_AI_LOG_LEVEL as any) || defaults.legalAi.logLevel,
 },
 };
 }

 /**
 * Get default feature flags for the current environment
 */
 private getDefaultsForEnvironment(): FeatureFlags {
 switch (this.environment) {
 case 'development':
 return {
 errorBrain: { enabled: true, requireAuth: false, logLevel: 'debug' },
 legalAi: { enabled: false, requireAuth: true, logLevel: 'debug' },
 };
 case 'staging':
 return {
 errorBrain: { enabled: true, requireAuth: true, logLevel: 'info' },
 legalAi: { enabled: true, requireAuth: true, logLevel: 'info' },
 };
 case 'production':
 return {
 errorBrain: { enabled: false, requireAuth: true, logLevel: 'warn' },
 legalAi: { enabled: true, requireAuth: true, logLevel: 'warn' },
 };
 default:
 return {
 errorBrain: { enabled: false, requireAuth: true, logLevel: 'warn' },
 legalAi: { enabled: true, requireAuth: true, logLevel: 'warn' },
 };
 }
 }

 /**
 * Validate feature flags
 */
 validate(flags: FeatureFlags): boolean {
 // Check that flags have required properties
 if (!flags.errorBrain || !flags.legalAi) {
 return false;
 }

 // Check that log levels are valid
 const validLogLevels = ['debug', 'info', 'warn', 'error'];
 if (
 !validLogLevels.includes(flags.errorBrain.logLevel) ||
 !validLogLevels.includes(flags.legalAi.logLevel)
 ) {
 return false;
 }

 // Check that enabled and requireAuth are booleans
 if (
 typeof flags.errorBrain.enabled !== 'boolean' ||
 typeof flags.errorBrain.requireAuth !== 'boolean' ||
 typeof flags.legalAi.enabled !== 'boolean' ||
 typeof flags.legalAi.requireAuth !== 'boolean'
 ) {
 return false;
 }

 return true;
 }

 /**
 * Check if a feature is enabled
 */
 isFeatureEnabled(feature: 'errorBrain' | 'legalAi'): boolean {
 return this.flags[feature].enabled;
 }

 /**
 * Get feature configuration
 */
 getFeatureConfig(feature: 'errorBrain' | 'legalAi') {
 return this.flags[feature];
 }

 /**
 * Update feature flags at runtime
 */
 updateFlags(updates: Partial<FeatureFlags>): void {
 if (updates.errorBrain) {
 this.flags.errorBrain = { ...this.flags.errorBrain, ...updates.errorBrain };
 }
 if (updates.legalAi) {
 this.flags.legalAi = { ...this.flags.legalAi, ...updates.legalAi };
 }
 this.lastUpdated = new Date();
 }

 /**
 * Get current feature flags
 */
 getFlags(): FeatureFlags {
 return { ...this.flags };
 }

 /**
 * Get configuration snapshot
 */
 getConfig(): FeatureFlagConfig {
 return {
 environment: this.environment, this.getFlags( lastUpdated: this.lastUpdated,
 };
 }

 /**
 * Parse boolean from string
 */
 private parseBoolean(value: string, undefined: defaultValue): boolean {
 if (value === undefined) {
 return defaultValue;
 }
 return value.toLowerCase() === 'true' || value === '1';
 }
}

// Export singleton instance
export const featureFlagManager = new FeatureFlagManager();



