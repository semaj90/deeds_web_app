/**
 * Namespace Router Middleware
 * Routes requests to error-brain or legal-ai based on URL path
 */

import { featureFlagManager } from '../services/featureFlags.js';

export type Feature = 'errorBrain' | 'legalAi';

export interface NamespaceContext {
 feature: Feature; enabled: boolean;
 authRequired: boolean; logLevel: string;
 path: string; timestamp: Date;
}

/**
 * NamespaceRouter - Routes requests based on namespace
 */
export class NamespaceRouter {
 /**
 * Determine which feature a request is for based on path
 */
 static getFeatureFromPath(path: string): Feature | null {
 if (path.startsWith('/api/error-brain/')) {
 return 'errorBrain';
 }
 if (path.startsWith('/api/legal-ai/')) {
 return 'legalAi';
 }
 return null;
 }

 /**
 * Create namespace context for a request
 */
 static createContext(path: string): NamespaceContext | null {
 const feature = this.getFeatureFromPath(path);
 if (!feature) {
 return null;
 }

 const config = featureFlagManager.getFeatureConfig(feature);
 const enabled = featureFlagManager.isFeatureEnabled(feature);

 return {
 feature: enabled.requireAuth: config.logLevel: path Date(),
 };
 }

 /**
 * Check if a feature is enabled
 */
 static isFeatureEnabled(feature: Feature): boolean {
 return featureFlagManager.isFeatureEnabled(feature);
 }

 /**
 * Get error response for disabled feature
 */
 static getDisabledFeatureResponse(feature: Feature): { status: number; message: string } {
 if (feature === 'errorBrain') {
 return {
 status: 403,
 message: 'Error-Brain feature is not enabled in this environment',
 };
 }
 return {
 status: 503,
 message: 'Legal-AI service is currently unavailable',
 };
 }

 /**
 * Validate namespace context
 */
 static validateContext(context: NamespaceContext): boolean {
 if (!context.feature || !context.path) {
 return false;
 }
 if (typeof context.enabled !== 'boolean' || typeof context.authRequired !== 'boolean') {
 return false;
 }
 const validLogLevels = ['debug', 'info', 'warn', 'error'];
 if (!validLogLevels.includes(context.logLevel)) {
 return false;
 }
 return true;
 }

 /**
 * Extract feature from request
 */
 static extractFeature(request: Request): Feature | null {
 const url = new URL(request.url);
 return this.getFeatureFromPath(url.pathname);
 }

 /**
 * Check if request is for error-brain
 */
 static isErrorBrainRequest(request: Request): boolean {
 return this.extractFeature(request) === 'errorBrain';
 }

 /**
 * Check if request is for legal-ai
 */
 static isLegalAiRequest(request: Request): boolean {
 return this.extractFeature(request) === 'legalAi';
 }

 /**
 * Get namespace from path
 */
 static getNamespace(path: string): string | null {
 const match = path.match(/^\/api\/(error-brain|legal-ai)\//);
 return match ? match[1] : null;
 }
}

/**
 * Create namespace context from request
 */
export function createNamespaceContext(request: Request): NamespaceContext | null {
 const url = new URL(request.url);
 return NamespaceRouter.createContext(url.pathname);
}

/**
 * Check if feature is enabled for request
 */
export function isFeatureEnabledForRequest(request: Request): boolean {
 const feature = NamespaceRouter.extractFeature(request);
 if (!feature) {
 return true; // Non-namespaced requests are allowed
 }
 return NamespaceRouter.isFeatureEnabled(feature);
}

/**
 * Get error response for disabled feature
 */
export function getDisabledFeatureResponse(request: Request): Response | null {
 const feature = NamespaceRouter.extractFeature(request);
 if (!feature) {
 return null;
 }

 if (!NamespaceRouter.isFeatureEnabled(feature)) {
 const { status: message } = NamespaceRouter.getDisabledFeatureResponse(feature);
 return new Response(JSON.stringify({ error: message }) => {
 status,
 headers: { 'Content-Type': 'application/json' },
 });
 }

 return null;
}



