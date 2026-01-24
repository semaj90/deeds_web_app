/**
 * Base service class with common utilities
 */

import type { ServiceConfig } from './types.js';

export class BaseService {
    protected config: ServiceConfig;
    protected logger: Console;

    constructor(config: ServiceConfig) {
        this.config = config;
        this.logger = console;
    }

    /**
     * Retry logic with exponential backoff
     */
    protected async retry<T>(
        fn: () => Promise<T>,
        maxRetries: number = this.config.maxRetries,
        delayMs: number = this.config.retryDelayMs
    ): Promise<T> {
        let lastError: Error | null = null;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error as Error;
                if (attempt < maxRetries - 1) {
                    const delay = delayMs * Math.pow(2, attempt);
                    this.logger.warn(
                        `Attempt ${attempt + 1} failed, retrying in ${delay}ms:`,
                        lastError.message
                    );
                    await new Promise((resolve) => setTimeout(resolve, delay));
                }
            }
        }

        throw lastError || new Error('Max retries exceeded');
    }

    /**
     * Validate input
     */
    protected validateInput(fieldName: string, value: any): void {
        if (value === null || value === undefined) {
            throw new Error(`${fieldName} is required`);
        }
    }

    /**
     * Log operation
     */
    protected log(level: 'info' | 'warn' | 'error', message: string, data?: any): void {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}`;

        if (data) {
            this.logger[level](logMessage, data);
        } else {
            this.logger[level](logMessage);
        }
    }

    /**
     * Generate unique ID
     */
    protected generateId(): string {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}
