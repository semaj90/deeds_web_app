// Superforms + XState Integration for Legal AI Forms
// Advanced form management with state machines and validation
import { derived, writable, type Readable, type Writable } from 'svelte/store';
import { superValidate, type SuperValidated } from 'sveltekit-superforms/server';
import { superForm } from 'sveltekit-superforms/client';
import { zod } from 'sveltekit-superforms/adapters';
import { createActor, type AnyActorRef } from 'xstate';
import { z } from 'zod';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

// Lightweight local types to reduce broad casting and improve readability
type ValidationErrors = Record<string, string[]>;

type UploadContext = {
  uploadProgress?: number;
  processingProgress?: number;
  aiResults?: unknown;
  validationErrors?: ValidationErrors;
  error?: string;
};

type CaseContext = {
  createdCase?: unknown;
  isAutoSaving?: boolean;
  error?: string;
  validationErrors?: ValidationErrors;
};

type SearchContext = {
  results?: unknown[];
  analytics?: unknown;
  error?: string;
  validationErrors?: ValidationErrors;
};

type AnalysisContext = {
  analysisResults?: unknown;
  confidence?: number;
  processingTime?: number;
  tokensUsed?: number;
  isStreaming?: boolean;
  error?: string;
  validationErrors?: ValidationErrors;
};

export interface FormOptions {
  autoSave?: boolean;
  autoSaveDelay?: number;
  resetOnSuccess?: boolean;
  onSubmit?: (formData: unknown) => Promise<unknown> | void;
  onSuccess?: (data: unknown) => void;
  onError?: (error: unknown) => void;
}

export interface FormMachineIntegration<TActor extends AnyActorRef> {
  form: ReturnType<typeof superForm>;
  actor: TActor;
	state: Writable<string>;
  context: Writable<unknown>;
	isValid: Readable<boolean>;
  isSubmitting: Readable<boolean>;
	errors: Readable<Record<string, string[]>>;
  progress: Readable<number>;
}

// Placeholder schemas - these should be imported from actual schema files
const DocumentUploadSchema = z.object({
  file: z.any().optional(),
  caseId: z.string().optional(),
  description: z.string().optional()
});

const CaseCreationSchema = z.object({
  name: z.string().min(1),
  caseType: z.string().optional(),
  description: z.string().optional()
});

const SearchQuerySchema = z.object({
  query: z.string().min(1),
  filters: z.record(z.unknown()).optional()
});

const AIAnalysisSchema = z.object({
  documentId: z.string(),
  analysisType: z.string().optional(),
  options: z.record(z.unknown()).optional()
});

// Placeholder machines - these should be imported from actual machine files
const createPlaceholderMachine = () => ({
  id: 'placeholder',
  initial: 'idle',
  states: {
	idle: {},
	processing: {},
	done: {},
	error: {}
  }
});

const documentUploadMachine = createPlaceholderMachine();
const caseCreationMachine = createPlaceholderMachine();
const searchMachine = createPlaceholderMachine();
const aiAnalysisMachine = createPlaceholderMachine();

// Helper function to flatten errors
function flattenErrors(obj: Record<string, unknown>, prefix = ''): Record<string, string[]> {
  const flattened: Record<string, string[]> = {};

  for (const [key, value] of Object.entries(obj || {})) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(value)) {
      flattened[fullKey] = value.map(v => String(v));
    } else if (value && typeof value === 'object') {
      Object.assign(flattened, flattenErrors(value as Record<string, unknown>, fullKey));
    }
  }

  return flattened;
}

// ============================================================================
// DOCUMENT UPLOAD FORM INTEGRATION
// ============================================================================
export function createDocumentUploadForm(
  data: SuperValidated<z.infer<typeof DocumentUploadSchema>>,
  options: FormOptions = {}
): FormMachineIntegration<ReturnType<typeof createActor>> {
  const actor = createActor(documentUploadMachine as Parameters<typeof createActor>[0]);
  actor.start();

  const form = superForm(data, {
    validators: zod(DocumentUploadSchema),
    resetForm: options.resetOnSuccess ?? true,
    delayMs: 500,
    timeoutMs: 8000,
    invalidateAll: false,
    onUpdated: ({
	form: _form }) => {
      // Handle form updates
    },
	onSubmit: async ({ formData, cancel }) => {
      if (options.onSubmit) {
        cancel();
        await options.onSubmit(formData);
      }
    }
  });

  const snapshot = actor.getSnapshot();
  const state = writable(snapshot.status === 'active' ? String(snapshot.value) : snapshot.status);
  const context = writable(snapshot.context);

  const isValid = derived([form.form], ([$form]) => !!$form);
  const isSubmitting = derived([state], ([$state]) =>
    $state === 'uploading' || $state === 'processing' || $state === 'validating'
  );

  const errors = derived([form.errors, context], ([$errors, $context]) => {
    const flattened = flattenErrors($errors as Record<string, unknown>);
    const uploadCtx = $context as UploadContext;
    if (uploadCtx?.validationErrors) {
      Object.assign(flattened, uploadCtx.validationErrors);
    }
    return flattened;
  });

  const progress = derived([context], ([$context]) => {
    const ctx = $context as UploadContext;
    return Math.max(ctx?.uploadProgress ?? 0, ctx?.processingProgress ?? 0);
  });

  actor.subscribe(snap => {
    state.set(snap.status === 'active' ? String(snap.value) : snap.status);
    context.set(snap.context);

    if (snap.status === 'done' && options.onSuccess) {
      options.onSuccess((snap.context as UploadContext).aiResults);
    } else if (snap.status === 'error' && options.onError) {
      options.onError((snap.context as UploadContext).error ?? 'Upload failed');
    }
  });

  return { form, actor, state, context, isValid, isSubmitting, errors, progress };
}

