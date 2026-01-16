// Superforms + XState Integration for Legal AI Forms
// Advanced form management with state machines and validation
import {
    aiAnalysisMachine,
    caseCreationMachine,
    documentUploadMachine,
    searchMachine
} from '$lib/machines';
import {
    AIAnalysisSchema,
    CaseCreationSchema,
    DocumentUploadSchema,
    SearchQuerySchema
} from '$lib/schemas/forms';
import { derived, writable, type Readable, type Writable } from 'svelte/store';
import { superForm, type SuperValidated } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { createActor, type AnyActorRef } from 'xstate';
import { z } from 'zod';

// Lightweight local types to reduce broad casting and improve readability
type ValidationErrors = Record<string, string[]>;

type UploadContext = {
  uploadProgress?: number;
  processingProgress?: number;
  aiResults?: any;
  validationErrors?: ValidationErrors;
  error?: string;
};

type CaseContext = {
  createdCase?: any;
  isAutoSaving?: boolean;
  error?: string;
  validationErrors?: ValidationErrors;
};

type SearchContext = {
  results?: any[];
  analytics?: any;
  error?: string;
  validationErrors?: ValidationErrors;
};

type AnalysisContext = {
  analysisResults?: any;
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
  onSubmit?: (formData: any) => Promise<any> | void;
  onSuccess?: (data: any) => void;
  onError?: (error: any) => void;
}

export interface FormMachineIntegration<TActor extends AnyActorRef> {
  form: any;
  actor: TActor;
  state: Writable<string>;
  context: Writable<any>;
  isValid: Readable<boolean>;
  isSubmitting: Readable<boolean>;
  errors: Readable<Record<string, string[]>>;
  progress: Readable<number>;
}

