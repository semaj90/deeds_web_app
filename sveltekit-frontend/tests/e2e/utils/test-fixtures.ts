/**
 * Test Fixtures for E2E Testing
 *
 * Provides common test data and fixtures for user flow tests.
 * These fixtures support the login, case creation, and evidence upload flows.
 *
 * @module tests/e2e/utils/test-fixtures
 * @validates Requirements 2.1-2.6, 3.1-3.7
 */

/**
 * Test credentials for authentication flows
 */
export interface TestCredentials {
  username: string;
  password: string;
  email?: string;
}

/**
 * Test case data for case creation flows
 */
export interface TestCaseData {
  title: string;
  description: string;
  caseType: string;
  jurisdiction?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Test evidence data for evidence upload flows
 */
export interface TestEvidenceData {
  filename: string;
  filePath: string;
  mimeType: string;
  description?: string;
  tags?: string[];
}

/**
 * Route configuration for navigation testing
 */
export interface TestRoute {
  path: string;
  name: string;
  requiresAuth: boolean;
  expectedTitle?: string;
  expectedElements?: string[];
}

/**
 * Default test credentials for login flow testing
 * @validates Requirements 2.1, 2.2
 */
export const testCredentials: TestCredentials = {
  username: 'test_user',
  password: 'test_password_123',
  email: 'test@yorha-legal.ai',
};

/**
 * Admin test credentials for elevated access testing
 */
export const adminCredentials: TestCredentials = {
  username: 'admin',
  password: 'admin_password_123',
  email: 'admin@yorha-legal.ai',
};

/**
 * Default test case data for case creation flow
 * @validates Requirements 2.3, 2.4
 */
export const testCaseData: TestCaseData = {
  title: 'E2E Test Case - Automated',
  description: 'This case was created by automated E2E testing to verify the case creation workflow.',
  caseType: 'civil',
  jurisdiction: 'Federal',
  priority: 'medium',
};

/**
 * Alternative test case data for variety in testing
 */
export const alternativeTestCaseData: TestCaseData = {
  title: 'Criminal Investigation - E2E Test',
  description: 'Criminal case for E2E testing of evidence management features.',
  caseType: 'criminal',
  jurisdiction: 'State',
  priority: 'high',
};

/**
 * Default test evidence data for evidence upload flow
 * @validates Requirements 2.5, 2.6
 */
export const testEvidenceData: TestEvidenceData = {
  filename: 'test-document.pdf',
  filePath: 'tests/fixtures/test-document.pdf',
  mimeType: 'application/pdf',
  description: 'Test document for E2E evidence upload verification',
  tags: ['e2e-test', 'automated', 'document'],
};

/**
 * Image evidence data for testing image uploads
 */
export const imageEvidenceData: TestEvidenceData = {
  filename: 'test-image.png',
  filePath: 'tests/fixtures/test-image.png',
  mimeType: 'image/png',
  description: 'Test image for E2E evidence upload verification',
  tags: ['e2e-test', 'automated', 'image'],
};

/**
 * Application routes for navigation testing
 * @validates Requirements 3.1-3.7
 */
export const testRoutes: TestRoute[] = [
  // Public routes (no auth required)
  {
    path: '/',
    name: 'Homepage',
    requiresAuth: false,
    expectedTitle: 'YoRHa Legal AI',
    expectedElements: ['[data-testid="new-case-button"]', '[data-testid="global-search"]'],
  },
  {
    path: '/login',
    name: 'Login',
    requiresAuth: false,
    expectedTitle: 'Login',
    expectedElements: ['[data-testid="login-form"]', '[data-testid="username-input"]'],
  },
  {
    path: '/health',
    name: 'Health Check',
    requiresAuth: false,
    expectedTitle: 'Health',
  },

  // App routes (auth required - grouped under (app))
  {
    path: '/dashboard',
    name: 'Dashboard',
    requiresAuth: true,
    expectedTitle: 'Dashboard',
    expectedElements: ['[data-testid="dashboard-content"]'],
  },
  {
    path: '/cases',
    name: 'Cases List',
    requiresAuth: true,
    expectedTitle: 'Cases',
    expectedElements: ['[data-testid="cases-list"]'],
  },
  {
    path: '/cases/new',
    name: 'New Case',
    requiresAuth: true,
    expectedTitle: 'New Case',
  },
  {
    path: '/evidence',
    name: 'Evidence Board',
    requiresAuth: true,
    expectedTitle: 'Evidence',
    expectedElements: ['[data-testid="evidence-board"]'],
  },
  {
    path: '/evidence-library',
    name: 'Evidence Library',
    requiresAuth: true,
    expectedTitle: 'Evidence Library',
    expectedElements: ['[data-testid="evidence-library"]'],
  },
  {
    path: '/persons-of-interest',
    name: 'Persons of Interest',
    requiresAuth: true,
    expectedTitle: 'Persons of Interest',
  },
  {
    path: '/global-search',
    name: 'Global Search',
    requiresAuth: true,
    expectedTitle: 'Search',
  },
  {
    path: '/command-center',
    name: 'Command Center',
    requiresAuth: true,
    expectedTitle: 'Command Center',
  },
  {
    path: '/terminal',
    name: 'Terminal',
    requiresAuth: true,
    expectedTitle: 'Terminal',
  },

  // Utility routes
  {
    path: '/chat',
    name: 'Chat',
    requiresAuth: false,
    expectedTitle: 'Chat',
  },
  {
    path: '/knowledge',
    name: 'Knowledge Base',
    requiresAuth: false,
    expectedTitle: 'Knowledge',
  },
  {
    path: '/rag-search',
    name: 'RAG Search',
    requiresAuth: false,
    expectedTitle: 'RAG Search',
  },

  // Admin routes
  {
    path: '/admin/error-analysis',
    name: 'Error Analysis',
    requiresAuth: true,
    expectedTitle: 'Error Analysis',
  },
  {
    path: '/admin/topology',
    name: 'Topology',
    requiresAuth: true,
    expectedTitle: 'Topology',
  },
];

/**
 * Navigation buttons expected on the homepage
 * @validates Requirements 3.2, 3.7, 4.1
 */
export const homepageButtons = [
  {
    selector: '[data-testid="new-case-button"]',
    expectedAction: 'modal',
    description: '+ NEW CASE button',
  },
  {
    selector: '[data-testid="dashboard-link"]',
    expectedAction: 'navigate',
    expectedTarget: '/dashboard',
    description: 'Dashboard navigation',
  },
  {
    selector: '[data-testid="cases-link"]',
    expectedAction: 'navigate',
    expectedTarget: '/cases',
    description: 'Cases navigation',
  },
  {
    selector: '[data-testid="evidence-link"]',
    expectedAction: 'navigate',
    expectedTarget: '/evidence',
    description: 'Evidence navigation',
  },
];

/**
 * Selectors for common UI elements
 */
export const commonSelectors = {
  // Navigation
  sidebar: '[data-testid="sidebar"]',
  header: '[data-testid="header"]',
  mainContent: '[data-testid="main-content"]',

  // Forms
  loginForm: '[data-testid="login-form"]',
  caseForm: '[data-testid="case-form"]',
  evidenceUpload: '[data-testid="evidence-upload"]',

  // Buttons
  submitButton: '[data-testid="submit-button"]',
  cancelButton: '[data-testid="cancel-button"]',
  newCaseButton: '[data-testid="new-case-button"]',

  // Dialogs
  dialog: '[data-testid="dialog"]',
  dialogTitle: '[data-testid="dialog-title"]',
  dialogClose: '[data-testid="dialog-close"]',

  // Feedback
  successMessage: '[data-testid="success-message"]',
  errorMessage: '[data-testid="error-message"]',
  loadingSpinner: '[data-testid="loading-spinner"]',
};

/**
 * Timeout configurations for different operations
 */
export const timeouts = {
  /** Short timeout for quick operations */
  short: 5000,
  /** Medium timeout for standard operations */
  medium: 15000,
  /** Long timeout for file uploads and complex operations */
  long: 30000,
  /** Extended timeout for full page loads with backend calls */
  extended: 60000,
};
