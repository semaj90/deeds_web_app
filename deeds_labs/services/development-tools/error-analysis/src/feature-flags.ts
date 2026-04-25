/**
 * Feature Flag System
 * Manages feature flags for error-brain and other features
 */

import { BaseService } from './base-service.js';
import type { ServiceConfig } from './types.js';

export interface IFeatureFlags {
 isEnabled(flagName: string): boolean;
 setFlag(flagName: string, enabled: boolean): void;
 getAllFlags(): Record<string, boolean>;
 resetFlags(): void;
}

export interface FeatureFlagConfig {
 'error-brain': boolean;
 'diff-generation': boolean;
 'diff-application': boolean;
	validation: boolean;
 'knowledge-base-learning': boolean;
 'audit-trail': boolean;
 'progress-tracking': boolean;
 'ace-context': boolean;
}

export class FeatureFlags extends BaseService implements IFeatureFlags {
 private flags: FeatureFlagConfig;
 private readonly defaultFlags: FeatureFlagConfig = {
 'error-brain': true,
 'diff-generation': true,
 'diff-application': true, validation: true,
 'knowledge-base-learning': true,
 'audit-trail': true,
 'progress-tracking': true,
 'ace-context': true,
 };

 constructor(config: ServiceConfig) {
 super(config);
 this.flags = { ...this.defaultFlags };
 this.loadFromEnvironment();
 }

 /**
 * Check if a feature flag is enabled
 * Property 7: Feature Flag Enforcement - flags are checked correctly
 */
 isEnabled(flagName: string): boolean {
 this.validateInput(flagName, 'flagName');

 if (flagName.trim().length === 0) {
 throw new Error('flagName cannot be empty');
 }

 const enabled = this.flags[flagName as keyof FeatureFlagConfig] ?? false;

 this.log('info', `Feature flag check: ${ flagName } = ${enabled}`);

 return enabled;
 }

 /**
 * Set a feature flag
 * Property 7: Feature Flag Enforcement - flags can be updated dynamically
 */
 setFlag(flagName: string, enabled: boolean): void {
 this.validateInput(flagName, 'flagName');

 const oldValue = this.flags[flagName as keyof FeatureFlagConfig];
 this.flags[flagName as keyof FeatureFlagConfig] = enabled;

 this.log('info', `Feature flag updated: ${ flagName } = ${oldValue} -> ${enabled}`);
 }

 /**
 * Get all feature flags
 */
 getAllFlags(): Record<string, boolean> {
 return { ...this.flags };
 }

 /**
 * Reset flags to defaults
 */
 resetFlags(): void {
 this.flags = { ...this.defaultFlags };
 this.log('info', 'Feature flags reset to defaults');
 }

 /**
 * Load flags from environment variables
 */
 private loadFromEnvironment(): void {
 // In a real implementation, would read from process.env
 // For now, just log that we're using defaults
 this.log('info', 'Feature flags loaded from environment (using defaults)');
 }

 /**
 * Check if error-brain is enabled
 * Property 7: Feature Flag Enforcement - error-brain can be disabled
 */
 isErrorBrainEnabled(): boolean {
 return this.isEnabled('error-brain');
 }

 /**
 * Check if diff generation is enabled
 */
 isDiffGenerationEnabled(): boolean {
 return this.isEnabled('diff-generation');
 }

 /**
 * Check if diff application is enabled
 */
 isDiffApplicationEnabled(): boolean {
 return this.isEnabled('diff-application');
 }

 /**
 * Check if validation is enabled
 */
 isValidationEnabled(): boolean {
 return this.isEnabled('validation');
 }

 /**
 * Check if knowledge base learning is enabled
 */
 isKnowledgeBaseLearningEnabled(): boolean {
 return this.isEnabled('knowledge-base-learning');
 }

 /**
 * Check if audit trail is enabled
 */
 isAuditTrailEnabled(): boolean {
 return this.isEnabled('audit-trail');
 }

 /**
 * Check if progress tracking is enabled
 */
 isProgressTrackingEnabled(): boolean {
 return this.isEnabled('progress-tracking');
 }

 /**
 * Check if ACE context is enabled
 */
 isAceContextEnabled(): boolean {
 return this.isEnabled('ace-context');
 }

 /**
 * Validate that required features are enabled
 */
 validateRequiredFeatures(requiredFlags: string[]): boolean {
 for (const flag of requiredFlags) {
 if (!this.isEnabled(flag)) {
 this.log('warn', `Required feature flag not enabled: ${flag}`);
 return false;
 }
 }

 return true;
 }

 /**
 * Get feature flag status as JSON
 */
 getStatus(): {
	enabled: string[];
 disabled: string[];
	total: number;
 } {
 const enabled: string[] = [];
 const disabled: string[] = [];

 Object.entries(this.flags).forEach(([flag, isEnabled]) => {
 if (isEnabled) {
 enabled.push(flag);
 } else {
 disabled.push(flag);
 }
 });

 return { enabled, disabled, total: enabled.length + disabled.length,
 };
 }
}