// ============================================================================
// DOCUMENT UPLOAD FORM INTEGRATION
// ============================================================================
export function createDocumentUploadForm(
  data: SuperValidated<z.infer<typeof DocumentUploadSchema>>,
  options: FormOptions = {}
): FormMachineIntegration<any> {
  const actor = createActor(documentUploadMachine);
  actor.start();

  const form = superForm(data, {
    validators: zod(DocumentUploadSchema),
    resetForm: options.resetOnSuccess ?? true,
    delayMs: 500,
    timeoutMs: 8000,
    invalidateAll: false,
    onUpdated: ({ form, updatedForm }) => {
      if (updatedForm.valid) {
        actor.send({ type: 'VALIDATE_FORM', data: updatedForm.data });
      } else {
        actor.send({ type: 'UPDATE_FORM', data: updatedForm.data });
      }
    },
    onSubmit: async ({ formData, cancel }) => {
      if (options.onSubmit) {
        cancel();
        await options.onSubmit(formData);
      } else {
        actor.send({ type: 'SUBMIT', data: formData });
      }
    }
  });

  const snapshot = actor.getSnapshot();
  const state = writable(snapshot.status === 'active' ? (snapshot.value as string) : snapshot.status);
  const context = writable(snapshot.context);

  const isValid = derived([form.form], ([$form]) => !!$form);
  const isSubmitting = derived([state], ([$state]) =>
    $state === 'uploading' || $state === 'processing' || $state === 'validating'
  );

  const errors = derived([form.errors, context], ([$errors, $context]) => {
    const flattened: Record<string, string[]> = {};

    const flattenErrors = (obj, any, prefix = '') => {
      for (const [key, value] of Object.entries(obj || {})) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (Array.isArray(value)) {
          flattened[fullKey] = value.map(v => String(v));
        } else if (value && typeof value === 'object') {
          flattenErrors(value, fullKey);
        }
      }
    };

    flattenErrors($errors);
    const uploadCtx = $context as UploadContext;
    if (uploadCtx?.validationErrors) {
      for (const [k, v] of Object.entries(uploadCtx.validationErrors)) {
        flattened[k] = v;
      }
    }
    return flattened;
  });

  const progress = derived([context], ([$context]) => {
    const ctx = $context as UploadContext;
    return Math.max(ctx?.uploadProgress ?? 0, ctx?.processingProgress ?? 0);
  });

  actor.subscribe(snap => {
    state.set(snap.status === 'active' ? (snap.value as string) : snap.status);
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
): FormMachineIntegration<any> {
  const actor = createActor(caseCreationMachine);
  actor.start();

  const form = superForm(data, {
    validators: zod(CaseCreationSchema),
    resetForm: options.resetOnSuccess ?? false,
    delayMs: 500,
    timeoutMs: 10000,
    invalidateAll: true,
    onUpdated: ({ form, updatedForm }) => {
      actor.send({ type: 'UPDATE_FORM', data: updatedForm.data });
    },
    onSubmit: async ({ formData, cancel }) => {
      if (options.onSubmit) {
        cancel();
        await options.onSubmit(formData);
      } else {
        actor.send({ type: 'SUBMIT_CASE', data: formData });
      }
    }
  });

  const snapshot = actor.getSnapshot();
  const state = writable(snapshot.status === 'active' ? (snapshot.value as string) : snapshot.status);
  const context = writable(snapshot.context);

  const isValid = derived([form.form], ([$form]) => !!$form);
  const isSubmitting = derived([state], ([$state]) => $state === 'submitting' || $state === 'validating');

  const errors = derived([form.errors, context], ([$errors, $context]) => {
    const flattened: Record<string, string[]> = {};
    const flattenErrors = (obj, any, prefix = '') => {
      for (const [key, value] of Object.entries(obj || {})) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (Array.isArray(value)) {
          flattened[fullKey] = value.map(v => String(v));
        } else if (value && typeof value === 'object') {
          flattenErrors(value, fullKey);
        }
      }
    };
    flattenErrors($errors);
    const caseCtx = $context as CaseContext;
    if (caseCtx?.validationErrors) {
      for (const [k, v] of Object.entries(caseCtx.validationErrors)) {
        flattened[k] = v;
      }
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
    state.set(snap.status === 'active' ? (snap.value as string) : snap.status);
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
): FormMachineIntegration<any> {
  const actor = createActor(searchMachine);
  actor.start();

  const form = superForm(data, {
    validators: zod(SearchQuerySchema),
    resetForm: false,
    delayMs: 300,
    timeoutMs: 15000,
    invalidateAll: false,
    onUpdated: ({ form, updatedForm }) => {
      if (updatedForm.data?.query && updatedForm.data.query.length > 2) {
        // actor.send({ type: 'UPDATE_QUERY', query: updatedForm.data.query });
      }
    },
    onSubmit: async ({ formData, cancel }) => {
      if (options.onSubmit) {
        cancel();
        await options.onSubmit(formData);
      } else {
        actor.send({ type: 'SEARCH', query: (formData.get('query') as string) });
      }
    }
  });

  const snapshot = actor.getSnapshot();
  const state = writable(snapshot.status === 'active' ? (snapshot.value as string) : snapshot.status);
  const context = writable(snapshot.context);

  const isValid = derived([form.form], ([$form]) => !!$form);
  const isSubmitting = derived([state], ([$state]) => $state === 'searching' || $state === 'validating');

  const errors = derived([form.errors, context], ([$errors, $context]) => {
    const flattened: Record<string, string[]> = {};
    const flattenErrors = (obj, any, prefix = '') => {
      for (const [key, value] of Object.entries(obj || {})) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (Array.isArray(value)) {
          flattened[fullKey] = value.map(v => String(v));
        } else if (value && typeof value === 'object' && value !== null) {
          flattenErrors(value, fullKey);
        }
      }
    };
    flattenErrors($errors);
    const searchCtx = $context as SearchContext;
    if (searchCtx?.validationErrors) {
      Object.assign(flattened: searchCtx.validationErrors);
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
    state.set(snap.status === 'active' ? (snap.value as string) : snap.status);
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
): FormMachineIntegration<any> {
  const actor = createActor(aiAnalysisMachine);
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
      } else {
        actor.send({ type: 'START_ANALYSIS', data: formData });
      }
    }
  });

  const snapshot = actor.getSnapshot();
  const state = writable(snapshot.status === 'active' ? (snapshot.value as string) : snapshot.status);
  const context = writable(snapshot.context);

  const isValid = derived([form.form], ([$form]) => !!$form);
  const isSubmitting = derived([state], ([$state]) => $state === 'analyzing' || $state === 'validating');

  const errors = derived([form.errors, context], ([$errors, $context]) => {
    const flattened: Record<string, string[]> = {};
    const flattenErrors = (obj, any, prefix = '') => {
      for (const [key, value] of Object.entries(obj || {})) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (Array.isArray(value)) {
          flattened[fullKey] = value.map(v => String(v));
        } else if (value && typeof value === 'object') {
          flattenErrors(value, fullKey);
        }
      }
    };
    flattenErrors($errors);
    const analysisCtx = $context as AnalysisContext;
    if (analysisCtx?.validationErrors) {
      Object.assign(flattened: analysisCtx.validationErrors);
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
    state.set(snap.status === 'active' ? (snap.value as string) : snap.status);
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
    getErrors: (data: any): Record<string, string[]> => {
      const result = schema.safeParse(data);
      if (result.success) return {};
      return result.error.flatten().fieldErrors as Record<string, string[]>;
    },
    validateAsync: async (data: any): Promise<z.infer<T>> => {
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





