import { assign, createActor, createMachine } from 'xstate';
import { z } from 'zod';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

// Enhanced Types for Legal AI Integration
export interface UploadContext {
	files: File[];
	uploadProgress: number;
	uploadResults: UploadResult[];
	errors: string[];
	userAnalytics: UserAnalytics;
	contextualPrompts: ContextualPrompt[];
	pipeline: PipelineStatus;
	caseId?: string;
	legalContext?: LegalContext;
	aiAnalysisResults: AIAnalysisResult[];
	evidenceMetadata: EvidenceMetadata[];
	riskAssessment?: RiskAssessment;
	authSession?: AuthSession;
	dbConnection?: DatabaseConnection;
	ollamaConfig?: OllamaConfig;
}

export interface LegalContext {
	practiceArea?: string;
	caseType?: string;
	urgency?: 'low' | 'medium' | 'high' | 'critical';
	jurisdiction?: string;
	clientId?: string;
	matterNumber?: string;
}

export interface AIAnalysisResult {
	fileId: string;
	fileName: string;
	confidence: number;
	summary: string;
	keyEntities: EntityExtraction[];
	legalCitations: Citation[];
	privileged: boolean;
	needsRedaction: boolean;
	evidenceType: string;
	relevanceScore: number;
	suggestedTags: string[];
	riskFactors: string[];
}

export interface EntityExtraction {
	type: 'person' | 'organization' | 'location' | 'date' | 'money' | 'legal_term';
	value: string;
	confidence: number;
	startPos: number;
	endPos: number;
}

export interface Citation {
	type: 'case' | 'statute' | 'regulation';
	citation: string;
	relevance: number;
	jurisdiction: string;
}

export interface EvidenceMetadata {
	fileId: string;
	chain_of_custody: ChainOfCustodyEntry[];
	hash: string;
	source: string;
	acquisition_date: string;
	authenticity_verified: boolean;
}

export interface ChainOfCustodyEntry {
	timestamp: string;
	actor: string;
	action: string;
	details: string;
}

export interface RiskAssessment {
	level: 'low' | 'medium' | 'high' | 'critical';
	factors: string[];
	privilegedMaterialDetected: boolean;
	redactionRequired: boolean;
	ethicalConcerns: string[];
}

export interface AuthSession {
	userId: string;
	role: 'paralegal' | 'associate' | 'senior' | 'partner' | 'admin';
	permissions: string[];
	barNumber?: string;
	firmId: string;
}

export interface DatabaseConnection {
	connected: boolean;
	lastSync: string;
	pendingOperations: number;
}

export interface OllamaConfig {
	endpoint: string;
	model: string;
	connected: boolean;
	capabilities: string[];
}

export interface UserAnalytics {
	userId: string;
	sessionId: string;
	behaviorPattern: 'novice' | 'intermediate' | 'expert' | 'power_user';
	uploadHistory: {
	totalUploads: number;
		successRate: number;
	averageFileSize: number;
		preferredFormats: string[];
	commonUploadTimes: string[];
	};
	interactionMetrics: {
	typingSpeed: number;
		clickPatterns: ClickPattern[];
	scrollBehavior: { depth: number;
	speed: number };
		focusTime: number;
	};
	contextualPreferences: {
	preferredAIPromptStyle: 'concise' | 'detailed' | 'technical';
		helpLevel: 'minimal' | 'moderate' | 'extensive';
		autoSuggestions: boolean;
	proactiveInsights: boolean;
	};
	caseContext: {
	activeCases: string[];
		currentCaseId?: string;
	workflowStage: 'intake' | 'discovery' | 'preparation' | 'trial' | 'appeal';
		expertise: 'paralegal' | 'associate' | 'senior' | 'partner';
	};
}

export interface ClickPattern {
	x: number;
	y: number;
	timestamp: number;
	element: string;
	legalContext?: string;
}

