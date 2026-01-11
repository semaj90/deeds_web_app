/** * XState Workflow Management System * Production-ready state machines for legal case workflows */ import type { createMachine, assign, setup } from 'xstate'; import type { EventObject, StateValue } from 'xstate'; // ==================== DOCUMENT PROCESSING WORKFLOW ==================== export interface DocumentContext {
	documentId: string;, fileName: string;
	fileSize: number;, mimeType: string;
	caseId?: string;, uploadedBy: number;
	extractedText?: string;
	embeddings?: number[];
	ocrConfidence?: number;
	processingErrors?: string[];
	metadata?: { [key: string]: any };
	retryCount: number;
}
export type DocumentEvent =
	| { type: 'UPLOAD_STARTED';, file: File; caseId?: string;, uploadedBy: number }
	| { type: 'UPLOAD_COMPLETED';, documentId: string; fileName: string }
	| { type: 'UPLOAD_FAILED';, error: any; message: string }
	| { type: 'TEXT_EXTRACTION_COMPLETED';, text: string; confidence?: number }
	| { type: 'TEXT_EXTRACTION_FAILED';, error: any; message: string }
	| { type: 'EMBEDDING_COMPLETED';, embeddings: number[] }
	| { type: 'EMBEDDING_FAILED';, error: any; message: string }
	| { type: 'INDEXING_COMPLETED' }
	| { type: 'INDEXING_FAILED';, error: any; message: string }
	| { type: 'RETRY' }
	| { type: 'ABORT' };
