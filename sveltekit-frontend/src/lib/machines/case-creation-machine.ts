/**
 * Case Creation State Machine - XState v5
 * RabbitMQ Background Job Handler for Idle User Case Creation
 *
 * Queued via idle-detection-rabbitmq-machine when user is idle
 * Validates and creates legal cases asynchronously
 */
import { assign, createMachine, fromPromise } from 'xstate';

export interface CaseCreationContext {
	formData: {
		title: string;
		description: string;
		priority: 'low' | 'medium' | 'high' | 'critical';
		status: 'open' | 'investigating' | 'pending' | 'closed' | 'archived';
		location?: string;
		jurisdiction?: string;
	};
	validationErrors: Record<string, string[]>;
	createdCase: unknown;
	error: string | null;
	isAutoSaving: boolean;
	retryCount: number;
	jobId?: string; // RabbitMQ job identifier
	sessionId?: string; // User session for job tracking
}

export type CaseCreationEvent =
	| { type: 'START_CREATION' }
	| { type: 'UPDATE_FORM'; data: Partial<CaseCreationContext['formData']> }
	| { type: 'VALIDATE_FORM'; data: Partial<CaseCreationContext['formData']> }
	| { type: 'SUBMIT_CASE' }
	| { type: 'RETRY' }
	| { type: 'RESET' };

export const caseCreationMachine = createMachine(
	{
		id: 'caseCreation',
		initial: 'idle',
		types: {} as {
			context: CaseCreationContext,
			events: CaseCreationEvent,
		},
		context: {
			formData: {
				title: '',
				description: '',
				priority: 'medium',
				status: 'open'
			},
			validationErrors: {},
			createdCase: null,
			error: null,
			isAutoSaving: false,
			retryCount: 0
		},
		states: {
			idle: {
				on: {
					START_CREATION: 'editing',
					UPDATE_FORM: {
						target: 'editing',
						actions: assign({
							formData: ({ event }) => ({ ...event.data } as CaseCreationContext['formData'])
						})
					}
				}
			},
			editing: {
				entry: assign({ error: () => null }),
				on: {
					UPDATE_FORM: {
						actions: assign({
							formData: ({ context, event }) => ({ ...context.formData, ...event.data }),
							isAutoSaving: () => true
						})
					},
					VALIDATE_FORM: {
						target: 'validating',
						actions: assign({
							formData: ({ context, event }) => ({ ...context.formData, ...event.data })
						})
					},
					SUBMIT_CASE: 'submitting'
				},
				after: {
					2000: {
						target: 'editing',
						actions: assign({ isAutoSaving: () => false })
					}
				}
			},
			validating: {
				invoke: {
					id: 'validateCaseData',
					src: 'validateCaseData',
					input: ({ context }) => context,
					onDone: {
						target: 'editing',
						actions: assign({
							validationErrors: () => ({}),
							error: () => null
						})
					},
					onError: {
						target: 'editing',
						actions: assign({
							validationErrors: ({ event }) =>
								(event as any).error?.validationErrors ?? {},
							error: () => 'Validation failed'
						})
					}
				}
			},
			submitting: {
				entry: assign({ retryCount: ({ context }) => context.retryCount + 1 }),
				invoke: {
					id: 'submitCase',
					src: 'submitCase',
					input: ({ context }) => context,
					onDone: {
						target: 'completed',
						actions: assign({
							createdCase: ({ event }) => event.output,
							error: () => null,
							retryCount: () => 0
						})
					},
					onError: [
						{
							guard: ({ context }) => context.retryCount < 3,
							target: 'retrying',
							actions: assign({
								error: ({ event }) =>
									(event as any).error?.message ?? 'Submission failed'
							})
						},
						{
							target: 'failed',
							actions: assign({
								error: ({ event }) =>
									(event as any).error?.message ?? 'Submission failed after retries'
							})
						}
					]
				}
			},
			retrying: {
				after: {
					2000: 'submitting'
				},
				on: {
					RETRY: 'submitting'
				}
			},
			completed: {
				type: 'final',
				entry: assign({ isAutoSaving: () => false }),
				on: {
					RESET: {
						target: 'idle',
						actions: assign({
							formData: () => ({
								title: '',
								description: '',
								priority: 'medium',
								status: 'open'
							}),
							validationErrors: () => ({}),
							createdCase: () => null,
							error: () => null,
							isAutoSaving: () => false,
							retryCount: () => 0
						})
					}
				}
			},
			failed: {
				on: {
					RETRY: 'submitting',
					RESET: {
						target: 'idle',
						actions: assign({
							error: () => null,
							retryCount: () => 0
						})
					}
				}
			}
		}
	},
	{
		actors: {
			validateCaseData: fromPromise<{ valid, boolean }, { input, CaseCreationContext }>(
				async ({ input }) => {
					const errors: Record<string, string[]> = {};

					if (!input.formData.title?.trim()) {
						errors.title = ['Title is required'];
					}
					if (!input.formData.description?.trim()) {
						errors.description = ['Description is required'];
					}

					if (Object.keys(errors).length > 0) {
						throw { validationErrors, errors };
					}

					return { valid, true };
				}
			),
			submitCase: fromPromise<unknown, { input, CaseCreationContext }>(async ({ input }) => {
				const response = await fetch('/api/cases', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						...input.formData,
						jobId: input.jobId,
						sessionId: input.sessionId
					})
				});

				if (!response.ok) {
					const errorData = await response.json();
					throw new Error(errorData?.error|| `HTTP ${response.status}`);
				}

				return response.json();
			})
		}
	}
);

export default caseCreationMachine;





