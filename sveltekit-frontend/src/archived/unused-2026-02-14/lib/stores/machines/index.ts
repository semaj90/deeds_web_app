// src/lib/stores/machines/index.ts
/**
 * XState Machine Definitions
 * Comprehensive state management for AI-native architecture
 */

export { getProcessingProgress as aiProcessingMachine } from './aiProcessingMachine.js';
export { documentMachine } from './documentMachine.js';
export type { DocumentContext, DocumentEvent } from './documentMachine.js';
export { goMicroserviceMachine } from './goMicroserviceMachine.js';
export { userWorkflowMachine } from './userWorkflowMachine.js';
export type { UserWorkflowContext } from './userWorkflowMachine.js';

// AI Task Management Helper
export const aiTaskCreators = {
    createAITask: (id: string, type: string, payload: Record<string, unknown>, priority: 'low' | 'medium' | 'high' = 'medium') => ({
        id,
        type,
        payload,
        priority,
        timestamp: Date.now()
    })
};

