import { EventEmitter } from 'events';

export type EventData = {
	type: string;
	data?: Record<string, unknown>;
	metadata?: Record<string, unknown>;
	timestamp?: string;
	source?: string;
	[key: string]: unknown;
};

// Reusable singleton for orchestrator events used across the app
export const databaseOrchestrator = new EventEmitter();

// Default export for convenience (optional)
export default databaseOrchestrator;



