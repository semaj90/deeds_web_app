# Design Document

## Overview

This design document outlines the comprehensive approach to remediate Svelte 5 errors, test user flows, verify routes, and align the UI with the intended UX design for the YoRHa Legal AI Platform. The system uses a multi-phase approach combining automated fix scripts, end-to-end testing with Playwright, and systematic UI component updates.

The architecture leverages the existing SvelteKit 2.0 frontend with Svelte 5 runes, Bits UI 2.0 headless components, and integrates with the backend stack (PostgreSQL, Redis, MinIO, Qdrant) via SSR and API routes.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Svelte5 Comprehensive Testing                     │
│                         & Remediation System                         │
└─────────────────────────────────────────────────────────────────────┘
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        │                          │                          │
        ▼                          ▼                          ▼
┌───────────────────┐   ┌───────────────────┐   ┌───────────────────┐
│  Error Remediation │   │   User Flow       │   │   UI/UX           │
│  Pipeline          │   │   Testing         │   │   Alignment       │
├───────────────────┤   ├───────────────────┤   ├───────────────────┤
│ • Syntax Repair    │   │ • Login Flow      │   │ • Homepage        │
│ • Bits-UI Migration│   │ • Case Creation   │   │ • Navigation      │
│ • A11y Fixes       │   │ • Evidence Upload │   │ • Bits-UI         │
│ • Import Fixes     │   │ • Data Display    │   │ • NES.css Theme   │
└───────────────────┘   └───────────────────┘   └───────────────────┘
        │                          │                          │
        └──────────────────────────┼──────────────────────────┘
                                   │
                                   ▼
                    ┌───────────────────────────┐
                    │    Backend Integration    │
                    ├───────────────────────────┤
                    │ • PostgreSQL (legal_ai_db)│
                    │ • MinIO (evidence bucket) │
                    │ • Redis (session/cache)   │
                    │ • Qdrant (vector search)  │
                    └───────────────────────────┘
```

## Components and Interfaces

### 1. Error Remediation Pipeline

The error remediation pipeline processes files in priority order, applying automated fixes using multi-pass pattern matching.

```typescript
interface ErrorRemediationConfig {
  targetDirectory: string;
  maxPasses: number;
  dryRun: boolean;
  patterns: FixPattern[];
}

interface FixPattern {
  name: string;
  regex: RegExp;
  replacement: string | ((match: string, ...groups: string[]) => string);
  fileFilter?: (path: string) => boolean;
}

interface RemediationResult {
  filesProcessed: number;
  filesModified: number;
  fixesApplied: number;
  errorsRemaining: number;
  unfixableFiles: string[];
}
```

**Key Fix Patterns:**
- **Bits-UI Import Migration**: Convert old imports to Svelte 5 patterns
- **Colon-Chain Corruption**: Fix `key: value: key: value` patterns
- **A11y Label Association**: Add proper `for` attributes to labels
- **Type Import Syntax**: Fix `import { type X }` patterns

### 2. User Flow Testing Module

End-to-end testing using Playwright to verify complete user workflows.

```typescript
interface UserFlowTest {
  name: string;
  steps: TestStep[];
  screenshots: ScreenshotConfig[];
}

interface TestStep {
  action: 'navigate' | 'click' | 'fill' | 'upload' | 'wait' | 'assert';
  target?: string;
  value?: string;
  timeout?: number;
}

interface ScreenshotConfig {
  name: string;
  afterStep: number;
  fullPage: boolean;
}

interface FlowTestResult {
  passed: boolean;
  steps: StepResult[];
  screenshots: string[];
  duration: number;
}
```

**Test Flows:**
1. **Login Flow**: Navigate to /login → Fill credentials → Submit → Verify redirect
2. **Case Creation Flow**: Click "+ NEW CASE" → Fill form → Submit → Verify persistence
3. **Evidence Upload Flow**: Select case → Upload file → Verify MinIO storage → Verify display

### 3. Route Verification System

Systematic verification of all routes and button mappings.

```typescript
interface RouteConfig {
  path: string;
  component: string;
  requiresAuth: boolean;
  buttons: ButtonMapping[];
}

