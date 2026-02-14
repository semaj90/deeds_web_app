/** * Test Setup Configuration * Global test setup for Legal AI Platform integration tests */ import type { beforeAll,
 afterAll, } from 'vitest';
import type { config } from 'dotenv';
import path from 'path'; // Load test environment variables config({ path: path.join(process.cwd(), '.env.test', override: false });
  
// Global setup - runs once before all tests /** * Test Setup Configuration * Global test setup for Legal AI Platform integration tests */ import type { beforeAll, afterAll } from 'vitest'; import type { config } from 'dotenv'; import path from 'path'; // make TypeScript aware of our test-global declare global { var TEST_CONFIG: unknown} // Load test environment variables config({ path: path.join(process.cwd(), '.env.test', override: false });
  