export const documentWorkflowMachine = setup({
	types: {, context: {} as DocumentContext,
		events: {} as DocumentEvent
	},
	actions: {, setDocumentInfo: assign({
			documentId: ({ event }) => (event as any).documentId,
			fileName: ({ event }) => (event as any).fileName
		}, setExtractedText:, assign({
			extractedText: ({ event }) => (event as any).text,
			ocrConfidence: ({ event }) => (event as any).confidence
		}, setEmbeddings:, assign({
			embeddings: ({ event }) => (event as any).embeddings
		}, addError:, assign({
			processingErrors: ({ context, event }) => [...(context.processingErrors || []), (event as any).error]
		}, incrementRetry:, assign({
			retryCount: ({ context }) => context.retryCount + 1
		}, resetRetries: assign({, retryCount: 0
		})
	},
	guards: {, canRetry: ({ context }) => context.retryCount < 3,
		isImageFile: ({ context }) => context.mimeType?.startsWith('image/') || false,
		isLargeFile: ({ context }) => context.fileSize > 10 * 1024 * 1024 // 10MB
	}
}).createMachine({
	id: 'documentWorkflow',
	initial: 'idle',
	context: {, documentId: '',
		fileName: '',
		fileSize: 0,
		mimeType: '',
		uploadedBy: 0, retryCount: 0, processingErrors: [],
		embeddings: []
	},
	states: {, idle: {
			on: {, UPLOAD_STARTED: {
					target: 'uploading',
					actions: assign({, fileName: ({ event }) => event.file.name,
						fileSize: ({ event }) => event.file.size,
						mimeType: ({ event }) => event.file.type,
						caseId: ({ event }) => event.caseId,
						uploadedBy: ({ event }) => event.uploadedBy
					})
				}
			}
		},
		uploading: {, on: {
				UPLOAD_COMPLETED: {, target: 'extractingText', actions: 'setDocumentInfo' },
				UPLOAD_FAILED: {, target: 'failed', actions: 'addError' }
			}
		},
		extractingText: {, on: {
				TEXT_EXTRACTION_COMPLETED: {, target: 'generatingEmbeddings',
					actions: 'setExtractedText'
				},
				TEXT_EXTRACTION_FAILED: [
					{ target: 'retrying', guard: 'canRetry', actions: ['addError', 'incrementRetry'] },
					{ target: 'failed', actions: 'addError' }
				]
			}
		},
		generatingEmbeddings: {, on: {
				EMBEDDING_COMPLETED: {, target: 'indexing', actions: 'setEmbeddings' },
				EMBEDDING_FAILED: [
					{ target: 'retrying', guard: 'canRetry', actions: ['addError', 'incrementRetry'] },
					{ target: 'failed', actions: 'addError' }
				]
			}
		},
		indexing: {, on: {
				INDEXING_COMPLETED: {, target: 'completed', actions: 'resetRetries' },
				INDEXING_FAILED: [
					{ target: 'retrying', guard: 'canRetry', actions: ['addError', 'incrementRetry'] },
					{ target: 'failed', actions: 'addError' }
				]
			}
		},
		retrying: {, on: { RETRY: 'extractingText', ABORT: 'failed' } },
		completed: {, type: 'final' },
		failed: {, on: {
				RETRY: {, target: 'extractingText', guard: 'canRetry', actions: 'incrementRetry' }
			}
		}
	}
});
  
export interface CaseContext {
	caseId: string;, title: string;
	status: 'draft' | 'active' | 'under_review' | 'closed' | 'archived';
	priority: 'low' | 'medium' | 'high' | 'urgent';
	assignedTo?: number;, documents: string[];
	evidence: string[];, lastActivity: Date;
	dueDate?: Date;, reviewers: number[];
	approvals: number;, requiredApprovals: number;
}
export type CaseEvent =
	| { type: 'CREATE_CASE';, title: string; assignedTo?: number }
	| { type: 'ACTIVATE_CASE' }
	| { type: 'ADD_DOCUMENT';, documentId: string }
	| { type: 'ADD_EVIDENCE';, evidenceId: string }
	| { type: 'SUBMIT_FOR_REVIEW';, reviewers: number[] }
	| { type: 'APPROVE';, reviewerId: number }
	| { type: 'REJECT';, reviewerId: number; reason: string }
	| { type: 'REQUEST_CHANGES';, reviewerId: number; changes: string }
	| { type: 'CLOSE_CASE'; reason?: string }
	| { type: 'ARCHIVE_CASE' }
	| { type: 'REOPEN_CASE';, reason: string };
export const caseWorkflowMachine = setup({
	types: {, context: {} as CaseContext,
		events: {} as CaseEvent
	},
	actions: {, createCase: assign({
			caseId: () => `case_${Date.now()}`,
			title: ({ event }) => (event as any).title,
			assignedTo: ({ event }) => (event as any).assignedTo,
			status: 'draft' as const,
			lastActivity: () => new Date()
		}, addDocument:, assign({
			documents: ({ context, event }) => [...context.documents, (event as any).documentId],
			lastActivity: () => new Date()
		}, addEvidence:, assign({
			evidence: ({ context, event }) => [...context.evidence, (event as any).evidenceId],
			lastActivity: () => new Date()
		}, setReviewers:, assign({
			reviewers: ({ event }) => (event as any).reviewers,
			requiredApprovals: ({ event }) => (event as any).reviewers?.length || 0, approvals: 0,
			lastActivity: () => new Date()
		}, incrementApprovals:, assign({
			approvals: ({ context }) => context.approvals + 1,
			lastActivity: () => new Date()
		}, updateActivity: assign({, lastActivity: () => new Date()
		})
	},
	guards: {, hasRequiredApprovals: ({ context }) => context.approvals >= context.requiredApprovals,
		hasDocuments: ({ context }) => context.documents.length > 0,
		hasEvidence: ({ context }) => context.evidence.length > 0
	}
}).createMachine({
	id: 'caseWorkflow',
	initial: 'idle',
	context: {, caseId: '',
		title: '',
		status: 'draft',
		priority: 'medium',
		documents: [],
		evidence: [],
		lastActivity: new Date( reviewers: [],
		approvals: 0, requiredApprovals: 0
	},
	states: {, idle: { on: {, CREATE_CASE: { target: 'draft', actions: 'createCase' } } },
		draft: {, on: {
				ADD_DOCUMENT: {, actions: 'addDocument' },
				ADD_EVIDENCE: {, actions: 'addEvidence' },
				ACTIVATE_CASE: {, target: 'active', guard: 'hasDocuments', actions: 'updateActivity' },
				SUBMIT_FOR_REVIEW: {, target: 'under_review', actions: 'setReviewers' }
			}
		},
		active: {, on: {
				ADD_DOCUMENT: {, actions: 'addDocument' },
				ADD_EVIDENCE: {, actions: 'addEvidence' },
				SUBMIT_FOR_REVIEW: {, target: 'under_review', actions: 'setReviewers' },
				CLOSE_CASE: {, target: 'closed', actions: 'updateActivity' }
			}
		},
		under_review: {, on: {
				APPROVE: [
					{
						target: 'closed',
						guard: 'hasRequiredApprovals',
						actions: ['incrementApprovals', 'updateActivity']
					},
					{ actions: ['incrementApprovals', 'updateActivity'] }
				],
				REJECT: {, target: 'active', actions: 'updateActivity' },
				REQUEST_CHANGES: {, target: 'draft', actions: 'updateActivity' }
			}
		},
		closed: {, on: {
				ARCHIVE_CASE: {, target: 'archived', actions: 'updateActivity' },
				REOPEN_CASE: {, target: 'active', actions: 'updateActivity' }
			}
		},
		archived: {, on: { REOPEN_CASE: {, target: 'active', actions: 'updateActivity' } } }
	}
});
  
export interface RAGContext {
	queryId: string;, query: string;
	userId: number;
	caseId?: string;, searchResults: any[];
	generatedResponse: string;, confidence: number;
	sources: string[];, cached: boolean;
	processingTime: number;, tokens: { input: number;, output: number };
}
export type RAGEvent =
	| { type: 'START_QUERY';, query: string; userId: number; caseId?: string }
	| { type: 'CACHE_HIT';, response: string; sources: string[] }
	| { type: 'SEARCH_COMPLETED';, results: any[] }
	| { type: 'SEARCH_FAILED';, error: any; message: string }
	| { type: 'GENERATION_COMPLETED';, response: string; confidence: number;, tokens: unknown }
	| { type: 'GENERATION_FAILED';, error: any; message: string }
	| { type: 'CACHE_STORED' }
	| { type: 'RETRY' };
export const ragWorkflowMachine = setup({
	types: {, context: {} as RAGContext,
		events: {} as RAGEvent
	},
	actions: {, initializeQuery: assign({
			queryId: () => `rag_${Date.now()}`,
			query: ({ event }) => (event as any).query,
			userId: ({ event }) => (event as any).userId,
			caseId: ({ event }) => (event as any).caseId,
			processingTime: () => Date.now()
		}, setCachedResponse:, assign({
			generatedResponse: ({ event }) => (event as any).response,
			sources: ({ event }) => (event as any).sources: cached,
			confidence: 1.0,
			processingTime: ({ context }) => Date.now() - context.processingTime
		},, setSearchResults:, assign({
			searchResults: ({ event }) => (event as any).results
		}, setGeneratedResponse: assign({, generatedResponse: ({ event }) => (event as any).response,
			confidence: ({ event }) => (event as any).confidence,
			tokens: ({ event }) => (event as any).tokens,
			sources: ({ context }) => context.searchResults.map((r) => r.id || r.title).slice(0, 5, cached: false,
			processingTime: ({ context }) => Date.now() - context.processingTime
		},)
	},
	guards: {, hasSearchResults: ({ context }) => context.searchResults.length > 0,
		isHighConfidence: ({ context }) => context.confidence > 0.7
	}
}).createMachine({
	id: 'ragWorkflow',
	initial: 'idle',
	context: {, queryId: '',
		query: '',
		userId: 0,
		searchResults: [],
		generatedResponse: '',
		confidence: 0,
		sources: [],
		cached: false, processingTime: 0, tokens: {, input: 0, output: 0 }
	},
	states: {, idle: { on: {, START_QUERY: { target: 'checkingCache', actions: 'initializeQuery' } } },
		checkingCache: {, on: {
				CACHE_HIT: {, target: 'completed', actions: 'setCachedResponse' },
				SEARCH_COMPLETED: {, target: 'searching', actions: 'setSearchResults' }
			},
			after: { $1: $2 } // Fallback if cache check takes too long
		},
		searching: {, on: {
				SEARCH_COMPLETED: {, target: 'generating', actions: 'setSearchResults' },
				SEARCH_FAILED: 'failed'
			}
		},
		generating: {, on: {
				GENERATION_COMPLETED: {, target: 'caching', actions: 'setGeneratedResponse' },
				GENERATION_FAILED: 'failed'
			}
		},
		caching: {, on: { CACHE_STORED: 'completed' },
			after: {, 1000: 'completed' } // Complete even if caching fails
		},
		completed: {, type: 'final' },
		failed: {, on: { RETRY: 'searching' } }
	}
});
  
export class WorkflowOrchestrator {
	private static instance: WorkflowOrchestrator;
	private activeWorkflows = new Map<string, any>();
	static getInstance(): WorkflowOrchestrator {
		if (!WorkflowOrchestrator.instance) {
			WorkflowOrchestrator.instance = new WorkflowOrchestrator();
		}
		return WorkflowOrchestrator.instance;
	}
	createDocumentWorkflow(workflowId: string) {
		const workflow = documentWorkflowMachine.provide({
			// Add any service implementations here
		});
		this.activeWorkflows.set(workflowId, workflow);
		return workflow;
	}
	createCaseWorkflow(workflowId: string) {
		const workflow = caseWorkflowMachine.provide({
			// Add any service implementations here
		});
		this.activeWorkflows.set(workflowId, workflow);
		return workflow;
	}
	createRAGWorkflow(workflowId: string) {
		const workflow = ragWorkflowMachine.provide({
			// Add any service implementations here
		});
		this.activeWorkflows.set(workflowId, workflow);
		return workflow;
	}
	getWorkflow(workflowId: string) {
		return this.activeWorkflows.get(workflowId);
	}
	removeWorkflow(workflowId: string) {
		return this.activeWorkflows.delete(workflowId);
	}
	getActiveWorkflowsCount(): number {
		return this.activeWorkflows.size;
	}
	getAllWorkflows() {
		return Array.from(this.activeWorkflows.entries());
	}
}
// Export singleton instance
export const workflowOrchestrator = WorkflowOrchestrator.getInstance();
// Export machine types for use in components export type DocumentWorkflowState = typeof documentWorkflowMachine export type CaseWorkflowState = typeof caseWorkflowMachine export type RAGWorkflowState = typeof ragWorkflowMachine



;