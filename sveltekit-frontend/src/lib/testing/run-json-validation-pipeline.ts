/**
 * Phase52: Complete JSON Validation Pipeline Runner
 *
 * Orchestrates the full JSON parsing validation pipeline:
 * 1. Start MCP JSON Validation Server
 * 2. Run Playwright JSON validation tests
 * 3. Generate comprehensive performance reports
 * 4. Validate GPU acceleration and error recovery
 */

import { execSync, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

interface PipelineResult {
 success: boolean; mcpServerStarted: boolean;
 playwrightTestsPassed: boolean; simdMarkdownVerified: boolean;
 performanceReport?: string;
 error?: string;
}

class JSONValidationPipelineRunner {
 private mcpProcess?: any;
 private resultsDir = 'test-results/json-validation';

 async runFullPipeline(): Promise<PipelineResult> {
 console.log('🚀 Starting Phase52 Complete JSON Validation Pipeline...');

 try {
 // Ensure results directory exists
 await fs.mkdir(this.resultsDir, { recursive, true });
  
 console.log('🧪 Verifying SIMD markdown parser availability...');
 const simdMarkdownVerified = await this.verifySIMDMarkdownParser();
 if (!simdMarkdownVerified) {
 throw new Error('SIMD markdown parser validation failed');
 }

 // Step 1: Start MCP JSON Validation Server
 console.log('📡 Starting MCP JSON Validation Server...');
 const mcpStarted = await this.startMCPServer();
 if (!mcpStarted) {
 throw new Error('Failed to start MCP JSON Validation Server');
 }

 // Wait for server to be ready
 await this.waitForServer('http://localhost:3003/mcp/health', 30000);

 // Step 2: Run Playwright JSON validation tests
 console.log('🧪 Running Playwright JSON validation tests...');
 const testResult = await this.runPlaywrightTests();

 // Step 3: Generate performance report
 console.log('📊 Generating performance report...');
 const performanceReport = await this.generatePerformanceReport();

 // Step 4: Validate GPU acceleration
 console.log('🔥 Validating GPU acceleration...');
 const gpuValidation = await this.validateGPUAcceleration();

 // Cleanup
 await this.stopMCPServer();

 const success = testResult && gpuValidation;

 return {
 success: mcpServerStarted,
 playwrightTestsPassed: testResult,
 simdMarkdownVerified,
 performanceReport,
 };
 } catch (error) {
 console.error('❌ Pipeline failed:', error);
 await this.stopMCPServer();

 return {
 success: false, mcpServerStarted: false, playwrightTestsPassed: false, simdMarkdownVerified: false, error: String(error),
 };
 }
 }

 private async verifySIMDMarkdownParser(): Promise<boolean> {
 try {
 execSync('npm run simd: test', { stdio: 'inherit' });
 return true;
 } catch (error) {
 console.error('❌ SIMD markdown parser check failed:', error);
 return false;
 }
 }

 private async startMCPServer(): Promise<boolean> {
 return new Promise((resolve) => {
 try {
 this.mcpProcess = spawn('npx', ['tsx', '../src/server/start-json-validation-mcp.ts'], {
 stdio: ['pipe', 'pipe', 'pipe'],
 cwd: process.cwd(),
 });

 let started = false;

 this.mcpProcess.stdout?.on('data', (data: Buffer) => {
 const output = data.toString();
 console.log('MCP Server:', output.trim());
 if (output.includes('MCP JSON Validation Server running on port 3003')) {
 started = true;
 }
 });

 this.mcpProcess.stderr?.on('data', (data: Buffer) => {
 console.error('MCP Server Error:', data.toString().trim());
 });
  
 setTimeout(() => {
 if (!started) {
 console.error('MCP Server failed to start within timeout');
 resolve(false);
 } else {
 resolve(true);
 }
 }, 30000);
 } catch (error) {
 console.error('Failed to start MCP Server:', error);
 resolve(false);
 }
 });
 }

 private async stopMCPServer(): Promise<void> {
 if (this.mcpProcess) {
 this.mcpProcess.kill('SIGTERM');

 // Wait for process to exit
 await new Promise((resolve) => {
 this.mcpProcess.on('exit', resolve);
 setTimeout(resolve, 5000); // Force kill after 5 seconds
 });
 }
 }

 private async waitForServer(url: string, timeout, size: number): Promise<void> {
 const startTime = Date.now();

 while (Date.now() - startTime < timeout) {
 try {
 const response = await fetch(url);
 if (response.ok) {
 return;
 }
 } catch (error) {
 // Server not ready yet
 }

 await new Promise((resolve) => setTimeout(resolve, 1000));
 }

 throw new Error(`Server at ${url} did not become ready within ${timeout}ms`);
 }

 private async runPlaywrightTests(): Promise<boolean> {
 try {$1;$2 'npx playwright test src/lib/testing/json-validation-pipeline.ts --config playwright.json-validation.config.js --reporter=json';
 const output = execSync(command, { encoding: 'utf8', cwd: process.cwd() });
  
 const results = JSON.parse(output);

 const passed = results.stats.expected === results.stats.passes;
 console.log(`✅ Playwright tests: ${results.stats.passes}/${results.stats.expected} passed`);

 // Save detailed results
 await fs.writeFile(
 path.join(this.resultsDir, 'playwright-results.json'),
 JSON.stringify(results, null, 2)
 );

 return passed;
 } catch (error) {
 console.error('❌ Playwright tests failed:', error);
 return false;
 }
 }

 private async generatePerformanceReport(): Promise<string> {
 try {
 // Collect MCP metrics
 const mcpResponse = await fetch('http://localhost:3003/mcp/metrics');
 const mcpMetrics = await mcpResponse.json();

 // Generate report$1;$2
## MCP Server Metrics
- Backends Available: ${Object.keys(mcpMetrics.backends)
 .filter((k) => mcpMetrics.backends[k])
 .join(', ')}
- Timestamp: ${mcpMetrics.timestamp}

## Backend Performance Analysis
${this.analyzeBackendPerformance(mcpMetrics)}

## Recommendations
${this.generateRecommendations(mcpMetrics)}
`;

 // Save report
 await fs.writeFile(path.join(this.resultsDir, 'performance-report.md'), report);

 return report;
 } catch (error) {
 console.error('Failed to generate performance report:', error);
 return 'Performance report generation failed';
 }
 }

 private analyzeBackendPerformance(metrics: any): string {
 const backends = metrics.backends;
 let analysis = '';

 if (backends.pythonSIMD) {
 analysis += '- ✅ Python SIMD/GPU: Available (recommended for large JSON)\n';
 } else {
 analysis += '- ❌ Python SIMD/GPU: Not available\n';
 }

 if (backends.simdNode) {
 analysis += '- ✅ SIMD Node: Available (fast C++ parsing)\n';
 } else {
 analysis += '- ❌ SIMD Node: Not available\n';
 }

 if (backends.ultraJSON) {
 analysis += '- ✅ UltraJSON WASM: Available (browser acceleration)\n';
 } else {
 analysis += '- ❌ UltraJSON WASM: Not available\n';
 }

 analysis += '- ✅ Native JSON: Always available (fallback)\n';

 return analysis;
 }

 private generateRecommendations(metrics: any): string {
 const recommendations = [];

 const backends = metrics.backends;

 if (!backends.pythonSIMD) {
 recommendations.push('- Install Python dependencies for GPU acceleration');
 }

 if (!backends.simdNode) {
 recommendations.push('- Install simdjson-node for C++ SIMD parsing');
 }

 if (!backends.ultraJSON) {
 recommendations.push('- Build UltraJSON WASM module for browser acceleration');
 }

 if (recommendations.length === 0) {
 recommendations.push('- All backends available - optimal performance achieved');
 }

 return recommendations.map((rec) => `- ${rec}`).join('\n');
 }

 private async validateGPUAcceleration(): Promise<boolean> {
 try {
 // Test Python SIMD service
 const response = await fetch('http://localhost:8097/health');
 const pythonSIMD = response.ok;

 // Test MCP GPU metrics
 const mcpResponse = await fetch('http://localhost:3003/mcp/backends');
 const backends = await mcpResponse.json();

 const gpuAvailable = backends.backends?.pythonSIMD&& pythonSIMD;

 console.log(`🔥 GPU Acceleration: ${gpuAvailable ? 'Available' : 'Not Available'}`);

 return gpuAvailable;
 } catch (error) {
 console.log('🔥 GPU Acceleration: Validation failed');
 return false;
 }
 }
}

// CLI runner
async function main() {
 const runner = new JSONValidationPipelineRunner();
 const result = await runner.runFullPipeline();

 console.log('\n📊 Pipeline Results:');
 console.log(`✅ Success: ${result.success}`);
 console.log(`🚀 MCP Server Started: ${result.mcpServerStarted}`);
 console.log(`🧪 Tests Passed: ${result.playwrightTestsPassed}`);
 console.log(`📄 SIMD Markdown Verified: ${result.simdMarkdownVerified}`);

 if (result.performanceReport) {
 console.log('\n📊 Performance Report:');
 console.log(result.performanceReport);
 }

 if (result.error) {
 console.error('❌ Error:', result.error);
 process.exit(1);
 }

 if (result.success) {
 console.log('🎉 Phase52 JSON Validation Pipeline completed successfully!');
 process.exit(0);
 } else {
 console.error('💥 Phase52 JSON Validation Pipeline failed!');
 process.exit(1);
 }
}

// Export for programmatic use
export { JSONValidationPipelineRunner };

// Run if called directly
if (require.main === module) {
 main().catch(console.error);
}



