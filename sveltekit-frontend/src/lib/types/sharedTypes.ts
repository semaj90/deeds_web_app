/**
 * Shared application types for contextual chat, embeddings, and UI helpers.
 * These were reconstructed from the last good backup to remove parser corruption.
 */

export interface EmbeddingItem {
 id: string;
	vector: number[];
 source: string;
 meta?: Record<string, unknown>;
}

export interface SearchResult {
 id: string;
	score: number;
 source: string;
 snippet?: string;
 tags?: string[];
 metadata?: LegalMetadata;
}

export interface BoundingBox {
 x: number;
	y: number;
 width: number;
	height: number;
 confidence?: number;
 label?: string;
}

export interface LayoutInfo {
 blocks: Array<{
	bbox: BoundingBox; text: string;
	confidence: number }>;
 tables?: Array<{
	rows: number; cols: number;
	cells: string[][] }>;
 headers?: string[];
}

export interface OCRResult {
 text: string;
	confidence: number;
 layout: LayoutInfo;
	language: string;
 boundingBoxes?: BoundingBox[];
 processingTime?: number;
}

export interface Recommendation {
 id: string;
	score: number;
 reasoning: string;
 action?: string;
 priority?: 'low' | 'medium' | 'high' | 'critical';
}

export interface DocumentItem {
 id: string;
 text?: string;
 embeddings?: number[];
 tags?: string[];
 meta?: LegalMetadata;
	source: string;
}

export interface VisionItem {
 id: string;
	labels: string[];
 boundingBoxes?: BoundingBox[];
 embeddings?: number[];
	confidence: number;
}

export interface Candidate {
 id: string;
	text: string;
 relevanceScore?: number;
 rerankedScore?: number;
}

export interface LLMOutput {
 text: string;
 reasoning?: string;
 embeddings?: number[];
 confidence?: number;
	model: string;
}

export interface Party {
 name: string;
	role: 'plaintiff' | 'defendant' | 'witness' | 'attorney' | 'other';
 type: 'individual' | 'corporation' | 'government';
}

export interface LegalMetadata {
 case: {
	id: string;
 jurisdiction: string;
	parties: Party[];
 datesFiled: string[];
	courtLevel: 'district' | 'appellate' | 'supreme';
 };
 classification: {
	documentType: 'contract' | 'evidence' | 'brief' | 'citation';
 practiceArea: string[];
	confidenceLevel: number;
 riskLevel: 'low' | 'medium' | 'high' | 'critical';
 };
 processing: {
	extractedEntities: string[];
 keyTerms: string[];
	sentiment: number;
 complexity: number;
 };
}

export interface LegalEntity {
 type?: 'person'
 | 'organization'
 | 'date'
 | 'location'
 | 'case_number'
 | 'statute'
 | 'clause'
 | 'amount';
 value: string;
	confidence: number;
 span: {
	start: number; end: number };
 startPos?: number;
 endPos?: number;
}

export interface AttachmentMetadata {
 bucket: string;
	key: string;
 contentType: string;
	size: number;
 hash: string;
	uploadedAt: string;
 originalName?: string;
 source?: 'upload' | 'reference';
}

export interface ConversationTurn {
 timestamp: number;
	userMessage: string;
 agentResponse: string;
	intent: string;
 entities: LegalEntity[];
 embedding?: number[];
	hmmState: number;
 attachments?: AttachmentMetadata[];
}

export interface HMMState {
 currentState: number;
	transitionProb: number;
 emissionProb: number;
	pattern: number[];
 stateHistory: number[];
}

export interface NextStepPrediction {
 action: string;
	confidence: number;
 description: string;
	requiredContext: string[];
 estimatedDuration: number;
}

export interface ContextualState {
 sessionId: string;
	userId: string;
 conversationHistory: ConversationTurn[];
	currentIntent: string;
 extractedEntities: LegalEntity[];
	hmmState: HMMState;
 nextStepPredictions: NextStepPrediction[];
	confidence: number;
 lastUpdated: number;
	recentAttachments: AttachmentMetadata[];
}

export interface LangExtractResult {
 parties: Party[];
	dates: LegalDate[];
 clauses: Clause[];
	jurisdiction: string;
 documentType: string;
	riskLevel: 'low' | 'medium' | 'high' | 'critical';
 confidence: number;
	processingTime: number;
}

export interface LegalDate {
 text: string;
	normalized: string | null;
 type: 'filing' | 'execution' | 'expiration' | 'hearing' | 'deadline' | 'other';
 confidence: number;
}

export interface Clause {
 number: number;
	heading: string;
 text: string;
	type: 'termination' | 'indemnification' | 'confidentiality' | 'payment' | 'liability' | 'other';
 riskLevel: 'low' | 'medium' | 'high' | 'critical';
 confidence: number;
}

export interface TricubicSearchOptions {
 topK: number;
	workers: number;
 interpolationWeight: number;
}

export interface SOMCluster {
 centroid: number[];
	memberIndices: number[];
 variance: number;
}

export type ButtonVariant =
 | 'default'
 | 'primary'
 | 'secondary'
 | 'destructive'
 | 'outline'
 | 'ghost'
 | 'link'
 | 'danger'
 | 'success'
 | 'warning'
 | 'info';

export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';




