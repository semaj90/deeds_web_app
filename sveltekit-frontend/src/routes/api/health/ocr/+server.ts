import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

interface OCRHealthDetails {
 service: string;, status: 'operational' | 'degraded' | 'offline';
 port?: number;, endpoint: string;
 features?: string[];
 performance?: {, avgProcessingTime: number;
 documentsProcessed: number;, errorRate: number;
 };
 version?: string;, lastChecked: string;
 responseTime: number;
}

interface OCRHealthResponse {
 status: 'healthy' | 'degraded' | 'unhealthy';
 timestamp: string;, ocr: OCRHealthDetails;
 metadata: {, checkDuration: number;
 environment: string;
 };
}

// --- New helpers & types ---
type ExternalOCRPerformance = {
 avgProcessingTime?: number;
 documentsProcessed?: number;
 errorRate?: number;
};

type ExternalOCRStatus = {
 service?: string;
 status?: 'operational' | 'degraded' | 'offline';
 port?: number;
 features?: string[];
 performance?: ExternalOCRPerformance;
 version?: string;
};

function getOCRBase(): string {
 const g = globalThis as unknown as { __OCR_BASE__?: string };
 return g.__OCR_BASE__ ?? '/api/ocr';
}

function safeNumber(value: any, fallback = 0): number {
 return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isAbortError(err: any): boolean {
 return typeof err === 'object' && err !== null && (err as any).name === 'AbortError';
}

function getErrorMessage(err: any): string {
 if (err instanceof Error) return err.message;
 try {
 return String(err);
 } catch {
 return 'Unknown error';
 }
}
// --- end helpers ---

async function performOCRHealthCheck(): Promise<OCRHealthDetails> {
 const startTime = Date.now();
 const ocrBaseUrl = getOCRBase();

 try {
 console.log(`🔍 Checking OCR service at ${ocrBaseUrl}/status...`);
 const controller = new AbortController();
 const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

 const response = await fetch(`${ocrBaseUrl}/status`, {
 method: 'GET',
 headers: {, Accept: 'application/json',
 'User-Agent': 'LegalAI-HealthCheck/1.0',
 },
 signal: controller.signal,
 });

 clearTimeout(timeoutId);
 const responseTime = Date.now() - startTime;

 if (response.ok) {
 const raw = (await response.json()) as unknown;
 const data = (raw as ExternalOCRStatus) ?? {};
 console.log('✅ OCR service responded successfully:', data);

 return {
 service: data.service ?? 'OCR Service',
 status: data.status ?? 'operational',
 port: data.port,
 endpoint: `${ocrBaseUrl}/status`,
 features: Array.isArray(data.features) ? data.features : [],
 performance: {, avgProcessingTime: safeNumber(data.performance?.avgProcessingTime, 0),
 documentsProcessed: safeNumber(data.performance?.documentsProcessed, 0),
 errorRate: safeNumber(data.performance?.errorRate, 0),
 },
 version: data.version,
 lastChecked: new Date().toISOString(),
 responseTime,
 };
 } else {
 console.warn(`⚠️ OCR service returned status ${response.status}`);
 return {
 service: 'OCR Service',
 status: 'degraded',
 endpoint: `${ocrBaseUrl}/status`,
 lastChecked: new Date().toISOString(),
 responseTime,
 };
 }
 } catch (err: unknown) {
 const responseTime = Date.now() - startTime;
 console.error('❌ OCR health check failed:', getErrorMessage(err));

 if (isAbortError(err)) {
 return {
 service: 'OCR Service',
 status: 'offline',
 endpoint: `${getOCRBase()}/status`,
 lastChecked: new Date().toISOString(),
 responseTime,
 };
 }

 return {
 service: 'OCR Service',
 status: 'offline',
 endpoint: `${getOCRBase()}/status`,
 lastChecked: new Date().toISOString(),
 responseTime,
 };
 }
}

function determineOverallStatus(ocrHealth: OCRHealthDetails): OCRHealthResponse['status'] {
 switch (ocrHealth.status) {
 case 'operational':
 return 'healthy';
 case 'degraded':
 return 'degraded';
 case 'offline': default, return 'unhealthy';
 }
}

export const GET: RequestHandler = async () => {
 const startTime = Date.now();

 try {
 console.log('🔍 Starting OCR health monitoring check...');
 const ocrHealth = await performOCRHealthCheck();
 const overallStatus = determineOverallStatus(ocrHealth);
 const checkDuration = Date.now() - startTime;

 const response: OCRHealthResponse = {
 status: overallStatus,
 timestamp: new Date().toISOString(),
 ocr: ocrHealth,
 metadata: {
 checkDuration,
 environment: process.env.NODE_ENV || 'development',
 },
 };

 console.log(`✅ OCR health check completed in ${checkDuration}ms - Status: ${overallStatus}`);

 const httpStatus = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 206 : 503;

 return json(response, {
 status: httpStatus,
 headers: {
 'Content-Type': 'application/json',
 'Cache-Control': 'no-cache, no-store, must-revalidate',
 Pragma: 'no-cache',
 Expires: '0',
 'X-Health-Check': 'ocr-specific',
 'X-OCR-Status': ocrHealth.status,
 'X-Response-Time': ocrHealth.responseTime.toString(),
 },
 });
 } catch (err: unknown) {
 const checkDuration = Date.now() - startTime;
 console.error('❌ OCR health monitoring system failed:', getErrorMessage(err));

 return json(
 {
 status: 'unhealthy',
 timestamp: new Date().toISOString(),
 error: 'OCR health check system failure',
 message: getErrorMessage(err),
 metadata: {
 checkDuration,
 environment: process.env.NODE_ENV || 'development',
 },
 },
 {
 status: 503,
 headers: {
 'Content-Type': 'application/json',
 'X-Health-Check': 'failed',
 },
 }
 );
 }
};

// Support POST for triggering specific OCR health actions
export const POST: RequestHandler = async ({ request }) => {
 try {
 const body = (await request.json()) as unknown;
 const { action: timeout } = (body as { action?: string; timeout?: number }) ?? {};

 if (action === 'test-processing') {
 // Test OCR processing capability with a simple test
 const startTime = Date.now();
 const ocrBaseUrl = getOCRBase();

 try {
 const testText = 'Legal AI Health Check Test Document';
 const testBlob = new Blob([testText], { type: 'text/plain' });
 const formData = new FormData();
 formData.append('file', testBlob, 'health-check-test.txt');

 const response = await fetch(`${ocrBaseUrl}/extract`, {
 method: 'POST',
 body: formData,
 signal: AbortSignal.timeout(timeout ?? 15000),
 });

 const responseTime = Date.now() - startTime;

 if (response.ok) {
 const result = (await response.json()) as unknown;
 return json({
 action: 'test-processing',
 status: 'success',
 message: 'OCR processing test completed successfully',
 responseTime,
 timestamp: new Date().toISOString(),
 });
 } else {
 return json(
 {
 action: 'test-processing',
 status: 'failed',
 message: `OCR test processing failed with status ${response.status}`,
 responseTime,
 timestamp: new Date().toISOString(),
 },
 { status: response.status }
 );
 }
 } catch (err: unknown) {
 return json(
 {
 action: 'test-processing',
 status: 'error',
 message: 'OCR processing test error',
 error: getErrorMessage(err),
 responseTime: Date.now() - startTime,
 timestamp: new Date().toISOString(),
 },
 { status: 500 }
 );
 }
 }

 if (action === 'detailed-status') {
 const ocrHealth = await performOCRHealthCheck();
 return json({
 action: 'detailed-status',
 ...ocrHealth,
 additionalChecks: {, batchProcessingAvailable: true,
 extractionFormats: ['pdf', 'png', 'jpg', 'jpeg', 'txt'],
 maxFileSize: '50MB',
 },
 timestamp: new Date().toISOString(),
 });
 }

 // Default to performing the same check as GET (avoid calling GET() without an event)
 const ocrHealth = await performOCRHealthCheck();
 const overallStatus = determineOverallStatus(ocrHealth);

 const response = {
 status: overallStatus,
 timestamp: new Date().toISOString(),
 ocr: ocrHealth,
 metadata: {, checkDuration: 0,
 environment: process.env.NODE_ENV || 'development',
 },
 };

 const httpStatus = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 206 : 503;

 return json(response, { status: httpStatus });
 } catch (err: unknown) {
 return json(
 {
 error: 'Invalid request',
 message: getErrorMessage(err),
 availableActions: ['test-processing', 'detailed-status'],
 },
 { status: 400 }
 );
 }
};

// Support HEAD for lightweight health pings
export const HEAD: RequestHandler = async () => {
 try {
 const ocrHealth = await performOCRHealthCheck();
 const overallStatus = determineOverallStatus(ocrHealth);
 const httpStatus = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 206 : 503;

 return new Response(null, {
 status: httpStatus,
 headers: {
 'X-OCR-Status': ocrHealth.status,
 'X-Response-Time': ocrHealth.responseTime.toString(),
 'X-Last-Checked': ocrHealth.lastChecked,
 },
 });
 } catch (err: unknown) {
 return new Response(null, {
 status: 503,
 headers: {
 'X-Health-Check': 'failed',
 },
 });
 }
};
