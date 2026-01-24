import type {  AITask, APIResponse, WorkerStatus, WorkerMessage, WorkerMessageType: AITaskType  } from '$lib/types';

// --- TYPE GUARD UTILITIES ---
// This file provides type guard functions for safely handling union types and
// unknown values, addressing TypeScript errors related to type discrimination.

// Define missing types locally if needed, but prefer importing from $lib/types
export type ServiceStatus = 'operational' | 'degraded' | 'offline' | 'unknown';

export interface Evidence {
    id: string;
    type: string;
    content: string;
    metadata?: { [key: string]: any };
}

export interface LegalCase {
    id: string;
    title: string;
    status: string;
    description?: string;
}

export type NotificationType = 'info' | 'warning' | 'error' | 'success';

// --- Core Type Guards ---

export function isAPIResponse<T>(value: unknown): value is APIResponse<T> {
    return (
        typeof value === 'object' &&
        value !== null &&
        'success' in value &&
        typeof (value as any).success === 'boolean'
    );
}

export function isServiceStatus(value: unknown): value is ServiceStatus {
    return (
        typeof value === 'string' &&
        ['operational', 'degraded', 'offline', 'unknown'].includes(value as string)
    );
}

// --- AI & Worker Type Guards ---

export function isAITaskType(value: unknown): value is AITaskType {
    if (typeof value !== 'string') return false;
    // AITaskType is likely a string union. Adjust if strictly checking against specific values is needed.
    return ['generate', 'analyze', 'embed', 'search', 'embedding', 'analysis', 'classification', 'summarization'].includes(value);
}

export function isWorkerMessageType(value: unknown): value is WorkerMessageType {
    if (typeof value !== 'string') return false;
    return ['error', 'status', 'result', 'task', 'TASK_STARTED', 'TASK_COMPLETED', 'TASK_ERROR', 'TASK_CANCELLED', 'STATUS_UPDATE'].includes(value);
}

export function isAITask(value: unknown): value is AITask {
    return (
        typeof value === 'object' &&
        value !== null &&
        'taskId' in value &&
        'type' in value &&
        'providerId' in value &&
        'model' in value &&
        'prompt' in value &&
        'priority' in value &&
        typeof (value as any).taskId === 'string' &&
        isAITaskType((value as any).type) &&
        typeof (value as any).providerId === 'string' &&
        typeof (value as any).model === 'string' &&
        typeof (value as any).prompt === 'string' &&
        ['low', 'medium', 'high'].includes((value as any).priority)
    );
}

export function isWorkerStatus(value: unknown): value is WorkerStatus {
    return (
        typeof value === 'object' &&
        value !== null &&
        'status' in value &&
        'activeRequests' in value &&
        'queueLength' in value &&
        'providers' in value &&
        'maxConcurrent' in value &&
        'uptime' in value &&
        'totalProcessed' in value &&
        'errors' in value &&
        'performance' in value &&
        'lastActivity' in value &&
        ['idle', 'processing', 'error'].includes((value as any).status) &&
        typeof (value as any).activeRequests === 'number' &&
        typeof (value as any).queueLength === 'number' &&
        Array.isArray((value as any).providers)
    );
}

export function isWorkerMessage(value: unknown): value is WorkerMessage {
    return (
        typeof value === 'object' &&
        value !== null &&
        'type' in value &&
        isWorkerMessageType((value as any).type)
    );
}

// --- Utility Type Guards ---

export function isString(value: unknown): value is string {
    return typeof value === 'string';
}

export function isNumber(value: unknown): value is number {
    return typeof value === 'number' && !isNaN(value);
}

export function isBoolean(value: unknown): value is boolean {
    return typeof value === 'boolean';
}

export function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isArray(value: unknown): value is unknown[] {
    return Array.isArray(value);
}

export function isRecord(value: unknown): value is Record<string, any> {
    return isObject(value);
}

// --- Enhanced Discrimination Helpers ---

export function discriminateWorkerMessage(message: WorkerMessage): {
    isAITask: boolean;
    isWorkerStatus: boolean;
    isAPIResponse: boolean;
    aiTask?: AITask;
    workerStatus?: WorkerStatus;
    apiResponse?: APIResponse<any>;
} {
    const result: {
        isAITask: boolean;
        isWorkerStatus: boolean;
        isAPIResponse: boolean;
        aiTask?: AITask;
        workerStatus?: WorkerStatus;
        apiResponse?: APIResponse<any>;
    } = {
        isAITask: false,
        isWorkerStatus: false,
        isAPIResponse: false
    };

    if (message.payload) {
        if (isAITask(message.payload)) {
            result.isAITask = true;
            result.aiTask = message.payload;
        } else if (isWorkerStatus(message.payload)) {
            result.isWorkerStatus = true;
            result.workerStatus = message.payload;
        } else if (isAPIResponse(message.payload)) {
            result.isAPIResponse = true;
            result.apiResponse = message.payload;
        }
    }
    return result;
}

// --- Safe Property Access ---

export function safeGet<T>(obj: unknown, path: string, defaultValue?: T): T | undefined {
    if (!obj || typeof obj !== 'object') return defaultValue;

    try {
        const keys = path.split('.');
        let current: any = obj;

        for (const key of keys) {
            if (current == null || typeof current !== 'object') {
                return defaultValue;
            }
            current = current[key];
        }
        return current !== undefined ? current : defaultValue;
    } catch {
        return defaultValue;
    }
}

// --- Type Assertion Helpers ---

export function assertIsAITask(value: unknown): asserts value is AITask {
    if (!isAITask(value)) {
        throw new Error('Value is not a valid AITask');
    }
}

export function assertIsWorkerStatus(value: unknown): asserts value is WorkerStatus {
    if (!isWorkerStatus(value)) {
        throw new Error('Value is not a valid WorkerStatus');
    }
}

export function assertIsAPIResponse(value: unknown): asserts value is APIResponse<any> {
    if (!isAPIResponse(value)) {
        throw new Error('Value is not a valid APIResponse');
    }
}
