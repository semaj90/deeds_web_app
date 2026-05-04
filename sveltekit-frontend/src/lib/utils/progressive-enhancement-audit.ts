// Progressive Enhancement Audit Utility
// Provides tools and guidelines for ensuring forms work without JavaScript

export interface FormAuditResult {
  formId: string;
  formAction?: string;
	method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  hasFormElement: boolean;
	hasActionAttribute: boolean;
  hasMethodAttribute: boolean;
	usesEnhance: boolean;
  usesSuperForms: boolean;
	hasClientValidation: boolean;
  hasServerValidation: boolean;
	hasProgressiveLabels: boolean;
  hasErrorHandling: boolean;
	hasAccessibilityFeatures: boolean;
  hasLoadingStates: boolean;
	compliance: {
    score: number;
	level: 'poor' | 'basic' | 'good' | 'excellent';
    issues: FormIssue[];
	recommendations: string[];
  };
}

export interface FormIssue {
  type: 'critical' | 'warning' | 'info';
  category: 'functionality' | 'accessibility' | 'ux' | 'performance';
  message: string;
  element?: string;
  fix?: string;
}

export interface ProgressiveEnhancementConfig {
  enableClientValidation: boolean;
	enableRealTimeValidation: boolean;
  enableAutoSave: boolean;
	enableOptimisticUpdates: boolean;
  showSubmitSpinner: boolean;
	disableFormDuringSubmit: boolean;
  showProgressIndicator: boolean;
	showInlineErrors: boolean;
  showSummaryErrors: boolean;
	preserveFormDataOnError: boolean;
  announceErrors: boolean;
	useLiveRegions: boolean;
  provideFocusManagement: boolean;
	includeSkipLinks: boolean;
  confirmBeforeLeaving: boolean;
	highlightRequiredFields: boolean;
  showCharacterCounts: boolean;
	enableKeyboardShortcuts: boolean;
}

export const DEFAULT_PE_CONFIG: ProgressiveEnhancementConfig = {
  enableClientValidation: true,
  enableRealTimeValidation: false,
  enableAutoSave: false,
  enableOptimisticUpdates: false,
  showSubmitSpinner: true,
  disableFormDuringSubmit: true,
  showProgressIndicator: false,
  showInlineErrors: true,
  showSummaryErrors: true,
  preserveFormDataOnError: true,
  announceErrors: true,
  useLiveRegions: true,
  provideFocusManagement: true,
  includeSkipLinks: false,
  confirmBeforeLeaving: false,
  highlightRequiredFields: true,
  showCharacterCounts: false,
  enableKeyboardShortcuts: false,
};

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

function normalizeMethod(method: string | null | undefined): HttpMethod {
  const m = (method || 'GET').toUpperCase();
  if (m === 'GET' || m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE') {
    return m as HttpMethod;
  }
  return 'GET';
}

export function auditFormElement(formElement: HTMLFormElement): FormAuditResult {
  const result: FormAuditResult = {
    formId: formElement.id || formElement.name || 'unnamed-form',
    formAction: formElement.action,
    method: normalizeMethod(formElement.method),
    hasFormElement: true,
    hasActionAttribute: !!formElement.action,
    hasMethodAttribute: !!formElement.method,
    usesEnhance: checkForEnhance(formElement),
    usesSuperForms: checkForSuperForms(formElement),
    hasClientValidation: checkForClientValidation(formElement),
    hasServerValidation: true,
    hasProgressiveLabels: checkForProgressiveLabels(formElement),
    hasErrorHandling: checkForErrorHandling(formElement),
    hasAccessibilityFeatures: checkForAccessibilityFeatures(formElement),
    hasLoadingStates: checkForLoadingStates(formElement),
    compliance: {
	score: 0, level: 'poor', issues: [], recommendations: [] },
	};

  calculateComplianceScore(result);
  generateRecommendations(result);
  return result;
}

function checkForEnhance(form: HTMLFormElement): boolean {
  return (
    form.hasAttribute('data-sveltekit-enhanced') ||
    form.hasAttribute('use:enhance') ||
    !!form.querySelector('[data-sveltekit-enhanced]')
  );
}

function checkForSuperForms(form: HTMLFormElement): boolean {
  return (
    !!form.querySelector('[data-superforms]') ||
    !!form.querySelector('.superforms-field') ||
    form.hasAttribute('data-superforms')
  );
}

function checkForClientValidation(form: HTMLFormElement): boolean {
  const inputs = form.querySelectorAll('input, select, textarea');
  return Array.from(inputs).some(
    (input) =>
      input.hasAttribute('required') ||
      input.hasAttribute('pattern') ||
      input.hasAttribute('min') ||
      input.hasAttribute('max') ||
      input.hasAttribute('minlength') ||
      input.hasAttribute('maxlength')
  );
}