interface ButtonMapping {
  selector: string;
  action: 'navigate' | 'modal' | 'submit' | 'custom';
  target?: string;
  handler?: string;
}

interface RouteTestResult {
  route: string;
  loaded: boolean;
  buttons: ButtonTestResult[];
  errors: string[];
}
```

**Routes to Verify:**
- `/` - Homepage with navigation
- `/login` - Authentication
- `/(app)/dashboard` - Main dashboard
- `/(app)/cases` - Case list
- `/(app)/cases/[id]` - Case detail
- `/(app)/evidence` - Evidence board
- `/(app)/evidence-library` - Evidence library

### 4. UI Component Alignment

Bits-UI component patterns for Svelte 5 runes compatibility.

```svelte
<!-- Correct Bits-UI Button Pattern -->
<script lang="ts">
  import { Button } from 'bits-ui';

  let { onclick, children, variant = 'default' }: {
    onclick?: () => void;
    children?: import('svelte').Snippet;
    variant?: 'default' | 'primary' | 'danger';
  } = $props();
</script>

<Button.Root class="nes-btn {variant === 'primary' ? 'is-primary' : ''}" {onclick}>
  {@render children?.()}
</Button.Root>
```

```svelte
<!-- Correct Bits-UI Dialog Pattern -->
<script lang="ts">
  import { Dialog } from 'bits-ui';

  let open = $state(false);
</script>

<Dialog.Root bind:open>
  <Dialog.Trigger asChild let:builder>
    <button use:builder.action {...builder} class="nes-btn">
      Open Dialog
    </button>
  </Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay class="dialog-overlay" />
    <Dialog.Content class="nes-dialog">
      <Dialog.Title>Title</Dialog.Title>
      <Dialog.Description>Description</Dialog.Description>
      <Dialog.Close />
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

## Data Models

### Error Tracking Model

```typescript
interface ErrorEntry {
  file: string;
  line: number;
  column: number;
  code: string;
  message: string;
  category: 'syntax' | 'type' | 'a11y' | 'import' | 'svelte5';
  severity: 'error' | 'warning';
  fixable: boolean;
  fixPattern?: string;
}

interface ErrorReport {
  timestamp: Date;
  totalErrors: number;
  totalWarnings: number;
  byCategory: Record<string, number>;
  byFile: Record<string, ErrorEntry[]>;
  topFiles: { file: string; count: number }[];
}
```

### Test Result Model

```typescript
interface TestSuiteResult {
  name: string;
  startTime: Date;
  endTime: Date;
  passed: number;
  failed: number;
  skipped: number;
  tests: TestResult[];
  screenshots: Screenshot[];
}

interface Screenshot {
  name: string;
  path: string;
  step: string;
  timestamp: Date;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Error Count Reduction

*For any* execution of the error remediation pipeline, the resulting svelte-check error count SHALL be less than or equal to the initial error count, and the final count SHALL be below 500 errors.

**Validates: Requirements 1.1**

### Property 2: Bits-UI Syntax Compliance

*For any* Svelte component file that imports from 'bits-ui', the component SHALL use the Svelte 5 runes pattern (Button.Root, Dialog.Root, etc.) and SHALL NOT use deprecated Svelte 4 patterns (export let, on:click).

**Validates: Requirements 1.2, 4.3**

### Property 3: Accessibility Compliance

*For any* HTML label element in the codebase, if the label is associated with a form control, it SHALL have either a `for` attribute matching the control's `id` or SHALL wrap the control element directly.

**Validates: Requirements 1.3**

### Property 4: Import Resolution

*For any* TypeScript or Svelte file with import statements, all imports SHALL resolve to valid modules without "Cannot find module" errors.

**Validates: Requirements 1.4**

### Property 5: Syntax Corruption Elimination

*For any* TypeScript or Svelte file in the codebase, there SHALL be zero instances of colon-chain corruption patterns (e.g., `key: value: key: value`).

**Validates: Requirements 1.5**

### Property 6: Navigation Button Routing

*For any* navigation button in the application, clicking the button SHALL result in navigation to the correct route as defined in the button's configuration, and the target page SHALL load without errors.

**Validates: Requirements 3.2, 3.7**

## Error Handling

### Remediation Error Handling

```typescript
interface RemediationError {
  file: string;
  pattern: string;
  error: Error;
  recoverable: boolean;
}