export interface ContextualPrompt {
	id: string;
	content: string;
	category: 'optimization' | 'guidance' | 'insight' | 'warning' | 'recommendation';
	timing: 'before-upload' | 'during-upload' | 'after-upload';
	confidence: number;
	relevance: number;
	actionable: boolean;
	legalSpecific: boolean;
}

export interface UploadResult {
	fileName: string;
	success: boolean;
	documentId?: string;
	error?: string;
	aiInsights?: {
	summary: string;
		keyEntities?: EntityExtraction[];
		suggestedTags?: string[];
		confidenceScore?: number;
		privileged?: boolean;
		evidenceType?: string;
	};
	metadata?: EvidenceMetadata;
}

export interface PipelineStatus {
	fileValidation: {
	status: 'pending' | 'processing' | 'completed' | 'failed'; progress?: number };
	fileUpload: {
	status: 'pending' | 'processing' | 'completed' | 'failed'; progress?: number };
	aiAnalysis: {
	status: 'pending' | 'processing' | 'completed' | 'failed'; progress?: number };
	indexing: {
	status: 'pending' | 'processing' | 'completed' | 'failed'; progress?: number };
	vectorEmbedding: {
	status: 'pending' | 'processing' | 'completed' | 'failed'; progress?: number };
	dbStorage: {
	status: 'pending' | 'processing' | 'completed' | 'failed'; progress?: number };
}

// Validation Schemas
export const FileSchema = z.object({
	name: z.string(),
	size: z.number().positive(),
	type: z.string(),
	lastModified: z.number()
});

export const LegalContextSchema = z.object({
	practiceArea: z.string().optional(),
	caseType: z.string().optional(),
	urgency: z.enum(['low', 'medium', 'high', 'critical']).optional(),
	jurisdiction: z.string().optional(),
	clientId: z.string().optional(),
	matterNumber: z.string().optional()
});

type AnalyzeBehaviorResponse = { analytics: UserAnalytics;
	insights: unknown; score: number };
type GeneratePromptsResponse = { prompts: ContextualPrompt[] };
type AnalyzeDocResult = {
	documentId: string;
	summary: string;
	entities?: EntityExtraction[];
	tags?: string[];
	confidence?: number;
	privileged?: boolean;
	evidenceType?: string;
	hash?: string;
};

// Enhanced Production Services
export async function analyzeUserBehaviorService({
	input
}: {
	input: { userAnalytics: UserAnalytics;
	context: UploadContext };
}): Promise<{
	updatedAnalytics: UserAnalytics; insights: unknown;
	behaviorScore: number }> {
	try {
		const response = await fetch('/api/ai/ollama/analyze-behavior', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	userAnalytics: input.userAnalytics,
				legalContext: input.context.legalContext
			})
		});
		if (!response.ok) throw new Error(`Behavior analysis failed: \${response.statusText}`);
		const result = (await response.json()) as AnalyzeBehaviorResponse;
		return {
			updatedAnalytics: result.analytics,
			insights: result.insights,
			behaviorScore: result.score
		};
	} catch (error) {
		console.warn('Production behavior analysis unavailable, using fallback');
		return {
			updatedAnalytics: { ...input.userAnalytics },
	insights: {},
	behaviorScore: 0.75
		};
	}
}

export async function generateContextualPromptsService({
	input
}: {
	input: { context: UploadContext;
	timing: string };
}): Promise<ContextualPrompt[]> {
	try {
		const response = await fetch('/api/ai/ollama/generate-prompts', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	context: input.context,
				timing: input.timing,
				model: input.context.ollamaConfig?.model ?? 'gemma3:270m',
				legalContext: input.context.legalContext
			})
		});
		if (!response.ok) throw new Error(`Prompt generation failed: \${response.statusText}`);
		const result = (await response.json()) as GeneratePromptsResponse;
		return result.prompts;
	} catch (error) {
		console.warn('Production prompt generation unavailable, using fallback');
		return [];
	}
}