function checkForProgressiveLabels(form: HTMLFormElement): boolean {
  const inputs = form.querySelectorAll('input, select, textarea');
  return Array.from(inputs).every((input) => {
    const id = input.id;
    if (!id) return false;
    const label = form.querySelector(`label[for="${id}"]`);
    return !!label || input.hasAttribute('aria-label') || input.hasAttribute('aria-labelledby');
  });
}

function checkForErrorHandling(form: HTMLFormElement): boolean {
  return (
    !!form.querySelector('[role="alert"]') ||
    !!form.querySelector('.error-message') ||
    !!form.querySelector('.field-error') ||
    !!form.querySelector('[aria-invalid]')
  );
}

function checkForAccessibilityFeatures(form: HTMLFormElement): boolean {
  const hasLiveRegion = !!form.querySelector('[aria-live]');
  const hasFieldsets = !!form.querySelector('fieldset');
  const hasSkipLinks = !!form.querySelector('a[href^="#"]');
  const hasAriaDescriptions = !!form.querySelector('[aria-describedby]');
  return hasLiveRegion || hasFieldsets || hasSkipLinks || hasAriaDescriptions;
}

function checkForLoadingStates(form: HTMLFormElement): boolean {
  return (
    !!form.querySelector('[data-loading]') ||
    !!form.querySelector('.loading') ||
    !!form.querySelector('[disabled][data-submit-state]')
  );
}

function calculateComplianceScore(result: FormAuditResult): void {
  let score = 0;
  const issues: FormIssue[] = [];

  if (result.hasFormElement) score += 5;
  if (result.hasActionAttribute) {
    score += 15;
  } else {
    issues.push({
      type: 'critical',
      category: 'functionality',
      message: 'Form lacks action attribute - will not work without JavaScript',
      element: 'form',
      fix: 'Add action="/api/form-handler" attribute to form element',
    });
  }

  if (result.hasMethodAttribute) {
    score += 10;
  } else {
    issues.push({
      type: 'warning',
      category: 'functionality',
      message: 'Form method not explicitly set - defaults to GET',
      element: 'form',
      fix: 'Add method="POST" attribute to form element',
    });
  }

  if (result.usesEnhance) {
    score += 10;
  } else {
    issues.push({
      type: 'warning',
      category: 'ux',
      message: 'Form does not use SvelteKit enhance - missing progressive enhancement',
      fix: 'Add, use:enhance action to form element',
    });
  }

  if (result.usesSuperForms) score += 10;
  if (result.hasClientValidation) score += 8;
  if (result.hasServerValidation) score += 7;

  if (result.hasProgressiveLabels) {
    score += 10;
  } else {
    issues.push({
      type: 'critical',
      category: 'accessibility',
      message: 'Form inputs missing proper labels',
      fix: 'Ensure all inputs have associated <label> elements or aria-label attributes',
    });
  }

  if (result.hasAccessibilityFeatures) {
    score += 10;
  } else {
    issues.push({
      type: 'warning',
      category: 'accessibility',
      message: 'Form lacks accessibility features like live regions or fieldsets',
      fix: 'Add aria-live regions for error announcements and fieldsets for grouping',
    });
  }

  if (result.hasErrorHandling) {
    score += 8;
  } else {
    issues.push({
      type: 'warning',
      category: 'ux',
      message: 'No error handling elements detected',
      fix: 'Add error message elements with role="alert" or aria-live="polite"',
    });
  }

  if (result.hasLoadingStates) {
    score += 7;
  } else {
    issues.push({
      type: 'info',
      category: 'ux',
      message: 'No loading state indicators found',
      fix: 'Add loading spinners and disable form during submission',
    });
  }

  let level: FormAuditResult['compliance']['level'];
  if (score >= 90) level = 'excellent';
  else if (score >= 75) level = 'good';
  else if (score >= 50) level = 'basic';
  else level = 'poor';

  result.compliance = { score, level, issues, recommendations: [] };
}

function generateRecommendations(result: FormAuditResult): void {
  const recommendations: string[] = [];
  if (!result.hasActionAttribute) {
    recommendations.push('Add server-side form handler endpoint and action attribute');
  }
  if (!result.usesEnhance) {
    recommendations.push('Use SvelteKit enhance action for progressive enhancement');
  }
  if (!result.usesSuperForms) {
    recommendations.push('Consider using SuperForms for better form management');
  }
  if (!result.hasProgressiveLabels) {
    recommendations.push('Ensure all form inputs have proper labels for accessibility');
  }
  if (!result.hasAccessibilityFeatures) {
    recommendations.push('Add ARIA attributes and live regions for better accessibility');
  }
  if (!result.hasErrorHandling) {
    recommendations.push('Implement comprehensive error handling with user feedback');
  }
  if (result.compliance.score < 75) {
    recommendations.push('Review progressive enhancement best practices');
    recommendations.push('Test form functionality with JavaScript disabled');
  }
  result.compliance.recommendations = recommendations;
}

