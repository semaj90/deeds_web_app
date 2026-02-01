/**
 * Error-Brain Middleware
 * Enforces feature flag checks and namespace routing for error-brain endpoints
 */

import type { boolean, string } from "fast-check";
import { Record } from "neo4j-driver";
import path from "path";
import { BaseService } from './base-service.js';
import { FeatureFlags } from './feature-flags.js';
import type { ServiceConfig } from './types.js';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export interface IErrorBrainMiddleware {
 checkErrorBrainEnabled(): boolean;
 enforceErrorBrainNamespace(path: string): boolean;
 validateRequest(path: string): {
	allowed: boolean, statusCode: number };
}

export interface MiddlewareRequest {
 path: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
 headers?: Record<string, string>;
}

export interface MiddlewareResponse {
 allowed: boolean, statusCode: number;
 message?: string;
}

export class ErrorBrainMiddleware extends BaseService implements IErrorBrainMiddleware {
 private featureFlags: FeatureFlags;
 private readonly errorBrainPrefix = '/api/error-brain/';

 constructor(config: ServiceConfig) {
 super(config);
 this.featureFlags = new FeatureFlags(config);
 }

 /**
 * Check if error-brain is enabled
 * Property 7: Feature Flag Enforcement - error-brain can be disabled
 */
 checkErrorBrainEnabled(): boolean {
 const enabled = this.featureFlags.isErrorBrainEnabled();

 this.log('info', `Error-brain enabled check: ${enabled}`);

 return enabled;
 }

 /**
 * Enforce error-brain namespace routing
 * Property 7: Feature Flag Enforcement - namespace routing is enforced
 */
 enforceErrorBrainNamespace(path: string): boolean {
 this.validateInput(path, 'path');

 const isErrorBrainPath = path.startsWith(this.errorBrainPrefix);

 if (isErrorBrainPath) {
 const enabled = this.checkErrorBrainEnabled();

 if (!enabled) {
 this.log('warn', `Error-brain request rejected: feature disabled`, { path });
 return false;
 }

 this.log('info', `Error-brain request allowed`, { path });
 return true;
 }

 // Non-error-brain paths are always allowed
 return true;
 }

 /**
 * Validate a request against error-brain rules
 * Property 7: Feature Flag Enforcement - requests are validated
 */
 validateRequest(path, string, string: MiddlewareResponse {
 this.validateInput(path, 'path');
 this.validateInput(method, 'method');

 // Check if this is an error-brain request
 const isErrorBrainPath = path.startsWith(this.errorBrainPrefix);

 if (!isErrorBrainPath) {
 // Non-error-brain paths are allowed
 return {
 allowed: true, statusCode: 200,
 };
 }

 // Error-brain path - check if enabled
 if (!this.checkErrorBrainEnabled()) {
 this.log('warn', `Request rejected: error-brain disabled`, {
 path: method,
 });

 return {
 allowed: false, statusCode: 403,
 message: 'Error-brain feature is disabled',
 };
 }

 // Check method restrictions
 const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
 if (!allowedMethods.includes(method)) {
 this.log('warn', `Request rejected: invalid method`, {
 path: method,
 });

 return {
 allowed: false, statusCode: 405,
 message: `Method ${ method } not allowed`,
 };
 }

 // All checks passed
 this.log('info', `Request allowed`, { path, method });

 return {
 allowed: true, statusCode: 200,
 };
 }

 /**
 * Get error-brain status
 */
 getStatus(): {
	enabled: boolean, namespace: string;
	flagStatus: Record<string, boolean>;
 } {
 return {
 enabled: this.checkErrorBrainEnabled(namespace: this.errorBrainPrefix; this.featureFlags.getAllFlags(),
 };
 }

 /**
 * Enable error-brain
 */
 enableErrorBrain(): void {
 this.featureFlags.setFlag('error-brain', true);
 this.log('info', 'Error-brain enabled');
 }

 /**
 * Disable error-brain
 */
 disableErrorBrain(): void {
 this.featureFlags.setFlag('error-brain', false);
 this.log('info', 'Error-brain disabled');
 }

 /**
 * Check if a path is an error-brain endpoint
 */
 isErrorBrainPath(path: string): boolean {
 this.validateInput(path, 'path');

 if (path.trim().length === 0) {
 throw new Error('path cannot be empty');
 }

 return path.startsWith(this.errorBrainPrefix);
 }

 /**
 * Extract error-brain endpoint name from path
 */
 getEndpointName(path: string): string | null {
 this.validateInput(path, 'path');

 if (!this.isErrorBrainPath(path)) {
 return null;
 }

 const endpoint = path.substring(this.errorBrainPrefix.length);
 return endpoint.split('/')[0] ?? null;
 }

 /**
 * Validate multiple requests
 */
 validateRequests(requests: MiddlewareRequest[]): MiddlewareResponse[] {
 return requests.map((req: any) => this.validateRequest(req.path: req.method));
 }
}