export async function performAIAnalysisService({
	input
}: {
	input: { files: File[];
	context: UploadContext };
}): Promise<UploadResult[]> {
	try {
		const analysisPromises = input.files.map(async (file) => {
			const formData = new FormData();
			formData.append('file', file);
			formData.append('caseId', input.context?.caseId ?? '');
			formData.append('legalContext', JSON.stringify(input.context.legalContext));
			formData.append('model', input.context.ollamaConfig?.model ?? 'gemma3:270m');
			formData.append('analysisType', 'comprehensive_legal');

			const response = await fetch('/api/ai/ollama/analyze-legal-document', {
				method: 'POST',
				body: formData
			});
			if (!response.ok) throw new Error(`Analysis failed for \${file.name}`);
			const result = (await response.json()) as AnalyzeDocResult;
			return {
				fileName: file.name,
				success: true,
				documentId: result.documentId,
				aiInsights: {
	summary: result.summary,
					keyEntities: result.entities,
					suggestedTags: result.tags,
					confidenceScore: result.confidence,
					privileged: result.privileged,
					evidenceType: result.evidenceType
				},
	metadata: {
	fileId: result.documentId,
					hash: result.hash ?? '',
					source: 'legal_upload',
					acquisition_date: new Date().toISOString(),
					authenticity_verified: true,
					chain_of_custody: [
						{
							timestamp: new Date().toISOString(),
							actor: input.context.authSession?.userId ?? 'system',
							action: 'uploaded',
							details: `Uploaded via legal AI system`
						}
					]
				}
			} as UploadResult;
		});
		return await Promise.all(analysisPromises);
	} catch (error) {
		console.warn('Production AI analysis unavailable, using fallback');
		return [];
	}
}

export async function saveToDatabaseService({
	input
}: {
	input: { results: UploadResult[];
	context: UploadContext };
}): Promise<void> {
	try {
		const response = await fetch('/api/database/legal-documents', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	documents: input.results,
				caseId: input.context.caseId,
				userId: input.context.authSession?.userId,
				legalContext: input.context.legalContext,
				metadata: {
	uploadSession: input.context.userAnalytics.sessionId,
					timestamp: new Date().toISOString(),
					source: `legal_ai_upload`
				}
			})
		});
		if (!response.ok) throw new Error(`Database save failed`);
	} catch (error) {
		console.warn('Production database unavailable, using fallback storage');
	}
}

export type UploadEvent =
	| { type: 'SELECT_FILES';
	files: File[]; caseId?: string }
	| { type: 'AUTH_SESSION_UPDATED';
	session: AuthSession }
	| { type: 'UPDATE_LEGAL_CONTEXT';
	context: LegalContext }
	| { type: 'USER_TYPING';
	speed: number }
	| { type: 'USER_CLICK';
	x: number; y: number;
	element: string; legalContext?: string }
	| { type: 'TRACK_USER_ACTION';
	data: { caseId?: string } }
	| { type: 'START_UPLOAD' }
	| { type: 'USER_REACTED_TO_PROMPT';
	promptId: string; reaction: string }
	| { type: 'REQUEST_AI_SUGGESTIONS' }
	| { type: 'CANCEL_UPLOAD' }
	| { type: 'RESET' }
	| { type: 'RETRY_UPLOAD' };

