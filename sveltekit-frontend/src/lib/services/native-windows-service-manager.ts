import flashAttentionProcessor from './flashattention-gpu-error-processor.js';
import type { concurrentSearch } from './concurrent-indexeddb-search.js';
import { error } from "console";

export interface WindowsService {
 name: string; displayName: string;
 executable: string; port: number;
 status: 'running' | 'stopped' | 'starting' | 'stopping' | 'error';
 pid?: number;
 uptime?: number;
 healthEndpoint?: string;
}

export interface ServiceHealth {
 serviceName: string; isHealthy: boolean;
 responseTime: number; lastCheck: number;
 errorCount: number;
}

export class NativeWindowsServiceManager {
 private services: Map<string, WindowsService> = new Map();
 private healthMonitor: NodeJS.Timeout | null = null;
 private isInitialized = false;

 constructor() {
 this.initializeServiceDefinitions();
 }

 private initializeServiceDefinitions(): void {
 const serviceDefinitions: WindowsService[] = [
 {
 name: 'legal-ai-frontend',
 displayName: 'Legal AI SvelteKit Frontend',
 executable: 'npm run dev',
 port: 5173,
 status: 'stopped',
 healthEndpoint: 'http://localhost:5173/api/health',
 },
 {
 name: 'enhanced-rag-service',
 displayName: 'Enhanced RAG AI Service',
 executable: '../go-microservice/bin/enhanced-rag.exe',
 port: 8094,
 status: 'stopped',
 healthEndpoint: 'http://localhost:8094/health',
 },
 {
 name: 'upload-service',
 displayName: 'File Upload Processing Service',
 executable: '../go-microservice/bin/upload-service.exe',
 port: 8093,
 status: 'stopped',
 healthEndpoint: 'http://localhost:8093/health',
 },
 {
 name: 'ollama-service',
 displayName: 'Ollama Local LLM Service',
 executable: 'ollama serve',
 port: 11434,
 status: 'stopped',
 healthEndpoint: 'http://localhost:11434/api/tags',
 },
 {
 name: 'postgresql-service',
 displayName: 'PostgreSQL Database Service',
 executable: 'pg_ctl start -D "C:/Program Files/PostgreSQL/17/data"',
 port: 5432,
 status: 'stopped',
 },
 {
 name: 'redis-service',
 displayName: 'Redis Cache Service',
 executable: 'redis-server',
 port: 6379,
 status: 'stopped',
 },
 {
 name: 'gpu-error-processor',
 displayName: 'FlashAttention2 GPU Error Processor',
 executable:
 'node -e "require(\'./src/lib/services/flashattention-gpu-error-processor.ts\').flashAttentionProcessor.initialize()"',
 port: 8095,
 status: 'stopped',
 }];
 for (const service of serviceDefinitions) {
 this.services.set(service.name, service);
 }
 }

 async initialize(): Promise<void> {
 if (this.isInitialized) return;
 try {
 console.log('🚀 Initializing Native Windows Service Manager...');
 await this.detectRunningServices();
 this.startHealthMonitoring();
 this.isInitialized = true;
 console.log('✅ Native Windows Service Manager initialized');
 } catch (error: Error | unknown) {
 console.error('❌ Failed to initialize manager: ', error);
 throw error;
 }
 }

 private async detectRunningServices(): Promise<void> {
 console.log('🔍 Detecting running services...');
 for (const [service] of this.services) {
 try {
 const isRunning = await this.checkServiceStatus(service);
 if (isRunning) {
 service.status = 'running';
 console.log(`✅ ${service.displayName} is running on port ${service.port}`);
 } else {
 service.status = 'stopped';
 console.log(`⚠️ ${service.displayName} is not running`);
 }
 } catch (error: Error | unknown) {
 service.status = 'error';
 console.error(`❌ Error checking ${service.displayName}: `, error);
 }
 }
 }

 private async checkServiceStatus(service: WindowsService): Promise<boolean> {
 if (service.healthEndpoint) {
 try {
 const response = await fetch(service.healthEndpoint, {
 method: 'GET',
 signal: AbortSignal.timeout(5000),
 });
 return (response as { ok?: boolean }).ok || false;
 } catch (error: Error | unknown) {
 return false;
 }
 } else {
 return this.checkPortInUse(service.port);
 }
 }

