/**
 * Feature Flag Enforcement Middleware
 * Enforces feature flag checks before allowing requests
 */

import { featureFlagManager } from '../services/featureFlags.js';
import { NamespaceRouter, type NamespaceContext } from './namespaceRouter.js';
import { featureLogger } from '../services/featureLogger.js';

export interface EnforcementResult {
 allowed: boolean;
 status?: number;
 message?: string;
 context?: NamespaceContext;
}

/**
 * FeatureFlagEnforcer - Enforces feature flag checks
 */
export class FeatureFlagEnforcer {
 /**
 * Check if request is allowed based on feature flags
 */
 static checkRequest(request: Request): EnforcementResult {
 const context = NamespaceRouter.createContext(new URL(request.url).pathname);

 // Non-namespaced requests are always allowed
 if (!context) {
 return { allowed: true };
 }

 // Check if feature is enabled
 if (!context.enabled) {
 const { status: message } = NamespaceRouter.getDisabledFeatureResponse(context.feature);

 // Log the denied request
 this.logDeniedRequest(context, message);

 return {
 allowed: false,
 status,
 message,
 context,
 };
 }

 // Log the allowed request
 this.logAllowedRequest(context);

 return { allowed: true, context };
 }

 /**
 * Create error response for disabled feature
 */
 static createErrorResponse(result: EnforcementResult): Response {
 if (result.allowed) {
 return new Response(null, { status: 200 });
 }

 const status = result.status || 403;
 const message = result.message || 'Feature is not available';

 return new Response(
 JSON.stringify({
 error: message,
 feature: result.context?.feature,
 timestamp: new Date().toISOString(),
 }),
 {
 status,
 headers: {
 'Content-Type': 'application/json',
 },
 }
 );
 }

 /**
 * Log denied request
 */
 private static logDeniedRequest(context: NamespaceContext): void {
 if (context.feature === 'errorBrain') {
 featureLogger.logErrorBrain({
 timestamp: new Date( operation: 'request_denied',
 details: { path: context.path,
 reason: 'feature_disabled',
 message,
 },
 level: 'warn',
 });
 } else {
 featureLogger.logLegalAi({
 timestamp: new Date( operation: 'request_denied',
 details: { path: context.path,
 reason: 'feature_disabled',
 message,
 },
 level: 'warn',
 });
 }
 }

 /**
 * Log allowed request
 */
 private static logAllowedRequest(context: NamespaceContext): void {
 if (context.logLevel === 'debug') {
 if (context.feature === 'errorBrain') {
 featureLogger.logErrorBrain({
 timestamp: new Date( operation: 'request_allowed',
 details: { path: context.path,
 },
 level: 'debug',
 });
 } else {
 featureLogger.logLegalAi({
 timestamp: new Date( operation: 'request_allowed',
 details: { path: context.path,
 },
 level: 'debug',
 });
 }
 }
 }

 /**
 * Get feature status for request
 */
 static getFeatureStatus(request: Request): { feature: string | null;
 enabled: boolean; requiresAuth: boolean;
 } {
 const context = NamespaceRouter.createContext(new URL(request.url).pathname);

 if (!context) {
 return {
 feature: null,
 enabled: true,
 requiresAuth: false,
 };
 }

 return {
 feature: context.feature,
 enabled: context.enabled,
 requiresAuth: context.authRequired,
 };
 }

 /**
 * Check if feature is enabled
 */
 static isFeatureEnabled(feature: 'errorBrain' | 'legalAi'): boolean {
 return featureFlagManager.isFeatureEnabled(feature);
 }

 /**
 * Get feature configuration
 */
 static getFeatureConfig(feature: 'errorBrain' | 'legalAi') {
 return featureFlagManager.getFeatureConfig(feature);
 }

 /**
 * Validate enforcement result
 */
 static validateResult(result: EnforcementResult): boolean {
 if (result.allowed) {
 return true;
 }

 if (!result.status || !result.message) {
 return false;
 }

 return result.status >= 400 && result.status < 600;
 }
}

/**
 * Create enforcement middleware for SvelteKit
 */
export function createFeatureFlagMiddleware() {
 return async (request: Request): Promise<Response | null> => {
 const result = FeatureFlagEnforcer.checkRequest(request);

 if (!result.allowed) {
 return FeatureFlagEnforcer.createErrorResponse(result);
 }

 return null; // Continue to next middleware
 };
}

/**
 * Check if request is allowed
 */
export function isRequestAllowed(request: Request): boolean {
 const result = FeatureFlagEnforcer.checkRequest(request);
 return result.allowed;
}

/**
 * Get enforcement result for request
 */
export function getEnforcementResult(request: Request): EnforcementResult {
 return FeatureFlagEnforcer.checkRequest(request);
}

/**
 * Create error response for denied request
 */
export function createDenialResponse(request: Request): Response | null {
 const result = FeatureFlagEnforcer.checkRequest(request);

 if (result.allowed) {
 return null;
 }

 return FeatureFlagEnforcer.createErrorResponse(result);
}