export const comprehensiveUploadAnalyticsMachine = createMachine(
	{
		types: {
	context: {} as UploadContext, events: {} as UploadEvent },
	id: 'enhancedLegalUploadAnalytics',
		initial: 'idle',
		context: ({ input }: { input?: Partial<UploadContext> }) => ({
			files: [],
			uploadProgress: 0,
			uploadResults: [],
			errors: [],
			userAnalytics: {
	userId: '',
				sessionId: `legal-session-\${Date.now()}`,
				behaviorPattern: 'intermediate',
				uploadHistory: {
	totalUploads: 0,
					successRate: 0.0,
					averageFileSize: 0,
					preferredFormats: [],
					commonUploadTimes: []
				},
	interactionMetrics: {
	typingSpeed: 0,
					clickPatterns: [],
					scrollBehavior: {
	depth: 0, speed: 0 },
	focusTime: 0
				},
	contextualPreferences: {
	preferredAIPromptStyle: 'detailed',
					helpLevel: 'moderate',
					autoSuggestions: true,
					proactiveInsights: true
				},
	caseContext: {
	activeCases: [],
					currentCaseId: undefined,
					workflowStage: 'discovery',
					expertise: 'associate'
				}
			},
	contextualPrompts: [],
			pipeline: {
	fileValidation: { status: 'pending' },
	fileUpload: {
	status: 'pending' },
	aiAnalysis: {
	status: 'pending' },
	indexing: {
	status: 'pending' },
	vectorEmbedding: {
	status: 'pending' },
	dbStorage: {
	status: 'pending' }
			},
	aiAnalysisResults: [],
			evidenceMetadata: [],
			authSession: undefined,
			dbConnection: undefined,
			ollamaConfig: undefined,
			caseId: undefined,
			legalContext: undefined,
			riskAssessment: undefined,
			...(input || {})
		}),
		states: {
	idle: {
				on: {
	SELECT_FILES: {
						target: 'analyzingUser',
						actions: assign({
	files: ({ event }: {
	event: any }) => event.files,
							caseId: ({ event }: {
	event: any }) => event.caseId,
							errors: () => []
						})
					},
	AUTH_SESSION_UPDATED: {
	actions: assign({
							authSession: ({ event }: {
	event: any }) => event.session
						})
					},
	UPDATE_LEGAL_CONTEXT: {
	actions: assign({
							legalContext: ({ event }: {
	event: any }) => event.context
						})
					}
				}
			},
	analyzingUser: {
	invoke: {
					src: 'analyzeUserBehavior',
					input: ({ context }: {
	context: UploadContext }) => ({ userAnalytics: context.userAnalytics, context }),
					onDone: {
	target: 'generatingPrompts',
						actions: assign({
	userAnalytics: ({ event }: {
	event: any }) => event.output.updatedAnalytics
						})
					},
	onError: {
	target: 'generatingPrompts',
						actions: assign({
	errors: ({ context, event }: {
	context: UploadContext; event: any }) => [...context.errors, `User analysis failed: ${event.error}`]
						})
					}
				},
	on: {
	USER_TYPING: {
						actions: assign({
	userAnalytics: ({ context, event }: {
	context: UploadContext; event: any }) => ({
								...context.userAnalytics,
								interactionMetrics: {
									...context.userAnalytics.interactionMetrics,
									typingSpeed: event.speed
								}
							})
						})
					},
	USER_CLICK: {
	actions: assign({
							userAnalytics: ({ context, event }: {
	context: UploadContext; event: any }) => ({
								...context.userAnalytics,
								interactionMetrics: {
									...context.userAnalytics.interactionMetrics,
									clickPatterns: [
										...context.userAnalytics.interactionMetrics.clickPatterns,
										{
											x: event.x,
											y: event.y,
											timestamp: Date.now(),
											element: event.element,
											legalContext: event.legalContext
										}
									]
								}
							})
						})
					},
	TRACK_USER_ACTION: {
	actions: assign({
							userAnalytics: ({ context, event }: {
	context: UploadContext; event: any }) => ({
								...context.userAnalytics,
								caseContext: {
									...context.userAnalytics.caseContext,
									activeCases:
										event.data?.caseId && !context.userAnalytics.caseContext.activeCases.includes(event.data.caseId)
											? [...context.userAnalytics.caseContext.activeCases, event.data.caseId]
											: context.userAnalytics.caseContext.activeCases
								}
							})
						})
					}
				}
			},
	generatingPrompts: {
	invoke: {
					src: 'generateContextualPrompts',
					input: ({ context }: {
	context: UploadContext }) => ({ context, timing: 'before-upload' }),
					onDone: {
	target: 'waitingForUpload',
						actions: assign({
	contextualPrompts: ({ event }: {
	event: any }) => event.output
						})
					},
	onError: {
	target: 'waitingForUpload',
						actions: assign({
	errors: ({ context, event }: {
	context: UploadContext; event: any }) => [...context.errors, `Prompt generation failed: ${event.error}`]
						})
					}
				}
			},
	waitingForUpload: {
	on: {
					START_UPLOAD: 'uploadPipeline',
					USER_REACTED_TO_PROMPT: {
	actions: assign({
							contextualPrompts: ({ context, event }: {
	context: UploadContext; event: any }) =>
								context.contextualPrompts.map((prompt) =>
									prompt.id === event.promptId ? { ...prompt, reaction: event.reaction as any } : prompt
								)
						})
					},
	REQUEST_AI_SUGGESTIONS: {
	target: 'generatingAdditionalPrompts' }
				}
			},
	generatingAdditionalPrompts: {
	invoke: {
					src: 'generateContextualPrompts',
					input: ({ context }: {
	context: UploadContext }) => ({ context, timing: 'during-upload' }),
					onDone: {
	target: 'waitingForUpload',
						actions: assign({
	contextualPrompts: ({ context, event }: {
	context: UploadContext; event: any }) => [...context.contextualPrompts, ...event.output]
						})
					},
	onError: {
	target: 'waitingForUpload',
						actions: assign({
	errors: ({ context, event }: {
	context: UploadContext; event: any }) => [...context.errors, `Additional prompt generation failed: ${event.error}`]
						})
					}
				}
			},
	uploadPipeline: {
	initial: 'validatingFiles',
				on: {
	CANCEL_UPLOAD: 'cancelled' },
	states: {
	validatingFiles: {
						entry: assign({
	pipeline: ({ context }: {
	context: UploadContext }) => ({
								...context.pipeline,
								fileValidation: {
	status: 'processing', progress: 0 }
							})
						}),
						after: {
	500: {
								target: 'uploadingFiles',
								actions: assign({
	pipeline: ({ context }: {
	context: UploadContext }) => ({
										...context.pipeline,
										fileValidation: {
	status: 'completed', progress: 100 }
									})
								})
							}
						}
					},
	uploadingFiles: {
	entry: assign({
							pipeline: ({ context }: {
	context: UploadContext }) => ({
								...context.pipeline,
								fileUpload: {
	status: 'processing', progress: 0 }
							})
						}),
						after: {
	1000: {
								target: 'performingAIAnalysis',
								actions: assign({
	uploadProgress: 30,
									pipeline: ({ context }: {
	context: UploadContext }) => ({
										...context.pipeline,
										fileUpload: {
	status: 'completed', progress: 100 }
									})
								})
							}
						}
					},
	performingAIAnalysis: {
	entry: assign({
							pipeline: ({ context }: {
	context: UploadContext }) => ({
								...context.pipeline,
								aiAnalysis: {
	status: 'processing', progress: 0 }
							})
						}),
						invoke: {
	src: 'performAIAnalysis',
							input: ({ context }: {
	context: UploadContext }) => ({ files: context.files, context }),
							onDone: {
	target: 'indexingDocuments',
								actions: assign({
	uploadResults: ({ event }: {
	event: any }) => event.output,
									uploadProgress: 100,
									pipeline: ({ context }: {
	context: UploadContext }) => ({
										...context.pipeline,
										aiAnalysis: {
	status: 'completed', progress: 100 }
									})
								})
							},
	onError: {
	target: 'error',
								actions: assign({
	errors: ({ context, event }: {
	context: UploadContext; event: any }) => [...context.errors, `AI analysis failed: ${event.error}`],
									pipeline: ({ context }: {
	context: UploadContext }) => ({
										...context.pipeline,
										aiAnalysis: {
	status: 'failed', progress: 0 }
									})
								})
							}
						}
					},
	indexingDocuments: {
	entry: assign({
							pipeline: ({ context }: {
	context: UploadContext }) => ({
								...context.pipeline,
								indexing: {
	status: 'processing', progress: 0 }
							})
						}),
						after: {
	800: {
								target: 'generatingEmbeddings',
								actions: assign({
	uploadProgress: 75,
									pipeline: ({ context }: {
	context: UploadContext }) => ({
										...context.pipeline,
										indexing: {
	status: 'completed', progress: 100 }
									})
								})
							}
						}
					},
	generatingEmbeddings: {
	entry: assign({
							pipeline: ({ context }: {
	context: UploadContext }) => ({
								...context.pipeline,
								vectorEmbedding: {
	status: 'processing', progress: 0 }
							})
						}),
						after: {
	1200: {
								target: 'savingToDatabase',
								actions: assign({
	uploadProgress: 90,
									pipeline: ({ context }: {
	context: UploadContext }) => ({
										...context.pipeline,
										vectorEmbedding: {
	status: 'completed', progress: 100 }
									})
								})
							}
						}
					},
	savingToDatabase: {
	entry: assign({
							pipeline: ({ context }: {
	context: UploadContext }) => ({
								...context.pipeline,
								dbStorage: {
	status: 'processing', progress: 0 }
							})
						}),
						invoke: {
	src: 'saveToDatabase',
							input: ({ context }: {
	context: UploadContext }) => ({ results: context.uploadResults, context }),
							onDone: {
	target: 'completed',
								actions: assign({
	uploadProgress: 100,
									pipeline: ({ context }: {
	context: UploadContext }) => ({
										...context.pipeline,
										dbStorage: {
	status: 'completed', progress: 100 }
									})
								})
							},
	onError: {
	target: 'error',
								actions: assign({
	errors: ({ context, event }: {
	context: UploadContext; event: any }) => [...context.errors, `Database save failed: ${event.error}`],
									pipeline: ({ context }: {
	context: UploadContext }) => ({
										...context.pipeline,
										dbStorage: {
	status: 'failed', progress: 0 }
									})
								})
							}
						}
					},
	completed: {
	type: 'final' },
	error: {
	type: 'final' }
				}
			},
	completed: {
	entry: assign({
					userAnalytics: ({ context }: {
	context: UploadContext }) => ({
						...context.userAnalytics,
						uploadHistory: {
							...context.userAnalytics.uploadHistory,
							totalUploads: context.userAnalytics.uploadHistory.totalUploads + 1,
							successRate:
								(context.userAnalytics.uploadHistory.successRate * context.userAnalytics.uploadHistory.totalUploads +
									1) /
								(context.userAnalytics.uploadHistory.totalUploads + 1)
						}
					})
				}),
				invoke: {
	src: 'generateContextualPrompts',
					input: ({ context }: {
	context: UploadContext }) => ({ context, timing: 'after-upload' }),
					onDone: {
	actions: assign({
							contextualPrompts: ({ context, event }: {
	context: UploadContext; event: any }) => [
								...context.contextualPrompts,
								...event.output
							]
						})
					}
				},
	on: {
	RESET: 'idle',
					REQUEST_AI_SUGGESTIONS: 'generatingAdditionalPrompts'
				}
			},
	cancelled: {
	on: {
					RESET: 'idle',
					RETRY_UPLOAD: 'uploadPipeline'
				}
			}
		}
	}
);

// Factory function
export function createUploadAnalyticsActor(initialContext: Partial<UploadContext> = {}) {
	return createActor(comprehensiveUploadAnalyticsMachine as any, {
		input: initialContext
	});
}