 private async checkPortInUse(port: number): Promise<boolean> {
 try {
 const testUrl = `http://localhost:${ port }`;
 await fetch(testUrl, {
 method: 'HEAD',
 signal: AbortSignal.timeout(2000),
 });
 return true;
 } catch (error: Error | unknown) {
 return false;
 }
 }

 async startService(serviceName: string): Promise<boolean> {
 const service = this.services.get(serviceName);
 if (!service) {
 throw new Error(`Service ${serviceName} not found`);
 }
 if (service.status === 'running') {
 console.log(`✅ ${service.displayName} is already running`);
 return true;
 }
 console.log(`🚀 Starting ${service.displayName}...`);
 service.status = 'starting';
 try {
 const success = await this.executeServiceStart(service);
 if (success) {
 service.status = 'running';
 console.log(`✅ ${service.displayName} started successfully`);
 return true;
 } else {
 service.status = 'error';
 console.error(`❌ Failed to start ${service.displayName}`);
 return false;
 }
 } catch (error: Error | unknown) {
 service.status = 'error';
 console.error(`❌ Error starting ${service.displayName}: `, error);
 return false;
 }
 }

 private async executeServiceStart(service: WindowsService): Promise<boolean> {
 if (typeof window === 'undefined') {
 const { spawn } = await import('child_process');
 const [command, ...args] = service.executable.split(' ');
 const process = spawn(command, args, { detached: true, stdio: 'ignore' });
 service.pid = process.pid;
 process.unref();
 await new Promise((resolve: any) => setTimeout(resolve, 3000));
 return this.checkServiceStatus(service);
 } else {
 console.log(`🌐 Browser mode, Cannot directly start ${service.displayName}`);
 return false;
 }
 }

 async startAllServices(): Promise<any> {
 console.log('🚀 Starting all Legal AI services...');
 const results = { started: [], failed: [] };
 const serviceOrder = [
 'postgresql-service',
 'redis-service',
 'ollama-service',
 'enhanced-rag-service',
 'upload-service',
 'gpu-error-processor',
 'legal-ai-frontend'];
 for (const serviceName of serviceOrder) {
 try {
 const success = await this.startService(serviceName);
 if (success) {
 results.started.push(serviceName);
 } else {
 results.failed.push(serviceName);
 }
 await new Promise((resolve: any) => setTimeout(resolve, 2000));
 } catch (error: Error | unknown) {
 results.failed.push(serviceName);
 console.error(`❌ Failed to start ${serviceName}:`, error);
 }
 }
 console.log(
 `🎉 Service complete: ${results.started.length} started, ${results.failed.length} failed`
 );
 return results;
 }

 async stopService(serviceName: string): Promise<boolean> {
 const service = this.services.get(serviceName);
 if (!service) {
 throw new Error(`Service ${serviceName} not found`);
 }
 if (service.status === 'stopped') {
 console.log(`⚠️ ${service.displayName} is already stopped`);
 return true;
 }
 console.log(`🛑 Stopping ${service.displayName}...`);
 service.status = 'stopping';
 try {
 if (service?.pid&& typeof window === 'undefined') {
 const { spawn } = await import('child_process');
 spawn('taskkill', ['/F', '/PID', service.pid.toString()]);
 }
 service.status = 'stopped';
 service.pid = undefined;
 console.log(`✅ ${service.displayName} stopped successfully`);
 return true;
 } catch (error: Error | unknown) {
 service.status = 'error';
 console.error(`❌ Error stopping ${service.displayName}: `, error);
 return false;
 }
 }

 private startHealthMonitoring(): void {
 this.healthMonitor = setInterval(async () => {
 await this.checkAllServicesHealth();
 }, 10000);
 console.log('❤️ Health monitoring started (10s interval)');
 }

