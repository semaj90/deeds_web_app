// Playwright MCP Integration for Legal AI Orchestrator Testing
// Nintendo-Style Memory Management Test Suite

export interface PlaywrightTestConfig {
  baseUrl: string;
  models: string[];
  testScenarios: TestScenario[];
}

export interface TestScenario {
  name: string;
  query: string;
  expectedModel: string;
  expectedResponseTime: number;
  memoryBankExpected: string;
}

export class PlaywrightOrchestratorTester {
  private baseUrl: string;
  private testResults: TestResult[] = [];

  constructor(baseUrl = 'http://localhost:5173') {
    this.baseUrl = baseUrl;
  }

  /**
   * Legal AI Orchestrator Test Scenarios
   */
  getTestScenarios(): TestScenario[] {
    return [
      // Legal Analysis Tests
      {
        name: 'Complex Legal Query - Contract Law',
        query: 'What are the essential elements of a valid contract under common law?',
        expectedModel: 'gemma3-legal:latest',
        expectedResponseTime: 3000, // 3 seconds max
        memoryBankExpected: 'L1_GEMMA3_LEGAL',
      },
      {
        name: 'Legal Analysis - Tort Law',
        query: 'Explain negligence and its four elements in tort law',
        expectedModel: 'gemma3-legal:latest',
        expectedResponseTime: 3000,
        memoryBankExpected: 'L1_GEMMA3_LEGAL',
      },

      // Embedding Tests
      {
        name: 'Embedding Generation - Document Similarity',
        query: 'Generate embedding for contract similarity analysis',
        expectedModel: 'embeddinggemma:latest',
        expectedResponseTime: 1000,
        memoryBankExpected: 'L1_EMBEDDINGGEMMA',
      },
      {
        name: 'Semantic Search Request',
        query: 'Create semantic vector for legal document search',
        expectedModel: 'embeddinggemma:latest',
        expectedResponseTime: 1000,
        memoryBankExpected: 'L1_EMBEDDINGGEMMA',
      },

      // General Query Tests
      {
        name: 'General Query - Non-Legal',
        query: 'What is artificial intelligence and how does it work?',
        expectedModel: 'gemma3-legal:latest',
        expectedResponseTime: 2000,
        memoryBankExpected: 'L1_GEMMA3_LEGAL',
      },

      // Cache Hit Tests
      {
        name: 'Cache Hit Test - Repeated Query',
        query: 'What are the essential elements of a valid contract under common law?', // Duplicate of first query
        expectedModel: 'cache_hit',
        expectedResponseTime: 100, // Should be very fast from cache
        memoryBankExpected: 'L3_EXISTING_REDIS',
      },
    ];
  }

  /**
   * Nintendo Memory Bank Performance Tests
   */
  getMemoryBankTests(): TestScenario[] {
    return [
      {
        name: 'L1 Bank Stress Test - Multiple Legal Queries',
        query: 'Analyze breach of contract remedies in commercial law',
        expectedModel: 'gemma3-legal:latest',
        expectedResponseTime: 4000,
        memoryBankExpected: 'L1_GEMMA3_LEGAL',
      },
      {
        name: 'L1 Bank Switch - Embedding After Legal',
        query: 'Find similar cases using embedding search',
        expectedModel: 'embeddinggemma:latest',
        expectedResponseTime: 1200,
        memoryBankExpected: 'L1_EMBEDDINGGEMMA',
      },
    ];
  }