// ============================================================================
// CASE CREATION FORM INTEGRATION
// ============================================================================
export function createCaseCreationForm(
  data: SuperValidated<z.infer<typeof CaseCreationSchema>>,
  options: FormOptions = {}
): FormMachineIntegration<ReturnType<typeof createActor>> {
  const actor = createActor(caseCreationMachine as Parameters<typeof createActor>[0]);
  actor.start();

  const form = superForm(data, {
    validators: zod(CaseCreationSchema),
    resetForm: options.resetOnSuccess ?? false,
    delayMs: 500,
    timeoutMs: 10000,
    invalidateAll: true,
    onUpdated: ({
	form: _form }) => {
      // Handle form updates
    },
	onSubmit: async ({ formData, cancel }) => {
      if (options.onSubmit) {
        cancel();
        await options.onSubmit(formData);
      }
    }
  });

  const snapshot = actor.getSnapshot();
  const state = writable(snapshot.status === 'active' ? String(snapshot.value) : snapshot.status);
  const context = writable(snapshot.context);

  const isValid = derived([form.form], ([$form]) => !!$form);
  const isSubmitting = derived([state], ([$state]) => $state === 'submitting' || $state === 'validating');

  const errors = derived([form.errors, context], ([$errors, $context]) => {
    const flattened = flattenErrors($errors as Record<string, unknown>);
    const caseCtx = $context as CaseContext;
    if (caseCtx?.validationErrors) {
      Object.assign(flattened, caseCtx.validationErrors);
    }
    return flattened;
  });

  const progress = derived([state, context], ([$state, $context]) => {
    const ctx = $context as CaseContext;
    if ($state === 'completed' || $state === 'done') return 100;
    if ($state === 'submitting') return 80;
    if ($state === 'validating') return 60;
    if ($state === 'editing' && ctx?.isAutoSaving) return 30;
    return 0;
  });

  actor.subscribe(snap => {
    state.set(snap.status === 'active' ? String(snap.value) : snap.status);
    context.set(snap.context);

    if (snap.status === 'done' && options.onSuccess) {
      options.onSuccess((snap.context as CaseContext).createdCase);
    } else if (snap.status === 'error' && options.onError) {
      options.onError((snap.context as CaseContext).error);
    }
  });

  return { form, actor, state, context, isValid, isSubmitting, errors, progress };
}

// ============================================================================
// SEARCH FORM INTEGRATION
// ============================================================================
export function createSearchForm(
  data: SuperValidated<z.infer<typeof SearchQuerySchema>>,
  options: FormOptions = {}
): FormMachineIntegration<ReturnType<typeof createActor>> {
  const actor = createActor(searchMachine as Parameters<typeof createActor>[0]);
  actor.start();

  const form = superForm(data, {
    validators: zod(SearchQuerySchema),
    resetForm: false,
    delayMs: 300,
    timeoutMs: 15000,
    invalidateAll: false,
    onUpdated: ({
	form: _form }) => {
      // Handle form updates
    },
	onSubmit: async ({ formData, cancel }) => {
      if (options.onSubmit) {
        cancel();
        await options.onSubmit(formData);
      }
    }
  });

  const snapshot = actor.getSnapshot();
  const state = writable(snapshot.status === 'active' ? String(snapshot.value) : snapshot.status);
  const context = writable(snapshot.context);

  const isValid = derived([form.form], ([$form]) => !!$form);
  const isSubmitting = derived([state], ([$state]) => $state === 'searching' || $state === 'validating');

  const errors = derived([form.errors, context], ([$errors, $context]) => {
    const flattened = flattenErrors($errors as Record<string, unknown>);
    const searchCtx = $context as SearchContext;
    if (searchCtx?.validationErrors) {
      Object.assign(flattened, searchCtx.validationErrors);
    }
    return flattened;
  });

  const progress = derived([state], ([$state]) => {
    if ($state === 'results' || $state === 'done') return 100;
    if ($state === 'searching') return 60;
    if ($state === 'validating') return 20;
    return 0;
  });

  actor.subscribe(snap => {
    state.set(snap.status === 'active' ? String(snap.value) : snap.status);
    context.set(snap.context);

    if (snap.status === 'done' && options.onSuccess) {
      const searchCtx = snap.context as SearchContext;
      options.onSuccess({ results: searchCtx.results, analytics: searchCtx.analytics });
    } else if (snap.status === 'error' && options.onError) {
      options.onError((snap.context as SearchContext).error ?? 'Search failed');
    }
  });

  return { form, actor, state, context, isValid, isSubmitting, errors, progress };
}