export function auditAllForms(): FormAuditResult[] {
  if (typeof document === 'undefined') return []; // browser-only — needs DOM
  const forms = document.querySelectorAll('form');
  return Array.from(forms).map((form) => auditFormElement(form as HTMLFormElement));
}

export function generateAuditReport(results: FormAuditResult[]): string {
  const totalForms = results.length;
  const averageScore =
    totalForms === 0 ? 0 : results.reduce((sum, r) => sum + r.compliance.score, 0) / totalForms;
  const criticalIssues = results.flatMap((r) =>
    r.compliance.issues.filter((i) => i.type === 'critical')
  );
  const excellentFormsCount = results.filter((r) => r.compliance.level === 'excellent').length;

  return `
# Progressive Enhancement Audit Report

## Summary
- **Total Forms**: ${totalForms}
- **Average Score**: ${Math.round(averageScore)}/100
- **Excellent Forms**: ${excellentFormsCount}/${totalForms} (${totalForms === 0 ? 0 : Math.round((excellentFormsCount / totalForms) * 100)}%)
- **Critical Issues**: ${criticalIssues.length}

## Form Details
${results
  .map(
    (result) => `
### ${result.formId}
- **Score**: ${result.compliance.score}/100 (${result.compliance.level})
- **Action**: ${result.formAction || 'Missing'}
- **Method**: ${result.method}
- **Uses Enhance**: ${result.usesEnhance ? '✅' : '❌'}
- **Accessibility**: ${result.hasAccessibilityFeatures ? '✅' : '❌'}
**Issues**:
${result.compliance.issues.map((issue) => `- ${issue.type.toUpperCase()}: ${issue.message}`).join('\n')}
**Recommendations**:
${result.compliance.recommendations.map((rec) => `- ${rec}`).join('\n')}
`
  )
  .join('\n')}

## Next Steps
1. Address all critical issues first
2. Improve forms with scores below 75
3. Test all forms with JavaScript disabled
4. Implement missing accessibility features
5. Add comprehensive error handling
`;
}

// Form state interface
export interface FormState<T = Record<string, unknown>> {
  data: T;
	errors: Record<string, string>;
  touched: Record<string, boolean>;
  isDirty: boolean;
	isSubmitting: boolean;
  isValid: boolean;
}

// Progressive form utilities
export interface ProgressiveFormUtils<T = Record<string, unknown>> {
  config: ProgressiveEnhancementConfig;
	createFormState: (initialData?: Partial<T>) => FormState<T>;
  generateFieldId: (fieldName: string, formId: string) => string;
  generateErrorId: (fieldId: string) => string;
  validateRequired: (value: unknown, fieldName: string) => string | null;
  validateEmail: (value: unknown) => string | null;
  validateLength: (value: unknown, min: number, max: number) => string | null;
}

// Progressive enhancement validator for Svelte components
export function createProgressiveForm<T extends Record<string, unknown> = Record<string, unknown>>(
  config: Partial<ProgressiveEnhancementConfig> = {}
): ProgressiveFormUtils<T> {
  const mergedConfig: ProgressiveEnhancementConfig = { ...DEFAULT_PE_CONFIG, ...config };

  return {
    config: mergedConfig,

    createFormState(initialData: Partial<T> = {}): FormState<T> {
      return {
        data: initialData as T,
        errors: {},
	touched: {},
	isDirty: false,
        isSubmitting: false,
        isValid: true,
      };
    },
	generateFieldId(fieldName: string, formId: string): string {
      return `${formId}-${fieldName}`;
    },
	generateErrorId(fieldId: string): string {
      return `${fieldId}-error`;
    },
	validateRequired(value: unknown, fieldName: string): string | null {
      if (value === null || value === undefined || value === '') {
        return `${fieldName} is required`;
      }
      if (typeof value === 'string' && value.trim() === '') {
        return `${fieldName} is required`;
      }
      return null;
    },
	validateEmail(value: unknown): string | null {
      if (typeof value !== 'string') return null;
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        return 'Please enter a valid email address';
      }
      return null;
    },
	validateLength(value: unknown, min: number, max: number): string | null {
      if (typeof value !== 'string') return null;
      if (value.length < min) {
        return `Must be at least ${min} characters`;
      }
      if (value.length > max) {
        return `Must be no more than ${max} characters`;
      }
      return null;
    },
	};
}