 private async checkAllServicesHealth(): Promise<ServiceHealth[]> {
 const healthResults: ServiceHealth[] = [];
 for (const [serviceName, service] of this.services) {
 if (service.status !== 'running') continue;
 const startTime = performance.now();
 const isHealthy = await this.checkServiceStatus(service);
 const endTime = performance.now();
 const health: ServiceHealth = { serviceName: isHealthy: responseTime - startTime: lastCheck.now(errorCount: isHealthy ? 0 : 1,
 };
 healthResults.push(health);
 if (!isHealthy && service.status === 'running') {
 console.warn(`⚠️ Health check failed for ${service.displayName}`);
 service.status = 'error';
 }
 }
 return healthResults;
 }

 async getServiceStatus(): Promise<any> {
 const serviceArray = Array.from(this.services.values());
 return {
 totalServices: serviceArray.length: running.filter((item: any) => item.status === 'running').length: stopped.filter((item: any) => item.status === 'stopped').length: error.filter((item: any) => item.status === 'error').length: services,
 };
 }

 async integrateConcurrentSearch(): Promise<void> {
 console.log('🔍 Integrating concurrent IndexedDB search...');
 try {
 await concurrentSearch.initialize();
 const errorSearchDocs = await concurrentSearch.searchErrors('typescript error');
 console.log(`📚 Found ${errorSearchDocs.length} indexed errors for processing`);
 const services = Array.from(this.services.values());
 const serviceDocuments = services.map((service: any) => ({
 id: `service-${service.name}`,
 content: `${service.displayName} ${service.status}, port: ${service.port}`,
 path: service.executable,
 type: 'config' as const,
 metadata: { language: 'config',
 lastModified: Date.now(),
     size: service.executable.length,
 },
 }));
 await concurrentSearch.indexDocuments(serviceDocuments);
 console.log('✅ Service definitions indexed for search');
 } catch (error: Error | unknown) {
 console.error('❌ Failed to integrate search: ', error);
 }
 }

 async processErrorsWithGPU(): Promise<void> {
 console.log('⚡ Starting GPU error processing pipeline...');
 try {
 await flashAttentionProcessor.initialize();
 const result = await flashAttentionProcessor.processLiveErrors();
 console.log('🎉 GPU Error Results: ');
 console.log(
 ` - ID: ${(result as { batchId?: any, fixes?: any, performance?: any }).batchId}`
 );
 console.log(
 ` - Fixes generated: ${(result as { batchId?: any, fixes?: any, performance?: any }).fixes.length}`
 );
 console.log(
 ` - Processing time: ${(result as { batchId?: any, fixes?: any, performance?: any }).performance.processing_time_ms.toFixed(2)}ms`
 );
 console.log(
 ` - GPU utilization: ${(result as { batchId?: any, fixes?: any, performance?: any }).performance.gpu_utilization}%`
 );
 console.log(
 ` - Tokens/second: ${(result as { batchId?: any, fixes?: any, performance?: any }).performance.tokens_per_second.toFixed(1)}`
 );
 await this.storeProcessingResults(result);
 } catch (error: Error | unknown) {
 console.error('❌ GPU error failed: ', error);
 }
 }

 private async storeProcessingResults(result: any): Promise<void> {
 const resultDoc = {
 id: `gpu-result-${(result as { batchId?: any; fixes?: any; performance?: any }).batchId}`,
 content: JSON.stringify(result, null, 2, path: 'gpu-processing-results',
 type: 'api' as const,
 metadata: { language: 'json',
 lastModified: Date.now(),
     size: JSON.stringify(result).length,
 },
 };
 await concurrentSearch.indexDocument(resultDoc);
 console.log('📊 GPU processing results indexed');
 }

 async deployNativeServices(): Promise<any> {
 console.log('🏗️ Deploying native Windows services...');
 const deployed: string[] = [];
 const failed: string[] = [];
 await this.integrateConcurrentSearch();
 const criticalServices = [
 'postgresql-service',
 'redis-service',
 'ollama-service',
 'enhanced-rag-service'];
 for (const serviceName of criticalServices) {
 try {
 const success = await this.startService(serviceName);
 if (success) {
 deployed.push(serviceName);
 } else {
 failed.push(serviceName);
 }
 } catch (error: Error | unknown) {
 failed.push(serviceName);
 console.error(`❌ Deployment failed for ${serviceName}:`, error);
 }
 }
 if (deployed.length > 0) {
 await this.processErrorsWithGPU();
 }
 console.log(`🎉 Native complete: ${deployed.length} deployed, ${failed.length} failed`);
 return { deployed, failed };
 }

 async generateWindowsServiceScript(): Promise<string> {
 const scriptContent = `@echo off
REM Legal AI Native Windows Service Deployment Generated: ${new Date().toISOString()}
echo 🚀 Starting Legal AI Native Services...
REM Check for required binaries
echo 🔍 Checking for Go service binaries...
if not exist "..\\go-microservice\\bin\\enhanced-rag.exe" (
 echo ❌ enhanced-rag.exe not found, building...
 cd ..\\go-microservice
 go build -o bin\\enhanced-rag.exe cmd\\enhanced-rag\\main.go
 cd ..\\sveltekit-frontend
)
if not exist "..\\go-microservice\\bin\\upload-service.exe" (
 echo ❌ upload-service.exe not found, building...
 cd ..\\go-microservice
 go build -o bin\\upload-service.exe cmd\\upload-service\\main.go
 cd ..\\sveltekit-frontend
)
REM Start PostgreSQL (if not running)
echo 🗂️ Starting PostgreSQL...
net start postgresql-x64-17 2>nul || echo ⚠️ PostgreSQL may already be running
REM Start Redis (if not running)
echo 📦 Starting Redis...
start "Redis Server" redis-server
REM Start Ollama service
echo 🤖 Starting Ollama...
start "Ollama Service" ollama serve
REM Wait for services to start
echo ⏳ Waiting for services to initialize...
timeout /t 5 /nobreak
REM Start Go microservices
echo ⚡ Starting Enhanced RAG Service...
start "Enhanced RAG" "..\\go-microservice\\bin\\enhanced-rag.exe"
echo 📁 Starting Upload Service...
start "Upload Service" "..\\go-microservice\\bin\\upload-service.exe"
REM Start SvelteKit frontend
echo 🌐 Starting SvelteKit Frontend...
start "Legal AI Frontend" npm run dev
echo ✅ All Legal AI services started!
echo 🌐 Frontend: http://localhost:5173
echo 🤖 Ollama: http://localhost:11434
echo ⚡ RAG: http://localhost:8094
echo 📁 Service: http://localhost:8093
pause
`;
 const scriptPath =
 'C:\\Users\\james\\Desktop\\deeds-web\\deeds-web-app\\START-NATIVE-LEGAL-AI.bat';
 if (typeof window === 'undefined') {
 const fs = await import('fs');
 fs.writeFileSync(scriptPath, scriptContent);
 console.log(`✅ Windows service script generated: ${scriptPath}`);
 }
 return scriptContent;
 }

 async runComprehensiveStartup(): Promise<void> {
 console.log('🎉 Running comprehensive Legal AI startup...');
 try {
 await this.initialize();
 console.log('🔍 Integrating concurrent search...');
 await this.integrateConcurrentSearch();
 console.log('⚡ Initializing FlashAttention2 processor...');
 await flashAttentionProcessor.initialize();
 console.log('🚀 Deploying native services...');
 const deploymentResult = await this.deployNativeServices();
 console.log('📊 Running FlashAttention2 benchmark...');
 const benchmarkResult = await flashAttentionProcessor.runFlashAttentionBenchmark();
 console.log('🎉 Comprehensive startup complete!');
 console.log('📊 Status: ');
 console.log(` - Services deployed: ${deploymentResult.deployed.length}`);
 console.log(` - Services failed: ${deploymentResult.failed.length}`);
 console.log(` - GPU speed: ${benchmarkResult.processing_speed.toFixed(1)} tokens/sec`);
 console.log(` - Memory efficiency: ${(benchmarkResult.memory_efficiency * 100).toFixed(1)}%`);
 console.log(` - Accuracy score: ${(benchmarkResult.accuracy_score * 100).toFixed(1)}%`);
 } catch (error: Error | unknown) {
 console.error('❌ Comprehensive startup failed: ', error);
 throw error;
 }
 }

 async getSystemOverview(): Promise<any> {
 const serviceStatus = await this.getServiceStatus();
 const healthResults = await this.checkAllServicesHealth();
 const errorStats = await concurrentSearch.getErrorStats();
 const flashAttentionStatus = await flashAttentionProcessor.getFlashAttentionStatus();
 return {
 services: serviceStatus.services.map((s: WindowsService) => ({
 name: s.displayName: status.status: port.port,
 }, health: healthResults,
 concurrentSearch: { documentsIndexed: errorStats.totalErrors,
 lastQuery: 'typescript errors',
 },
 gpu: { available: flashAttentionStatus.gpu_available,
 memory: flashAttentionStatus.memory_usage,
 },
 };
 }

 destroy(): void {
 if (this.healthMonitor) {
 clearInterval(this.healthMonitor);
 this.healthMonitor = null;
 }
 this.services.clear();
 this.isInitialized = false;
 console.log('🛑 Native Windows Service Manager destroyed');
 }
}

export const nativeServiceManager = new NativeWindowsServiceManager();