// ============================================================================
// AI ANALYSIS FORM INTEGRATION
// ============================================================================
export function createAIAnalysisForm(
  data: SuperValidated<z.infer<typeof AIAnalysisSchema>>,
  options: FormOptions = {}
): FormMachineIntegration<ReturnType<typeof createActor>> {
  const actor = createActor(aiAnalysisMachine as Parameters<typeof createActor>[0]);
  actor.start();

  const form = superForm(data, {
    validators: zod(AIAnalysisSchema),
    resetForm: options.resetOnSuccess ?? false,
    delayMs: 500,
    timeoutMs: 30000,
    invalidateAll: false,
    onSubmit: async ({ formData, cancel }) => {
      if (options.onSubmit) {
        cancel();
        await options.onSubmit(formData);
      }
    }
  });

  const snapshot = actor.getSnapshot();
  const state = writable(snapshot.status === 'active' ? String(snapshot.value) : snapshot.status);
  const context = writable(snapshot.context);

  const isValid = derived([form.form], ([$form]) => !!$form);
  const isSubmitting = derived([state], ([$state]) => $state === 'analyzing' || $state === 'validating');

  const errors = derived([form.errors, context], ([$errors, $context]) => {
    const flattened = flattenErrors($errors as Record<string, unknown>);
    const analysisCtx = $context as AnalysisContext;
    if (analysisCtx?.validationErrors) {
      Object.assign(flattened, analysisCtx.validationErrors);
    }
    return flattened;
  });

  const progress = derived([state, context], ([$state, $context]) => {
    const ctx = $context as AnalysisContext;
    if ($state === 'completed' || $state === 'done') return 100;
    if ($state === 'analyzing') return ctx?.isStreaming ? 70 : 50;
    if ($state === 'validating') return 10;
    return 0;
  });

  actor.subscribe(snap => {
    state.set(snap.status === 'active' ? String(snap.value) : snap.status);
    context.set(snap.context);

    if (snap.status === 'done' && options.onSuccess) {
      const analysisCtx = snap.context as AnalysisContext;
      options.onSuccess({
        results: analysisCtx.analysisResults,
        confidence: analysisCtx.confidence,
        processingTime: analysisCtx.processingTime,
        tokensUsed: analysisCtx.tokensUsed
      });
    } else if (snap.status === 'error' && options.onError) {
      options.onError((snap.context as AnalysisContext).error ?? 'Analysis failed');
    }
  });

  return { form, actor, state, context, isValid, isSubmitting, errors, progress };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
export function createFormValidator<T extends z.ZodType>(schema: T) {
  return {
    validate: (data: unknown): data is z.infer<T> => {
      return schema.safeParse(data).success;
    },
	getErrors: (data: unknown): Record<string, string[]> => {
      const result = schema.safeParse(data);
      if (result.success) return {};
      return result.error.flatten().fieldErrors as Record<string, string[]>;
    },
	validateAsync: async (data: unknown): Promise<z.infer<T>> => {
      return schema.parseAsync(data);
    }
  };
}

export const formValidators = {
  documentUpload: createFormValidator(DocumentUploadSchema),
  caseCreation: createFormValidator(CaseCreationSchema),
  searchQuery: createFormValidator(SearchQuerySchema),
  aiAnalysis: createFormValidator(AIAnalysisSchema)
};

export const FORM_STORAGE_KEYS = {
  DOCUMENT_UPLOAD: 'deeds-document-upload',
  CASE_CREATION: 'deeds-case-creation',
  SEARCH_QUERY: 'deeds-search-query',
  AI_ANALYSIS: 'deeds-ai-analysis'
} as const;