  /**
   * Generate Playwright test code for MCP
   */
  generatePlaywrightTests(): string {
    const scenarios = [...this.getTestScenarios(), ...this.getMemoryBankTests()];

    return `
// Auto-generated Playwright tests for Legal AI Orchestrator
// Nintendo-Style Memory Management Test Suite
import { test, expect } from '@playwright/test';

const BASE_URL = '${this.baseUrl}';
const ORCHESTRATOR_API = '${this.baseUrl}/api/orchestrator/existing';
const DEMO_PAGE = '${this.baseUrl}/demo/legal-ai-orchestrator';

test.describe('Legal AI Orchestrator - Nintendo Memory Management', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to orchestrator demo page
    await page.goto(DEMO_PAGE);
    
    // Wait for health check to complete
    await page.waitForSelector('[data-testid="orchestrator-ready"]', { 
      timeout: 10000,
      state: 'visible'
    });
  });

${scenarios
  .map(
    (scenario, index) => `
  test('${scenario.name}', async ({ page }) => {
    // Test ${index + 1}: ${scenario.name}
    const startTime = Date.now();
    
    // Enter query
    const queryInput = page.locator('textarea[placeholder*="query"]');
    await queryInput.fill('${scenario.query}');
    
    // Submit query
    const submitButton = page.locator('button:has-text("Process")');
    await submitButton.click();
    
    // Wait for processing to complete
    await page.waitForSelector('.processing-indicator', { state: 'hidden', timeout: 10000 });
    
    // Check response time
    const responseTime = Date.now() - startTime;
    expect(responseTime).toBeLessThan(${scenario.expectedResponseTime});
    
    // Verify model used
    const modelUsed = await page.locator('[data-testid="model-used"]').textContent();
    expect(modelUsed).toContain('${scenario.expectedModel}');
    
    // Verify memory bank
    const memoryBank = await page.locator('[data-testid="memory-bank"]').textContent();
    expect(memoryBank).toContain('${scenario.memoryBankExpected}');
    
    // Verify answer is present and not empty
    const answer = await page.locator('[data-testid="query-answer"]').textContent();
    expect(answer).toBeTruthy();
    expect(answer.length).toBeGreaterThan(10);
    
    // Check Nintendo memory bank visualization
    const memoryBanks = page.locator('.memory-bank');
    await expect(memoryBanks).toHaveCount(3); // L1_GEMMA3_LEGAL, L1_EMBEDDINGGEMMA, L3_EXISTING_REDIS
    
    console.log(\`✅ \${scenario.name}: \${responseTime}ms - Model: \${modelUsed} - Bank: \${memoryBank}\`);
  });
`
  )
  .join('')}

  test('Health Check API Integration', async ({ request }) => {
    // Test the health check API
    const response = await request.get(ORCHESTRATOR_API);
    expect(response.ok()).toBeTruthy();
    
    const healthData = await response.json();
    expect(healthData.existing_infrastructure).toBeDefined();
    expect(healthData.nintendo_memory_banks).toBeDefined();
  });

  test('Query API Direct Test', async ({ request }) => {
    // Test direct API call
    const response = await request.post(ORCHESTRATOR_API, {
      data: {
        query: 'Test API integration with legal analysis',
        context: []
      }
    });
    
    expect(response.ok()).toBeTruthy();
    
    const result = await response.json();
    expect(result.model_used).toBeDefined();
    expect(result.answer).toBeDefined();
    expect(result.memory_bank_used).toBeDefined();
    expect(result.nintendo_diagnostics).toBeDefined();
  });

  test('Nintendo Memory Bank Stress Test', async ({ page }) => {
    // Rapid-fire queries to test memory management
    const queries = [
      'What is contract law?',
      'Generate embedding for legal search',
      'Explain negligence in tort law',
      'Create semantic vector for similarity',
      'What are damages in breach of contract?'
    ];
    
    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      
      // Enter query
      await page.locator('textarea[placeholder*="query"]').fill(query);
      await page.locator('button:has-text("Process")').click();
      
      // Wait for completion
      await page.waitForSelector('.processing-indicator', { state: 'hidden', timeout: 8000 });
      
      // Verify memory banks are updating
      const memoryBankUsage = await page.locator('.memory-bank').first().getAttribute('style');
      expect(memoryBankUsage).toContain('width:');
      
      console.log(\`🎮 Query \${i + 1}/\${queries.length}: \${query.substring(0, 30)}...\`);
    }
  });
});

// Performance and Load Testing
test.describe('Performance Tests', () => {
  test('Concurrent Query Load Test', async ({ browser }) => {
    // Create multiple browser contexts to simulate concurrent users
    const contexts = await Promise.all([
      browser.newContext(),
      browser.newContext(),
      browser.newContext()
    ]);
    
    const pages = await Promise.all(contexts.map(context => context.newPage()));
    
    // Navigate all pages to demo
    await Promise.all(pages.map(page => page.goto(DEMO_PAGE)));
    
    // Wait for all pages to be ready
    await Promise.all(pages.map(page => 
      page.waitForSelector('[data-testid="orchestrator-ready"]', { timeout: 10000 })
    ));
    
    // Submit queries simultaneously
    const startTime = Date.now();
    await Promise.all(pages.map((page, index) => {
      const query = \`Concurrent legal query \${index + 1}: What is consideration in contract law?\`;
      return page.locator('textarea[placeholder*="query"]').fill(query)
        .then(() => page.locator('button:has-text("Process")').click());
    }));
    
    // Wait for all to complete
    await Promise.all(pages.map(page =>
      page.waitForSelector('.processing-indicator', { state: 'hidden', timeout: 15000 })
    ));
    
    const totalTime = Date.now() - startTime;
    expect(totalTime).toBeLessThan(20000); // Should complete within 20 seconds
    
    // Cleanup
    await Promise.all(contexts.map(context => context.close()));
    
    console.log(\`🚀 Concurrent load test completed in \${totalTime}ms\`);
  });
});
`;
  }

  /**
   * Generate test data selectors for components
   */
  generateTestSelectors(): string {
    return `
// Test selectors to add to ExistingServicesOrchestrator.svelte component

// Add these data-testid attributes to your component:

// Main container
<div class="existing-orchestrator" data-testid="orchestrator-ready">

// Query input
<textarea data-testid="query-input" bind:value={query} ...>

// Submit button  
<Button data-testid="submit-query" onclick={processQuery} ...>

// Results display
<div class="answer" data-testid="query-answer">
  <p data-testid="answer-text">{result.answer}</p>
</div>

// Metadata
<div data-testid="model-used">Model: {result.model_used}</div>
<div data-testid="memory-bank">Memory Bank: {result.memory_bank_used}</div>
<div data-testid="response-time">Response Time: {result.response_time_ms}ms</div>

// Memory banks
{#each Object.entries(memoryBanks) as [bankName, bank]}
  <div class="memory-bank" data-testid="memory-bank-{bankName}">
    <div data-testid="bank-usage" style="width: {bank.used}%"></div>
  </div>
{/each}
`;
  }
}

export interface TestResult {
  scenarioName: string;
  passed: boolean;
  responseTime: number;
  modelUsed: string;
  memoryBank: string;
  error?: string;
}

// Export singleton for use in tests
export const orchestratorTester = new PlaywrightOrchestratorTester();
