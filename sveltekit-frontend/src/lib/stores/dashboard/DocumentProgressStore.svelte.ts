/**
 * Document Progress Store - Svelte 5 Runes (Session 30)
 *
 * Tracks document OCR/AI processing progress with page-level status.
 * Replaces writable/derived pattern with class-based reactive store.
 */
import type { ProcessingEvent } from './SSEStatusStore.svelte.js';

export interface PageStatus {
	pageNumber: number;
	status: 'complete' | 'processing' | 'pending' | 'error';
	stage?: string;
	timestamp?: Date;
	errorMessage?: string;
}

export interface ProcessingError {
	timestamp: Date;
	stage: string;
	message: string;
	recoverable: boolean;
}

class DocumentProgressStore {
	documentId = $state('');
	documentTitle = $state('');
	isProcessing = $state(false);
	currentEvent = $state<ProcessingEvent | null>(null);
	pageStatuses = $state<Map<number, PageStatus>>(new Map());
	fallbackActive = $state(false);
	fallbackConfidence = $state(0);
	errors = $state<ProcessingError[]>([]);
	startTime = $state<Date | null>(null);
	completionTime = $state<Date | undefined>(undefined);

	// Derived from currentEvent
	overallProgress = $derived(this.currentEvent?.percent ?? 0);
	currentStage = $derived(this.currentEvent?.stage ?? '');
	etaSeconds = $derived(this.currentEvent?.eta ?? 0);
	currentPage = $derived(this.currentEvent?.page ?? 0);
	totalPages = $derived(this.currentEvent?.pages_total ?? 0);
	processingStatus = $derived(this.currentEvent?.status ?? 'Waiting for processing...');
	processingDetails = $derived(this.currentEvent?.details ?? '');

	// Derived from pageStatuses
	pageStatusesArray = $derived.by(() => {
		return Array.from(this.pageStatuses.values()).sort((a, b) => a.pageNumber - b.pageNumber);
	});

	completedPagesCount = $derived.by(() => {
		return this.pageStatusesArray.filter((p) => p.status === 'complete').length;
	});

	errorPagesCount = $derived.by(() => {
		return this.pageStatusesArray.filter((p) => p.status === 'error').length;
	});

	initializeDocument(documentId: string, documentTitle: string, totalPages: number) {
		const pageStatuses = new Map<number, PageStatus>();
		for (let i = 1; i <= totalPages; i++) {
			pageStatuses.set(i, {
				pageNumber: i,
				status: 'pending',
			});
		}

		this.documentId = documentId;
		this.documentTitle = documentTitle;
		this.isProcessing = true;
		this.currentEvent = null;
		this.pageStatuses = pageStatuses;
		this.fallbackActive = false;
		this.fallbackConfidence = 0;
		this.errors = [];
		this.startTime = new Date();
		this.completionTime = undefined;
	}

	updateFromEvent(event: ProcessingEvent) {
		this.currentEvent = event;

		// Update page status
		if (event.page > 0 && event.page <= event.pages_total) {
			const pageStatus: PageStatus = {
				pageNumber: event.page,
				status: event.percent === 100 ? 'complete' : 'processing',
				stage: event.stage,
				timestamp: new Date(),
			};
			const updated = new Map(this.pageStatuses);
			updated.set(event.page, pageStatus);
			this.pageStatuses = updated;
		}

		// Check for fallback
		if (event.stage === 'tesseract_fallback') {
			this.fallbackActive = true;
			this.fallbackConfidence = event?.confidence ?? 0;
		}

		// Check for completion
		if (event.percent === 100 && event.page === event.pages_total) {
			this.isProcessing = false;
			this.completionTime = new Date();
		}
	}

	addError(stage: string, message: string, recoverable: boolean = true) {
		this.errors = [
			...this.errors,
			{
				timestamp: new Date(),
				stage,
				message,
				recoverable,
			},
		];
	}

	setFallbackActive(active: boolean, confidence?: number) {
		this.fallbackActive = active;
		if (confidence !== undefined) {
			this.fallbackConfidence = confidence;
		}
	}

	completePage(pageNumber: number) {
		const pageStatus = this.pageStatuses.get(pageNumber);
		if (pageStatus) {
			const updated = new Map(this.pageStatuses);
			updated.set(pageNumber, {
				...pageStatus,
				status: 'complete',
				timestamp: new Date(),
			});
			this.pageStatuses = updated;
		}
	}

	errorPage(pageNumber: number, errorMessage: string) {
		const pageStatus = this.pageStatuses.get(pageNumber);
		if (pageStatus) {
			const updated = new Map(this.pageStatuses);
			updated.set(pageNumber, {
				...pageStatus,
				status: 'error',
				errorMessage,
				timestamp: new Date(),
			});
			this.pageStatuses = updated;
		}
	}

	complete() {
		this.isProcessing = false;
		this.completionTime = new Date();
	}

	reset() {
		this.documentId = '';
		this.documentTitle = '';
		this.isProcessing = false;
		this.currentEvent = null;
		this.pageStatuses = new Map();
		this.fallbackActive = false;
		this.fallbackConfidence = 0;
		this.errors = [];
		this.startTime = null;
		this.completionTime = undefined;
	}

	clearErrors() {
		this.errors = [];
	}
}

export const documentProgressStore = new DocumentProgressStore();