// Error handling strategy
async function handleRemediationError(error: RemediationError): Promise<void> {
  // Log error for manual review
  await logUnfixableFile(error.file, error.error.message);

  // Continue with remaining files
  if (error.recoverable) {
    console.warn(`Skipping ${error.file}: ${error.error.message}`);
  } else {
    // Restore file from backup
    await restoreFromBackup(error.file);
  }
}
```

### Test Error Handling

```typescript
// Graceful test failure handling
async function handleTestFailure(test: TestStep, error: Error): Promise<void> {
  // Capture screenshot on failure
  await captureScreenshot(`failure-${test.action}-${Date.now()}.png`);

  // Log detailed error context
  console.error(`Test failed at step: ${test.action}`, {
    target: test.target,
    error: error.message,
    stack: error.stack
  });

  // Continue with remaining tests if possible
}
```

### Backend Integration Error Handling

```typescript
// Backend service unavailability handling
async function handleBackendError(service: string, error: Error): Promise<void> {
  // Display user-friendly error message
  const errorMessage = getServiceErrorMessage(service);

  // Log for debugging
  console.error(`Backend service ${service} unavailable:`, error);

  // Attempt reconnection with exponential backoff
  await retryWithBackoff(() => checkServiceHealth(service));
}

function getServiceErrorMessage(service: string): string {
  const messages: Record<string, string> = {
    'postgresql': 'Database connection unavailable. Please try again later.',
    'minio': 'File storage service unavailable. Evidence upload temporarily disabled.',
    'redis': 'Session service unavailable. Please refresh the page.',
    'qdrant': 'Search service unavailable. Search functionality temporarily disabled.'
  };
  return messages[service] || 'Service temporarily unavailable.';
}
```

## Testing Strategy

### Dual Testing Approach

This system uses both unit tests and property-based tests for comprehensive coverage:

**Unit Tests** (specific examples and edge cases):
- Login form validation
- Case creation form submission
- Evidence file upload handling
- Route navigation behavior
- Error message display

**Property-Based Tests** (universal properties):
- Error count reduction verification
- Bits-UI syntax compliance scanning
- Accessibility attribute verification
- Import resolution validation
- Navigation routing correctness

### Test Configuration

```typescript
// vitest.config.ts additions
export default defineConfig({
  test: {
    include: ['**/*.{test,spec}.{js,ts}'],
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html']
    }
  }
});
```

### Property-Based Testing with fast-check

Each correctness property will be implemented using fast-check with minimum 100 iterations:

```typescript
import { fc } from 'fast-check';

// Feature: svelte5-comprehensive-testing-remediation
// Property 1: Error Count Reduction
test.prop([fc.array(fc.string())], { numRuns: 100 })(
  'error count should decrease after remediation',
  async (files) => {
    const before = await countErrors();
    await runRemediation(files);
    const after = await countErrors();
    expect(after).toBeLessThanOrEqual(before);
  }
);
```

### End-to-End Testing with Playwright

```typescript
// playwright.config.ts
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // Sequential for user flow tests
  retries: 2,
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'on',
    video: 'retain-on-failure'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ]
});
```

### Screenshot Verification

Each successful test step captures a screenshot for visual verification:

```typescript
async function captureStepScreenshot(
  page: Page,
  stepName: string,
  options: { fullPage?: boolean } = {}
): Promise<string> {
  const filename = `screenshots/${stepName}-${Date.now()}.png`;
  await page.screenshot({
    path: filename,
    fullPage: options.fullPage ?? false
  });
  return filename;
}
```

